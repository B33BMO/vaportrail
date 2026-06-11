import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface TranscriptFile {
  file: string;
  mtimeMs: number;
  size: number;
}

export function transcriptRoot(override?: string): string {
  if (override) return override;
  const cfg = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');
  return join(cfg, 'projects');
}

export function findTranscripts(root: string, maxDepth = 3): TranscriptFile[] {
  const out: TranscriptFile[] = [];
  walk(root, 0, maxDepth, out);
  out.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return out;
}

function walk(dir: string, depth: number, maxDepth: number, out: TranscriptFile[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (depth < maxDepth) walk(full, depth + 1, maxDepth, out);
    } else if (name.endsWith('.jsonl')) {
      out.push({ file: full, mtimeMs: st.mtimeMs, size: st.size });
    }
  }
}
