import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { basename } from 'node:path';
import { Session, SessionEvent, TokenTotals, emptyTokens } from './types.js';

const NOISE_PATTERNS = [
  /^Caveat: The messages below/,
  /^<command-name>/,
  /^<command-message>/,
  /^<local-command-stdout>/,
  /^<bash-input>/,
  /^<bash-stdout/,
  /^<system-reminder>/,
  /^<task-notification>/,
  /^<local-command-caveat>/,
  /^\[Request interrupted/,
];

function isNoisePrompt(text: string): boolean {
  const t = text.trimStart();
  return NOISE_PATTERNS.some((re) => re.test(t));
}

function addUsage(t: TokenTotals, u: any): void {
  t.input += u.input_tokens ?? 0;
  t.output += u.output_tokens ?? 0;
  t.cacheRead += u.cache_read_input_tokens ?? 0;
  t.cacheWrite += u.cache_creation_input_tokens ?? 0;
}

function toolDetail(name: string, input: any): string | undefined {
  if (!input || typeof input !== 'object') return undefined;
  let detail: unknown;
  switch (name) {
    case 'Bash':
      detail = input.command;
      break;
    case 'Read':
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
      detail = input.file_path;
      break;
    case 'Grep':
    case 'Glob':
      detail = input.pattern;
      break;
    case 'Task':
    case 'Agent':
      detail = input.description ?? input.prompt;
      break;
    case 'WebFetch':
      detail = input.url;
      break;
    case 'WebSearch':
      detail = input.query;
      break;
    case 'Skill':
      detail = input.skill;
      break;
    default: {
      const firstString = Object.values(input).find((v) => typeof v === 'string');
      detail = firstString;
    }
  }
  if (typeof detail !== 'string' || !detail) return undefined;
  return detail.replace(/\s+/g, ' ').trim();
}

function extractText(content: unknown): string | undefined {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return undefined;
  const parts: string[] = [];
  for (const block of content) {
    if (block && block.type === 'text' && typeof block.text === 'string') parts.push(block.text);
    else if (block && block.type === 'image') parts.push('[image]');
  }
  const joined = parts.join('\n').trim();
  return joined.length > 0 ? joined : undefined;
}

function hasToolResult(content: unknown): boolean {
  return Array.isArray(content) && content.some((b) => b && b.type === 'tool_result');
}

export interface ParseOptions {
  withEvents?: boolean;
}

export async function parseSession(file: string, opts: ParseOptions = {}): Promise<Session | null> {
  const id = basename(file, '.jsonl');
  const s: Session = {
    id,
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
    isAgent: id.startsWith('agent-'),
    events: [],
  };
  let aiTitle: string | undefined;
  let summaryTitle: string | undefined;
  const seenUsage = new Set<string>();
  const models = new Set<string>();

  let sawAnything = false;
  try {
    const rl = createInterface({
      input: createReadStream(file, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });
    for await (const line of rl) {
      if (!line.trim()) continue;
      let e: any;
      try {
        e = JSON.parse(line);
      } catch {
        continue;
      }
      sawAnything = true;

      if (typeof e.timestamp === 'string') {
        if (!s.startedAt || e.timestamp < s.startedAt) s.startedAt = e.timestamp;
        if (!s.endedAt || e.timestamp > s.endedAt) s.endedAt = e.timestamp;
      }
      if (!s.project && typeof e.cwd === 'string') s.project = e.cwd;
      if (!s.gitBranch && typeof e.gitBranch === 'string' && e.gitBranch) s.gitBranch = e.gitBranch;
      if (typeof e.version === 'string') s.version = e.version;

      if (e.type === 'ai-title' && typeof e.aiTitle === 'string') {
        aiTitle = e.aiTitle;
        continue;
      }
      if (e.type === 'summary' && typeof e.summary === 'string') {
        summaryTitle = e.summary;
        continue;
      }

      if (e.type === 'user') {
        const content = e.message?.content;
        if (e.toolUseResult || hasToolResult(content)) continue;
        const text = extractText(content);
        if (!text || isNoisePrompt(text) || e.isMeta) continue;
        const sidechain = e.isSidechain === true;
        if (!sidechain) {
          s.prompts++;
          if (!s.firstPrompt) s.firstPrompt = text;
        }
        if (opts.withEvents) {
          s.events.push({ kind: 'prompt', timestamp: e.timestamp, text, sidechain });
        }
        continue;
      }

      if (e.type === 'assistant') {
        const m = e.message;
        if (!m) continue;
        const sidechain = e.isSidechain === true;
        const model: string | undefined =
          typeof m.model === 'string' && m.model !== '<synthetic>' ? m.model : undefined;
        if (model) models.add(model);

        const usageKey: string | undefined = m.id ?? e.requestId ?? e.uuid;
        if (m.usage && usageKey && !seenUsage.has(usageKey)) {
          seenUsage.add(usageKey);
          s.turns++;
          addUsage(s.tokens, m.usage);
          if (model) {
            const mt = (s.tokensByModel[model] ??= { ...emptyTokens(), turns: 0 });
            addUsage(mt, m.usage);
            mt.turns++;
          }
          if (typeof e.timestamp === 'string') {
            const day = e.timestamp.slice(0, 10);
            s.turnsByDay[day] = (s.turnsByDay[day] ?? 0) + 1;
          }
        }

        if (Array.isArray(m.content)) {
          for (const block of m.content) {
            if (!block) continue;
            if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
              if (opts.withEvents) {
                s.events.push({ kind: 'assistant', timestamp: e.timestamp, text: block.text.trim(), sidechain });
              }
            } else if (block.type === 'tool_use' && typeof block.name === 'string') {
              s.toolCounts[block.name] = (s.toolCounts[block.name] ?? 0) + 1;
              s.toolCallsTotal++;
              const filePath =
                ['Edit', 'Write', 'NotebookEdit'].includes(block.name) &&
                typeof block.input?.file_path === 'string'
                  ? block.input.file_path
                  : undefined;
              if (filePath) s.filesWritten[filePath] = (s.filesWritten[filePath] ?? 0) + 1;
              if (opts.withEvents) {
                s.events.push({
                  kind: 'tool',
                  timestamp: e.timestamp,
                  tool: { name: block.name, detail: toolDetail(block.name, block.input), file: filePath },
                  sidechain,
                });
              }
            }
          }
        }
        continue;
      }
    }
  } catch {
    // unreadable file or stream error mid-way: return what we have, if anything
  }

  if (!sawAnything) return null;
  s.title = aiTitle ?? summaryTitle;
  s.models = [...models];
  return s;
}

export function stripEvents(s: Session): Omit<Session, 'events'> {
  const { events, ...rest } = s;
  return rest;
}
