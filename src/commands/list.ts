import { stripEvents } from '../parse.js';
import { CommonOpts, loadSessions, projectLabel, sessionTitle } from './common.js';
import { cyan, dim, humanTokens, magenta, relTime, shortModel, table, truncate, yellow } from '../format.js';

export interface ListOpts extends CommonOpts {
  limit: number;
  all: boolean;
}

export async function runList(opts: ListOpts): Promise<void> {
  const sessions = await loadSessions(opts);
  sessions.sort((a, b) => (b.endedAt ?? '').localeCompare(a.endedAt ?? ''));
  const shown = opts.all ? sessions : sessions.slice(0, opts.limit);

  if (opts.json) {
    console.log(JSON.stringify(shown.map(stripEvents), null, 2));
    return;
  }

  if (shown.length === 0) {
    console.log('No sessions found.');
    return;
  }

  const cols = process.stdout.columns ?? 120;
  const titleWidth = Math.max(24, Math.min(60, cols - 80));
  const rows: string[][] = [['ID', 'WHEN', 'SRC', 'PROJECT', 'TITLE', '❯', '⚒', 'OUT', 'MODEL']];
  for (const s of shown) {
    rows.push([
      s.id.slice(0, 8),
      relTime(s.endedAt),
      s.source,
      truncate(projectLabel(s), 20),
      truncate(sessionTitle(s), titleWidth),
      String(s.prompts),
      String(s.toolCallsTotal),
      humanTokens(s.tokens.output),
      truncate(s.models.map(shortModel).join(','), 19) || '?',
    ]);
  }
  const lines = table(rows, [cyan, dim, yellow, magenta, null, dim, dim, dim, dim], [5, 6, 7]);
  console.log(dim(lines[0] ?? ''));
  for (const line of lines.slice(1)) console.log(line);
  console.log();
  console.log(
    dim(
      `${sessions.length} session${sessions.length === 1 ? '' : 's'}${
        shown.length < sessions.length ? ` (showing ${shown.length}; use --all or -n)` : ''
      } · vaportrail show <id> to replay one`,
    ),
  );
}
