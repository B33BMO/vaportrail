import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { TranscriptFile } from '../discover.js';
import { ParseOptions } from '../parse.js';
import { Session, emptyTokens } from '../types.js';
import { SourceDef } from './index.js';

const HISTORY_NAME = '.aider.chat.history.md';

/** "12k" / "1.2k" / "850" / "1.5M" → number */
function parseTokenCount(s: string): number {
  const m = /^([\d.,]+)\s*([kM]?)$/.exec(s.trim());
  if (!m) return 0;
  const n = parseFloat(m[1]!.replace(/,/g, ''));
  if (Number.isNaN(n)) return 0;
  return Math.round(n * (m[2] === 'k' ? 1000 : m[2] === 'M' ? 1_000_000 : 1));
}

/** "2025-10-17 12:40:51" (local time) → ISO */
function localToIso(stamp: string): string | undefined {
  const d = new Date(stamp.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

const TOKENS_RE = /Tokens: ([\d.,]+[kM]?) sent(?:[^,]*)?, ([\d.,]+[kM]?) received/;
const APPLIED_RE = /^> Applied edit to (.+?)\s*$/;
const MODEL_RE = /^> Model: (\S+)/;
const VERSION_RE = /^> Aider (v[\d.]+)/;
const COMMIT_RE = /^> Commit (\S+) (.+?)\s*$/;

async function parseAiderHistory(file: string, opts: ParseOptions): Promise<Session[] | null> {
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  const project = dirname(file);
  const sessions: Session[] = [];
  let s: Session | undefined;
  let models: Set<string> = new Set();
  let promptLines: string[] = [];
  let textLines: string[] = [];
  let assistantBlocks = 0;

  const flushPrompt = (): void => {
    if (!s || promptLines.length === 0) return;
    const text = promptLines.join('\n').trim();
    promptLines = [];
    if (!text) return;
    s.prompts++;
    if (!s.firstPrompt) s.firstPrompt = text;
    if (opts.withEvents) s.events.push({ kind: 'prompt', timestamp: s.startedAt, text, sidechain: false });
  };
  const flushText = (): void => {
    if (!s || textLines.length === 0) return;
    const text = textLines.join('\n').trim();
    textLines = [];
    if (!text) return;
    assistantBlocks++;
    if (opts.withEvents) s.events.push({ kind: 'assistant', timestamp: s.startedAt, text, sidechain: false });
  };
  const finishSession = (): void => {
    if (!s) return;
    flushPrompt();
    flushText();
    s.models = [...models];
    // a session with prompts but no token lines still did work; count assistant blocks as turns
    if (s.turns === 0) s.turns = assistantBlocks;
    assistantBlocks = 0;
    sessions.push(s);
    s = undefined;
  };

  for (const line of raw.split('\n')) {
    const started = /^# aider chat started at (.+?)\s*$/.exec(line);
    if (started) {
      finishSession();
      const startedAt = localToIso(started[1]!);
      const id = createHash('sha1').update(`${file}|${started[1]}`).digest('hex').slice(0, 12);
      models = new Set();
      s = {
        id,
        source: 'aider',
        file,
        project,
        startedAt,
        endedAt: startedAt,
        prompts: 0,
        turns: 0,
        toolCounts: {},
        toolCallsTotal: 0,
        tokens: emptyTokens(),
        tokensByModel: {},
        turnsByDay: {},
        filesWritten: {},
        models: [],
        isAgent: false,
        events: [],
      };
      continue;
    }
    if (!s) continue;

    if (line.startsWith('#### ')) {
      flushText();
      promptLines.push(line.slice(5));
      continue;
    }
    if (line.trim() === '####') {
      flushText();
      promptLines.push('');
      continue;
    }

    if (line.startsWith('>')) {
      flushPrompt();
      flushText();
      const model = MODEL_RE.exec(line);
      if (model) {
        models.add(model[1]!);
        continue;
      }
      const version = VERSION_RE.exec(line);
      if (version) {
        s.version = version[1];
        continue;
      }
      const applied = APPLIED_RE.exec(line);
      if (applied) {
        const f = applied[1]!.startsWith('/') ? applied[1]! : join(project, applied[1]!);
        s.filesWritten[f] = (s.filesWritten[f] ?? 0) + 1;
        s.toolCounts['Edit'] = (s.toolCounts['Edit'] ?? 0) + 1;
        s.toolCallsTotal++;
        if (opts.withEvents) {
          s.events.push({ kind: 'tool', timestamp: s.startedAt, tool: { name: 'Edit', detail: applied[1], file: f }, sidechain: false });
        }
        continue;
      }
      const commit = COMMIT_RE.exec(line);
      if (commit) {
        s.toolCounts['Commit'] = (s.toolCounts['Commit'] ?? 0) + 1;
        s.toolCallsTotal++;
        if (opts.withEvents) {
          s.events.push({ kind: 'tool', timestamp: s.startedAt, tool: { name: 'Commit', detail: commit[2] }, sidechain: false });
        }
        continue;
      }
      const tokens = TOKENS_RE.exec(line);
      if (tokens) {
        s.turns++;
        const input = parseTokenCount(tokens[1]!);
        const output = parseTokenCount(tokens[2]!);
        s.tokens.input += input;
        s.tokens.output += output;
        const model = [...models].pop();
        if (model) {
          const mt = (s.tokensByModel[model] ??= { ...emptyTokens(), turns: 0 });
          mt.input += input;
          mt.output += output;
          mt.turns++;
        }
        if (s.startedAt) {
          const day = s.startedAt.slice(0, 10);
          s.turnsByDay[day] = (s.turnsByDay[day] ?? 0) + 1;
        }
        continue;
      }
      continue; // other announcement lines: warnings, file adds, etc.
    }

    if (promptLines.length > 0 && line.trim() === '') {
      flushPrompt();
      continue;
    }
    textLines.push(line);
  }
  finishSession();
  return sessions.length > 0 ? sessions : null;
}

export const aiderSource: SourceDef = {
  name: 'aider',
  root(override?: string): string {
    return override ?? homedir();
  },
  discover(root: string): TranscriptFile[] {
    // aider histories live per-project; check root, its children, and grandchildren
    const out: TranscriptFile[] = [];
    const tryFile = (dir: string): void => {
      const f = join(dir, HISTORY_NAME);
      try {
        const st = statSync(f);
        if (st.isFile()) out.push({ file: f, mtimeMs: st.mtimeMs, size: st.size });
      } catch {
        /* not there */
      }
    };
    tryFile(root);
    tryFile(process.cwd());
    let level1: string[];
    try {
      level1 = readdirSync(root);
    } catch {
      return out;
    }
    for (const name of level1) {
      if (name.startsWith('.') || name === 'node_modules') continue;
      const dir = join(root, name);
      try {
        if (!statSync(dir).isDirectory()) continue;
      } catch {
        continue;
      }
      tryFile(dir);
      let level2: string[];
      try {
        level2 = readdirSync(dir);
      } catch {
        continue;
      }
      for (const sub of level2) {
        if (sub.startsWith('.') || sub === 'node_modules') continue;
        const subdir = join(dir, sub);
        try {
          if (statSync(subdir).isDirectory()) tryFile(subdir);
        } catch {
          /* skip */
        }
      }
    }
    const seen = new Set<string>();
    return out
      .filter((f) => (seen.has(f.file) ? false : (seen.add(f.file), true)))
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
  },
  parse: parseAiderHistory,
};
