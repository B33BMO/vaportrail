import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { basename, join, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { findTranscripts, TranscriptFile } from '../discover.js';
import { ParseOptions } from '../parse.js';
import { Session, emptyTokens } from '../types.js';
import { SourceDef } from './index.js';

const NOISE_TAGS = ['<environment_context>', '<user_instructions>', '<turn_aborted', '<ide_context>', '<permissions'];

function isNoise(text: string): boolean {
  const t = text.trimStart();
  return NOISE_TAGS.some((tag) => t.startsWith(tag));
}

function normalizeTool(name: string): string {
  switch (name) {
    case 'shell':
    case 'shell_command':
    case 'local_shell':
    case 'exec_command':
      return 'Bash';
    case 'apply_patch':
      return 'ApplyPatch';
    case 'update_plan':
      return 'UpdatePlan';
    case 'web_search':
      return 'WebSearch';
    default:
      return name;
  }
}

function parseJsonString(s: unknown): any {
  if (typeof s !== 'string') return undefined;
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

const PATCH_FILE_RE = /^\*\*\* (Update|Add|Delete) File: (.+)$/gm;

function patchFiles(patch: string): { written: string[]; all: string[] } {
  const written: string[] = [];
  const all: string[] = [];
  for (const m of patch.matchAll(PATCH_FILE_RE)) {
    all.push(m[2]!.trim());
    if (m[1] !== 'Delete') written.push(m[2]!.trim());
  }
  return { written, all };
}

function joinedText(content: unknown, types: string[]): string | undefined {
  if (!Array.isArray(content)) return undefined;
  const parts = content
    .filter((b) => b && types.includes(b.type) && typeof b.text === 'string')
    .map((b) => b.text);
  const joined = parts.join('\n').trim();
  return joined.length > 0 ? joined : undefined;
}

async function parseCodexSession(file: string, opts: ParseOptions): Promise<Session | null> {
  const s: Session = {
    id: basename(file, '.jsonl'),
    source: 'codex',
    file,
    project: '',
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
  let lastModel: string | undefined;
  let lastTotals: any;
  let assistantMsgs = 0;
  let sawAnything = false;

  try {
    const rl = createInterface({ input: createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      let e: any;
      try {
        e = JSON.parse(line);
      } catch {
        continue;
      }
      sawAnything = true;
      const ts: string | undefined = typeof e.timestamp === 'string' ? e.timestamp : undefined;
      if (ts) {
        if (!s.startedAt || ts < s.startedAt) s.startedAt = ts;
        if (!s.endedAt || ts > s.endedAt) s.endedAt = ts;
      }
      const p = e.payload;
      if (!p) continue;

      if (e.type === 'session_meta') {
        if (typeof p.id === 'string') s.id = p.id;
        if (typeof p.cwd === 'string') s.project = p.cwd;
        if (typeof p.cli_version === 'string') s.version = p.cli_version;
        if (typeof p.git?.branch === 'string') s.gitBranch = p.git.branch;
        continue;
      }

      if (e.type === 'turn_context') {
        if (typeof p.model === 'string') {
          lastModel = p.model;
          models.add(p.model);
        }
        continue;
      }

      if (e.type === 'event_msg') {
        if (p.type === 'token_count' && p.info) {
          s.turns++;
          if (ts) {
            const day = ts.slice(0, 10);
            s.turnsByDay[day] = (s.turnsByDay[day] ?? 0) + 1;
          }
          if (p.info.total_token_usage) lastTotals = p.info.total_token_usage;
        }
        continue;
      }

      if (e.type !== 'response_item') continue;

      if (p.type === 'message') {
        if (p.role === 'user') {
          const text = joinedText(p.content, ['input_text']);
          if (!text || isNoise(text)) continue;
          s.prompts++;
          if (!s.firstPrompt) s.firstPrompt = text;
          if (opts.withEvents) s.events.push({ kind: 'prompt', timestamp: ts, text, sidechain: false });
        } else if (p.role === 'assistant') {
          const text = joinedText(p.content, ['output_text']);
          if (!text) continue;
          assistantMsgs++;
          if (opts.withEvents) s.events.push({ kind: 'assistant', timestamp: ts, text, sidechain: false });
        }
        continue;
      }

      if (p.type === 'function_call' || p.type === 'custom_tool_call') {
        const name = normalizeTool(typeof p.name === 'string' ? p.name : 'unknown');
        s.toolCounts[name] = (s.toolCounts[name] ?? 0) + 1;
        s.toolCallsTotal++;
        let detail: string | undefined;
        let file: string | undefined;
        const args = parseJsonString(p.arguments) ?? parseJsonString(p.input);
        const rawInput = typeof p.input === 'string' ? p.input : typeof p.arguments === 'string' ? p.arguments : '';
        if (name === 'ApplyPatch') {
          const patchText = typeof args?.input === 'string' ? args.input : rawInput;
          const { written, all } = patchFiles(patchText);
          for (const w of written) {
            const abs = isAbsolute(w) || !s.project ? w : join(s.project, w);
            s.filesWritten[abs] = (s.filesWritten[abs] ?? 0) + 1;
          }
          detail = all.join(', ') || undefined;
          file = written[0];
        } else if (args && typeof args === 'object') {
          const firstString = [args.command, args.query, args.path, args.plan && 'plan']
            .concat(Object.values(args))
            .find((v) => typeof v === 'string');
          detail = firstString as string | undefined;
        }
        if (detail) detail = detail.replace(/\s+/g, ' ').trim();
        if (opts.withEvents) {
          s.events.push({ kind: 'tool', timestamp: ts, tool: { name, detail, file }, sidechain: false });
        }
      }
    }
  } catch {
    // unreadable mid-stream: return what we have
  }

  if (!sawAnything) return null;
  if (s.turns === 0) s.turns = assistantMsgs;
  if (lastTotals) {
    const input = lastTotals.input_tokens ?? 0;
    const cached = lastTotals.cached_input_tokens ?? 0;
    s.tokens.input = Math.max(0, input - cached);
    s.tokens.cacheRead = cached;
    s.tokens.output = lastTotals.output_tokens ?? 0;
    if (lastModel) {
      s.tokensByModel[lastModel] = { ...s.tokens, turns: s.turns };
    }
  }
  s.models = [...models];
  return s;
}

export const codexSource: SourceDef = {
  name: 'codex',
  root(override?: string): string {
    if (override) return override;
    const home = process.env.CODEX_HOME ?? join(homedir(), '.codex');
    return join(home, 'sessions');
  },
  discover(root: string): TranscriptFile[] {
    return findTranscripts(root, 4);
  },
  parse: parseCodexSession,
};
