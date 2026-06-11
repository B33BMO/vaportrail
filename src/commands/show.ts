import { Session } from '../types.js';
import { CommonOpts, loadSessions, sessionTitle, sourceByName } from './common.js';
import {
  bold,
  cyan,
  dim,
  fmtClock,
  fmtDateTime,
  fmtDuration,
  green,
  humanTokens,
  magenta,
  shortModel,
  shortenHome,
  truncate,
  yellow,
} from '../format.js';

export interface ShowOpts extends CommonOpts {
  idPrefix: string;
  full: boolean;
}

export async function runShow(opts: ShowOpts): Promise<void> {
  const sessions = await loadSessions({ ...opts, project: undefined, agents: true });
  const matches = sessions.filter((s) => s.id.startsWith(opts.idPrefix));
  if (matches.length === 0) {
    console.error(`No session found matching '${opts.idPrefix}'.`);
    process.exitCode = 1;
    return;
  }
  if (matches.length > 1) {
    console.error(`Ambiguous id '${opts.idPrefix}' matches ${matches.length} sessions:`);
    for (const m of matches.slice(0, 10)) console.error(`  ${m.id} (${m.source})`);
    process.exitCode = 1;
    return;
  }

  const source = sourceByName(matches[0]!.source);
  const s = await source.parse(matches[0]!.file, { withEvents: true });
  if (!s) {
    console.error('Could not parse that session.');
    process.exitCode = 1;
    return;
  }

  if (opts.json) {
    console.log(JSON.stringify(s, null, 2));
    return;
  }

  printHeader(s);
  console.log();
  printTimeline(s, opts.full);
  console.log();
  console.log(
    dim(
      `tokens: in ${humanTokens(s.tokens.input)} · out ${humanTokens(s.tokens.output)} · cache read ${humanTokens(
        s.tokens.cacheRead,
      )} · cache write ${humanTokens(s.tokens.cacheWrite)}`,
    ),
  );
}

function printHeader(s: Session): void {
  const duration =
    s.startedAt && s.endedAt ? fmtDuration(Date.parse(s.endedAt) - Date.parse(s.startedAt)) : '?';
  console.log(
    `${bold('vaportrail')} ${dim('·')} session ${cyan(s.id.slice(0, 8))}${dim(s.id.slice(8))} ${dim(`· ${s.source}`)}`,
  );
  console.log(`${dim('title   ')} ${bold(sessionTitle(s))}`);
  console.log(
    `${dim('project ')} ${magenta(shortenHome(s.project || '?'))}${s.gitBranch ? dim(` (${s.gitBranch})`) : ''}`,
  );
  console.log(`${dim('when    ')} ${fmtDateTime(s.startedAt)} → ${fmtDateTime(s.endedAt)} ${dim(`(${duration})`)}`);
  console.log(
    `${dim('activity')} ${s.prompts} prompts · ${s.turns} turns · ${s.toolCallsTotal} tool calls · ${
      s.models.map(shortModel).join(', ') || '?'
    }`,
  );
}

function printTimeline(s: Session, full: boolean): void {
  const cols = process.stdout.columns ?? 120;
  const width = Math.max(40, cols - 16);
  for (const ev of s.events) {
    const clock = dim(fmtClock(ev.timestamp));
    const side = ev.sidechain ? dim('└ ') : '';
    if (ev.kind === 'prompt') {
      console.log();
      const text = full ? ev.text ?? '' : truncate(ev.text ?? '', width);
      console.log(`${clock}  ${side}${green('❯')} ${bold(text)}`);
    } else if (ev.kind === 'assistant') {
      const text = full ? ev.text ?? '' : truncate(ev.text ?? '', width);
      console.log(`${clock}  ${side}${cyan('✦')} ${text}`);
    } else if (ev.tool) {
      const detail = ev.tool.detail ? ` ${dim(truncate(ev.tool.detail, width - ev.tool.name.length))}` : '';
      console.log(`${clock}  ${side}${yellow('⚒')} ${ev.tool.name}${detail}`);
    }
  }
}
