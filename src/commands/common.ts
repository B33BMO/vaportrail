import { basename } from 'node:path';
import { findTranscripts } from '../discover.js';
import { parseSession } from '../parse.js';
import { Session } from '../types.js';

export interface CommonOpts {
  root: string;
  json: boolean;
  project?: string;
  agents: boolean;
}

export function matchProject(s: Session, filter: string): boolean {
  const target = filter === '.' ? process.cwd() : filter;
  return s.project.toLowerCase().includes(target.toLowerCase());
}

export async function loadSessions(opts: CommonOpts, withEvents = false): Promise<Session[]> {
  const files = findTranscripts(opts.root);
  const sessions: Session[] = [];
  for (const f of files) {
    const s = await parseSession(f.file, { withEvents });
    if (!s) continue;
    if (s.isAgent && !opts.agents) continue;
    if (s.prompts === 0 && s.turns === 0) continue;
    if (opts.project && !matchProject(s, opts.project)) continue;
    sessions.push(s);
  }
  return sessions;
}

export function projectLabel(s: Session): string {
  return s.project ? basename(s.project) : '?';
}

export function sessionTitle(s: Session): string {
  return s.title ?? s.firstPrompt ?? '(untitled)';
}
