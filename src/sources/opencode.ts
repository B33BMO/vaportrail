import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { TranscriptFile } from '../discover.js';
import { ParseOptions } from '../parse.js';
import { Session, emptyTokens } from '../types.js';
import { SourceDef } from './index.js';

function normalizeTool(name: string): string {
  switch (name) {
    case 'bash':
      return 'Bash';
    case 'edit':
      return 'Edit';
    case 'write':
      return 'Write';
    case 'read':
      return 'Read';
    case 'grep':
      return 'Grep';
    case 'glob':
      return 'Glob';
    case 'list':
      return 'List';
    case 'patch':
      return 'Patch';
    case 'todowrite':
      return 'TodoWrite';
    case 'todoread':
      return 'TodoRead';
    case 'webfetch':
      return 'WebFetch';
    case 'websearch':
      return 'WebSearch';
    case 'task':
      return 'Task';
    case 'skill':
      return 'Skill';
    default:
      return name.charAt(0).toUpperCase() + name.slice(1);
  }
}

function readJson(path: string): any {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return undefined;
  }
}

function listJson(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((n) => n.endsWith('.json'))
      .sort()
      .map((n) => join(dir, n));
  } catch {
    return [];
  }
}

function iso(ms: unknown): string | undefined {
  return typeof ms === 'number' && ms > 0 ? new Date(ms).toISOString() : undefined;
}

async function parseOpencodeSession(infoPath: string, opts: ParseOptions): Promise<Session | null> {
  const info = readJson(infoPath);
  if (!info || typeof info.id !== 'string') return null;
  // infoPath = <storage>/session/<projectID>/<ses>.json
  const storage = dirname(dirname(dirname(infoPath)));

  const s: Session = {
    id: info.id,
    source: 'opencode',
    file: infoPath,
    project: typeof info.directory === 'string' ? info.directory : '',
    title: typeof info.title === 'string' ? info.title : undefined,
    version: typeof info.version === 'string' ? info.version : undefined,
    startedAt: iso(info.time?.created),
    endedAt: iso(info.time?.updated),
    prompts: 0,
    turns: 0,
    toolCounts: {},
    toolCallsTotal: 0,
    tokens: emptyTokens(),
    tokensByModel: {},
    turnsByDay: {},
    filesWritten: {},
    models: [],
    isAgent: typeof info.parentID === 'string',
    events: [],
  };
  const models = new Set<string>();

  for (const msgPath of listJson(join(storage, 'message', info.id))) {
    const msg = readJson(msgPath);
    if (!msg || typeof msg.id !== 'string') continue;
    const ts = iso(msg.time?.created);
    const parts = listJson(join(storage, 'part', msg.id)).map(readJson).filter(Boolean);

    if (msg.role === 'user') {
      const text = parts
        .filter((p) => p.type === 'text' && typeof p.text === 'string')
        .map((p) => p.text)
        .join('\n')
        .trim();
      if (!text) continue;
      s.prompts++;
      if (!s.firstPrompt) s.firstPrompt = text;
      if (opts.withEvents) s.events.push({ kind: 'prompt', timestamp: ts, text, sidechain: false });
      continue;
    }

    if (msg.role !== 'assistant') continue;
    s.turns++;
    if (ts) {
      const day = ts.slice(0, 10);
      s.turnsByDay[day] = (s.turnsByDay[day] ?? 0) + 1;
    }
    const model: string | undefined = typeof msg.modelID === 'string' ? msg.modelID : undefined;
    if (model) models.add(model);
    const tok = msg.tokens;
    if (tok) {
      const add = {
        input: tok.input ?? 0,
        output: (tok.output ?? 0) + (tok.reasoning ?? 0),
        cacheRead: tok.cache?.read ?? 0,
        cacheWrite: tok.cache?.write ?? 0,
      };
      s.tokens.input += add.input;
      s.tokens.output += add.output;
      s.tokens.cacheRead += add.cacheRead;
      s.tokens.cacheWrite += add.cacheWrite;
      if (model) {
        const mt = (s.tokensByModel[model] ??= { ...emptyTokens(), turns: 0 });
        mt.input += add.input;
        mt.output += add.output;
        mt.cacheRead += add.cacheRead;
        mt.cacheWrite += add.cacheWrite;
        mt.turns++;
      }
    }

    for (const p of parts) {
      if (p.type === 'text' && typeof p.text === 'string' && p.text.trim()) {
        if (opts.withEvents) {
          s.events.push({ kind: 'assistant', timestamp: iso(p.time?.start) ?? ts, text: p.text.trim(), sidechain: false });
        }
      } else if (p.type === 'tool' && typeof p.tool === 'string') {
        const name = normalizeTool(p.tool);
        s.toolCounts[name] = (s.toolCounts[name] ?? 0) + 1;
        s.toolCallsTotal++;
        const input = p.state?.input;
        const filePath =
          ['Edit', 'Write', 'Patch'].includes(name) && typeof input?.filePath === 'string' ? input.filePath : undefined;
        if (filePath) s.filesWritten[filePath] = (s.filesWritten[filePath] ?? 0) + 1;
        if (opts.withEvents) {
          let detail: string | undefined;
          if (input && typeof input === 'object') {
            detail = [input.command, input.filePath, input.pattern, input.url, input.description]
              .concat(Object.values(input))
              .find((v): v is string => typeof v === 'string');
          }
          if (detail) detail = detail.replace(/\s+/g, ' ').trim();
          s.events.push({
            kind: 'tool',
            timestamp: iso(p.state?.time?.start) ?? ts,
            tool: { name, detail, file: filePath },
            sidechain: false,
          });
        }
      }
    }
  }

  s.models = [...models];
  return s;
}

export const opencodeSource: SourceDef = {
  name: 'opencode',
  root(override?: string): string {
    if (override) return override;
    const data = process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share');
    return join(data, 'opencode', 'storage');
  },
  discover(root: string): TranscriptFile[] {
    // session infos live at <storage>/session/<projectID>/ses_*.json
    const out: TranscriptFile[] = [];
    const sessionRoot = join(root, 'session');
    let level1: string[];
    try {
      level1 = readdirSync(sessionRoot);
    } catch {
      return [];
    }
    for (const entry of level1) {
      const full = join(sessionRoot, entry);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isFile() && entry.endsWith('.json')) {
        out.push({ file: full, mtimeMs: st.mtimeMs, size: st.size });
      } else if (st.isDirectory()) {
        for (const name of readdirSync(full)) {
          if (!name.endsWith('.json')) continue;
          const f = join(full, name);
          try {
            const fst = statSync(f);
            out.push({ file: f, mtimeMs: fst.mtimeMs, size: fst.size });
          } catch {
            /* skip */
          }
        }
      }
    }
    out.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return out;
  },
  parse: parseOpencodeSession,
};
