import { TranscriptFile } from '../discover.js';
import { ParseOptions } from '../parse.js';
import { Session, SourceName } from '../types.js';
import { claudeSource } from './claude.js';
import { codexSource } from './codex.js';
import { opencodeSource } from './opencode.js';

export interface SourceDef {
  name: SourceName;
  /** Resolve the transcript root, honoring env vars; `override` wins. */
  root(override?: string): string;
  /** Find session entry files under the root. */
  discover(root: string): TranscriptFile[];
  /** Parse one session entry file into the normalized model. */
  parse(path: string, opts: ParseOptions): Promise<Session | null>;
}

export const SOURCES: SourceDef[] = [claudeSource, codexSource, opencodeSource];

export function resolveSources(filter?: string): SourceDef[] {
  if (!filter) return SOURCES;
  const wanted = filter.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const picked: SourceDef[] = [];
  for (const w of wanted) {
    const match = SOURCES.find((s) => s.name === w || s.name.startsWith(w));
    if (!match) {
      throw new Error(`Unknown source '${w}' (available: ${SOURCES.map((s) => s.name).join(', ')})`);
    }
    if (!picked.includes(match)) picked.push(match);
  }
  return picked;
}
