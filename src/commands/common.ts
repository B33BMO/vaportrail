import { basename } from 'node:path';
import { resolveSources, SourceDef, SOURCES } from '../sources/index.js';
import { Session } from '../types.js';

export interface CommonOpts {
  dir?: string;
  json: boolean;
  project?: string;
  agents: boolean;
  source?: string;
}

export function matchProject(s: Session, filter: string): boolean {
  const target = filter === '.' ? process.cwd() : filter;
  return s.project.toLowerCase().includes(target.toLowerCase());
}

export function sourceByName(name: string): SourceDef {
  const src = SOURCES.find((s) => s.name === name);
  if (!src) throw new Error(`Unknown source '${name}'`);
  return src;
}

export async function loadSessions(opts: CommonOpts, withEvents = false): Promise<Session[]> {
  let sources = resolveSources(opts.source);
  // --dir points at one tree; without an explicit --source it means the claude layout (back-compat)
  if (opts.dir && !opts.source) sources = sources.filter((s) => s.name === 'claude');
  const sessions: Session[] = [];
  const dirOverride = sources.length === 1 ? opts.dir : undefined;
  for (const source of sources) {
    const root = source.root(dirOverride);
    for (const f of source.discover(root)) {
      const s = await source.parse(f.file, { withEvents });
      if (!s) continue;
      if (s.isAgent && !opts.agents) continue;
      if (s.prompts === 0 && s.turns === 0) continue;
      if (opts.project && !matchProject(s, opts.project)) continue;
      sessions.push(s);
    }
  }
  return sessions;
}

export function projectLabel(s: Session): string {
  return s.project ? basename(s.project) : '?';
}

export function sessionTitle(s: Session): string {
  return s.title ?? s.firstPrompt ?? '(untitled)';
}
