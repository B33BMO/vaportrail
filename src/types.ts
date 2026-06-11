export interface TokenTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface ToolCall {
  name: string;
  detail?: string;
  file?: string;
}

export type EventKind = 'prompt' | 'assistant' | 'tool';

export interface SessionEvent {
  kind: EventKind;
  timestamp?: string;
  text?: string;
  tool?: ToolCall;
  sidechain: boolean;
}

export type SourceName = 'claude' | 'codex' | 'opencode';

export interface Session {
  id: string;
  source: SourceName;
  file: string;
  project: string;
  title?: string;
  firstPrompt?: string;
  gitBranch?: string;
  version?: string;
  startedAt?: string;
  endedAt?: string;
  prompts: number;
  turns: number;
  toolCounts: Record<string, number>;
  toolCallsTotal: number;
  tokens: TokenTotals;
  tokensByModel: Record<string, TokenTotals & { turns: number }>;
  turnsByDay: Record<string, number>;
  filesWritten: Record<string, number>;
  models: string[];
  isAgent: boolean;
  events: SessionEvent[];
}

export function emptyTokens(): TokenTotals {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
}
