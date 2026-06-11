import { CommonOpts, loadSessions, projectLabel, sessionTitle } from './common.js';
import { bold, cyan, dim, green, highlight, magenta, truncate, yellow } from '../format.js';
import { Session, SessionEvent } from '../types.js';

export interface SearchOpts extends CommonOpts {
  query: string;
  regex: boolean;
  tools: boolean;
  limit: number;
}

interface Match {
  session: Session;
  event: SessionEvent;
  index: number;
  length: number;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function runSearch(opts: SearchOpts): Promise<void> {
  let re: RegExp;
  try {
    re = new RegExp(opts.regex ? opts.query : escapeRegExp(opts.query), 'i');
  } catch (err) {
    console.error(`Invalid regex: ${(err as Error).message}`);
    process.exitCode = 1;
    return;
  }

  const sessions = await loadSessions(opts, true);
  sessions.sort((a, b) => (b.endedAt ?? '').localeCompare(a.endedAt ?? ''));

  const matches: Match[] = [];
  let total = 0;
  for (const s of sessions) {
    for (const ev of s.events) {
      const haystack = ev.kind === 'tool' ? (opts.tools ? ev.tool?.detail : undefined) : ev.text;
      if (!haystack) continue;
      const m = re.exec(haystack);
      if (!m) continue;
      total++;
      if (matches.length < opts.limit) {
        matches.push({ session: s, event: ev, index: m.index, length: m[0].length || 1 });
      }
    }
  }

  if (opts.json) {
    console.log(
      JSON.stringify(
        matches.map((m) => ({
          sessionId: m.session.id,
          project: m.session.project,
          title: m.session.title ?? null,
          timestamp: m.event.timestamp ?? null,
          kind: m.event.kind,
          text: m.event.kind === 'tool' ? m.event.tool?.detail : m.event.text,
        })),
        null,
        2,
      ),
    );
    return;
  }

  if (matches.length === 0) {
    console.log(`No matches for '${opts.query}'.`);
    return;
  }

  let lastSession = '';
  for (const m of matches) {
    if (m.session.id !== lastSession) {
      lastSession = m.session.id;
      console.log();
      console.log(
        `${cyan(m.session.id.slice(0, 8))} ${dim('·')} ${magenta(projectLabel(m.session))} ${dim('·')} ${dim(
          (m.session.endedAt ?? '').slice(0, 10),
        )} ${dim('·')} ${bold(truncate(sessionTitle(m.session), 60))}`,
      );
    }
    const icon = m.event.kind === 'prompt' ? green('❯') : m.event.kind === 'assistant' ? cyan('✦') : yellow('⚒');
    console.log(`  ${icon} ${snippet(m)}`);
  }
  console.log();
  console.log(
    dim(`${total} match${total === 1 ? '' : 'es'}${total > matches.length ? ` (showing ${matches.length}; raise with -n)` : ''}`),
  );
}

function snippet(m: Match): string {
  const raw = (m.event.kind === 'tool' ? m.event.tool?.detail : m.event.text) ?? '';
  const text = raw.replace(/\s+/g, ' ');
  // recompute index on squashed text (positions shift); fall back to original slice
  const re = new RegExp(escapeRegExp(raw.slice(m.index, m.index + m.length).replace(/\s+/g, ' ')), 'i');
  const sm = re.exec(text);
  const idx = sm ? sm.index : 0;
  const len = sm ? sm[0].length : m.length;
  const start = Math.max(0, idx - 50);
  const end = Math.min(text.length, idx + len + 70);
  const before = (start > 0 ? '…' : '') + text.slice(start, idx);
  const hit = text.slice(idx, idx + len);
  const after = text.slice(idx + len, end) + (end < text.length ? '…' : '');
  return `${dim(before)}${highlight(hit)}${dim(after)}`;
}
