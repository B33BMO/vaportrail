import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { TranscriptFile } from '../discover.js';
import { ParseOptions } from '../parse.js';
import { Session, emptyTokens } from '../types.js';
import { SourceDef } from './index.js';

function normalizeTool(name: string): string {
  switch (name) {
    case 'run_shell_command':
      return 'Bash';
    case 'write_file':
      return 'Write';
    case 'replace':
      return 'Edit';
    case 'read_file':
    case 'read_many_files':
      return 'Read';
    case 'list_directory':
      return 'List';
    case 'glob':
      return 'Glob';
    case 'search_file_content':
      return 'Grep';
    case 'web_fetch':
      return 'WebFetch';
    case 'google_web_search':
      return 'WebSearch';
    case 'save_memory':
      return 'SaveMemory';
    default:
      return name;
  }
}

/** Gemini CLI names project dirs sha256(<project path>). Reverse it by hashing likely paths. */
let hashMap: Map<string, string> | undefined;

function candidateDirs(): string[] {
  const home = homedir();
  const out = [home, process.cwd()];
  const addChildren = (dir: string, depth: number): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (name.startsWith('.') || name === 'node_modules') continue;
      const full = join(dir, name);
      try {
        if (!statSync(full).isDirectory()) continue;
      } catch {
        continue;
      }
      out.push(full);
      if (depth > 1) addChildren(full, depth - 1);
    }
  };
  addChildren(home, 2);
  return out;
}

function resolveProjectHash(hash: string): string | undefined {
  if (!hashMap) {
    hashMap = new Map();
    for (const dir of candidateDirs()) {
      hashMap.set(createHash('sha256').update(dir).digest('hex'), dir);
    }
  }
  return hashMap.get(hash);
}

async function parseGeminiSession(file: string, opts: ParseOptions): Promise<Session | null> {
  let data: any;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
  if (!data || !Array.isArray(data.messages)) return null;

  const projectHash: string = typeof data.projectHash === 'string' ? data.projectHash : basename(dirname(dirname(file)));
  const s: Session = {
    id: typeof data.sessionId === 'string' ? data.sessionId : basename(file, '.json'),
    source: 'gemini',
    file,
    project: resolveProjectHash(projectHash) ?? '',
    startedAt: typeof data.startTime === 'string' ? data.startTime : undefined,
    endedAt: typeof data.lastUpdated === 'string' ? data.lastUpdated : undefined,
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
  const models = new Set<string>();
  const argPaths: string[] = [];

  for (const m of data.messages) {
    if (!m) continue;
    const ts: string | undefined = typeof m.timestamp === 'string' ? m.timestamp : undefined;
    if (m.type === 'user') {
      const text = typeof m.content === 'string' ? m.content.trim() : '';
      if (!text) continue;
      s.prompts++;
      if (!s.firstPrompt) s.firstPrompt = text;
      if (opts.withEvents) s.events.push({ kind: 'prompt', timestamp: ts, text, sidechain: false });
      continue;
    }
    if (m.type !== 'gemini') continue;
    s.turns++;
    if (ts) {
      const day = ts.slice(0, 10);
      s.turnsByDay[day] = (s.turnsByDay[day] ?? 0) + 1;
    }
    const model: string | undefined = typeof m.model === 'string' ? m.model : undefined;
    if (model) models.add(model);
    const tok = m.tokens;
    if (tok) {
      const add = {
        input: Math.max(0, (tok.input ?? 0) - (tok.cached ?? 0)),
        output: (tok.output ?? 0) + (tok.thoughts ?? 0),
        cacheRead: tok.cached ?? 0,
        cacheWrite: 0,
      };
      s.tokens.input += add.input;
      s.tokens.output += add.output;
      s.tokens.cacheRead += add.cacheRead;
      if (model) {
        const mt = (s.tokensByModel[model] ??= { ...emptyTokens(), turns: 0 });
        mt.input += add.input;
        mt.output += add.output;
        mt.cacheRead += add.cacheRead;
        mt.turns++;
      }
    }
    const text = typeof m.content === 'string' ? m.content.trim() : '';
    if (text && opts.withEvents) s.events.push({ kind: 'assistant', timestamp: ts, text, sidechain: false });
    if (Array.isArray(m.toolCalls)) {
      for (const call of m.toolCalls) {
        if (!call || typeof call.name !== 'string') continue;
        const name = normalizeTool(call.name);
        s.toolCounts[name] = (s.toolCounts[name] ?? 0) + 1;
        s.toolCallsTotal++;
        const args = call.args && typeof call.args === 'object' ? call.args : {};
        const fileArg = [args.file_path, args.path, args.absolute_path].find((v: unknown) => typeof v === 'string') as
          | string
          | undefined;
        if (fileArg?.startsWith('/')) argPaths.push(dirname(fileArg));
        const dirArg = [args.directory, args.dir, args.workdir].find((v: unknown) => typeof v === 'string') as
          | string
          | undefined;
        if (dirArg?.startsWith('/')) argPaths.push(dirArg, dirArg); // explicit dirs outweigh file parents
        if (['Write', 'Edit'].includes(name) && fileArg) {
          s.filesWritten[fileArg] = (s.filesWritten[fileArg] ?? 0) + 1;
        }
        if (opts.withEvents) {
          let detail = [args.command, fileArg, args.pattern, args.query, args.url, args.prompt]
            .concat(Object.values(args))
            .find((v: unknown): v is string => typeof v === 'string');
          if (detail) detail = detail.replace(/\s+/g, ' ').trim();
          s.events.push({ kind: 'tool', timestamp: ts, tool: { name, detail, file: fileArg }, sidechain: false });
        }
      }
    }
  }

  // hash reversal failed: fall back to the most common dir seen in tool args
  if (!s.project && argPaths.length > 0) {
    const counts = new Map<string, number>();
    for (const dir of argPaths) {
      counts.set(dir, (counts.get(dir) ?? 0) + 1);
    }
    s.project = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  }
  if (!s.project) s.project = `#${projectHash.slice(0, 8)}`;
  s.models = [...models];
  return s;
}

export const geminiSource: SourceDef = {
  name: 'gemini',
  root(override?: string): string {
    if (override) return override;
    return join(homedir(), '.gemini', 'tmp');
  },
  discover(root: string): TranscriptFile[] {
    const out: TranscriptFile[] = [];
    let hashes: string[];
    try {
      hashes = readdirSync(root);
    } catch {
      return [];
    }
    for (const h of hashes) {
      const chats = join(root, h, 'chats');
      let files: string[];
      try {
        files = readdirSync(chats);
      } catch {
        continue;
      }
      // gemini checkpoints a session into multiple files; keep the most complete per session
      const bySession = new Map<string, TranscriptFile>();
      for (const name of files) {
        if (!name.endsWith('.json')) continue;
        const full = join(chats, name);
        let st;
        try {
          st = statSync(full);
        } catch {
          continue;
        }
        const key = /-([0-9a-f]{8})\.json$/.exec(name)?.[1] ?? name;
        const prev = bySession.get(key);
        if (!prev || st.size > (prev.size ?? 0)) {
          bySession.set(key, { file: full, mtimeMs: st.mtimeMs, size: st.size });
        }
      }
      out.push(...bySession.values());
    }
    out.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return out;
  },
  parse: parseGeminiSession,
};
