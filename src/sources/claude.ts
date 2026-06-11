import { join } from 'node:path';
import { homedir } from 'node:os';
import { findTranscripts, TranscriptFile } from '../discover.js';
import { parseSession, ParseOptions } from '../parse.js';
import { Session } from '../types.js';
import { SourceDef } from './index.js';

export const claudeSource: SourceDef = {
  name: 'claude',
  root(override?: string): string {
    if (override) return override;
    const cfg = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');
    return join(cfg, 'projects');
  },
  discover(root: string): TranscriptFile[] {
    return findTranscripts(root);
  },
  parse(path: string, opts: ParseOptions): Promise<Session | null> {
    return parseSession(path, opts);
  },
};
