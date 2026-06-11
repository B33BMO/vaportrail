import { CommonOpts, loadSessions } from './common.js';
import {
  bar,
  bold,
  cyan,
  dim,
  humanCount,
  humanTokens,
  magenta,
  shortModel,
  shortenHome,
  sparkline,
  table,
} from '../format.js';
import { emptyTokens, TokenTotals } from '../types.js';

export async function runStats(opts: CommonOpts): Promise<void> {
  const sessions = await loadSessions(opts);
  if (sessions.length === 0) {
    console.log('No sessions found.');
    return;
  }

  const projects = new Set<string>();
  const toolCounts: Record<string, number> = {};
  const filesWritten: Record<string, number> = {};
  const tokensByModel: Record<string, TokenTotals & { turns: number }> = {};
  const turnsByDay: Record<string, number> = {};
  const totals = { prompts: 0, turns: 0, toolCalls: 0, tokens: emptyTokens() };
  let first: string | undefined;
  let last: string | undefined;

  for (const s of sessions) {
    if (s.project) projects.add(s.project);
    totals.prompts += s.prompts;
    totals.turns += s.turns;
    totals.toolCalls += s.toolCallsTotal;
    totals.tokens.input += s.tokens.input;
    totals.tokens.output += s.tokens.output;
    totals.tokens.cacheRead += s.tokens.cacheRead;
    totals.tokens.cacheWrite += s.tokens.cacheWrite;
    for (const [k, v] of Object.entries(s.toolCounts)) toolCounts[k] = (toolCounts[k] ?? 0) + v;
    for (const [k, v] of Object.entries(s.filesWritten)) filesWritten[k] = (filesWritten[k] ?? 0) + v;
    for (const [k, v] of Object.entries(s.turnsByDay)) turnsByDay[k] = (turnsByDay[k] ?? 0) + v;
    for (const [model, t] of Object.entries(s.tokensByModel)) {
      const agg = (tokensByModel[model] ??= { ...emptyTokens(), turns: 0 });
      agg.input += t.input;
      agg.output += t.output;
      agg.cacheRead += t.cacheRead;
      agg.cacheWrite += t.cacheWrite;
      agg.turns += t.turns;
    }
    if (s.startedAt && (!first || s.startedAt < first)) first = s.startedAt;
    if (s.endedAt && (!last || s.endedAt > last)) last = s.endedAt;
  }

  if (opts.json) {
    console.log(
      JSON.stringify(
        { sessions: sessions.length, projects: projects.size, first, last, totals, toolCounts, tokensByModel, turnsByDay },
        null,
        2,
      ),
    );
    return;
  }

  const scope = opts.project ? `project filter '${opts.project}'` : 'all projects';
  console.log(`${bold('vaportrail')} ${dim('·')} stats ${dim(`(${scope})`)}`);
  console.log();
  console.log(
    `${dim('sessions')} ${bold(String(sessions.length))} across ${projects.size} projects ${dim(
      `(${(first ?? '?').slice(0, 10)} → ${(last ?? '?').slice(0, 10)})`,
    )}`,
  );
  console.log(
    `${dim('activity')} ${humanCount(totals.prompts)} prompts · ${humanCount(totals.turns)} turns · ${humanCount(
      totals.toolCalls,
    )} tool calls`,
  );
  console.log(
    `${dim('tokens  ')} in ${humanTokens(totals.tokens.input)} · out ${humanTokens(
      totals.tokens.output,
    )} · cache read ${humanTokens(totals.tokens.cacheRead)} · cache write ${humanTokens(totals.tokens.cacheWrite)}`,
  );

  // last 30 days sparkline
  const days: string[] = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86_400_000);
    days.push(d.toISOString().slice(0, 10));
  }
  const counts = days.map((d) => turnsByDay[d] ?? 0);
  console.log();
  console.log(`${dim('last 30d')} ${cyan(sparkline(counts))} ${dim(`peak ${Math.max(...counts)} turns/day`)}`);

  const topTools = Object.entries(toolCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (topTools.length > 0) {
    console.log();
    console.log(bold('top tools'));
    const max = topTools[0]![1];
    const rows = topTools.map(([name, n]) => [name, humanCount(n), bar(n, max)]);
    for (const line of table(rows, [null, dim, cyan], [1])) console.log(`  ${line}`);
  }

  const models = Object.entries(tokensByModel).sort((a, b) => b[1].output - a[1].output);
  if (models.length > 0) {
    console.log();
    console.log(bold('models'));
    const rows: string[][] = [['MODEL', 'TURNS', 'IN', 'OUT', 'CACHE READ']];
    for (const [model, t] of models) {
      rows.push([shortModel(model), humanCount(t.turns), humanTokens(t.input), humanTokens(t.output), humanTokens(t.cacheRead)]);
    }
    const lines = table(rows, [magenta, null, null, null, null], [1, 2, 3, 4]);
    console.log(`  ${dim(lines[0] ?? '')}`);
    for (const line of lines.slice(1)) console.log(`  ${line}`);
  }

  const topFiles = Object.entries(filesWritten).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (topFiles.length > 0) {
    console.log();
    console.log(bold('most-edited files'));
    const rows = topFiles.map(([file, n]) => [humanCount(n), shortenHome(file)]);
    for (const line of table(rows, [dim, null], [0])) console.log(`  ${line}`);
  }
}
