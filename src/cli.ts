#!/usr/bin/env node
import { runList } from './commands/list.js';
import { runShow } from './commands/show.js';
import { runSearch } from './commands/search.js';
import { runStats } from './commands/stats.js';
import { bold, cyan, dim } from './format.js';

const VERSION = '0.2.0';

const NEEDS_VALUE = new Set(['dir', 'project', 'limit', 'source']);
const SHORT: Record<string, string> = {
  n: 'limit',
  p: 'project',
  a: 'all',
  j: 'json',
  d: 'dir',
  s: 'source',
  h: 'help',
  v: 'version',
};

interface Parsed {
  flags: Record<string, string | boolean>;
  positional: string[];
}

function parseArgs(argv: string[]): Parsed {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--') {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const name = a.slice(2);
        if (NEEDS_VALUE.has(name) && argv[i + 1] !== undefined) flags[name] = argv[++i]!;
        else flags[name] = true;
      }
    } else if (a.startsWith('-') && a.length === 2) {
      const name = SHORT[a[1]!] ?? a[1]!;
      if (NEEDS_VALUE.has(name) && argv[i + 1] !== undefined) flags[name] = argv[++i]!;
      else flags[name] = true;
    } else {
      positional.push(a);
    }
  }
  return { flags, positional };
}

function intFlag(flags: Record<string, string | boolean>, name: string, fallback: number): number {
  const v = flags[name];
  if (typeof v !== 'string') return fallback;
  const n = parseInt(v, 10);
  return Number.isNaN(n) || n <= 0 ? fallback : n;
}

function strFlag(flags: Record<string, string | boolean>, name: string): string | undefined {
  const v = flags[name];
  return typeof v === 'string' ? v : undefined;
}

function help(): void {
  console.log(`${bold('vaportrail')} ${dim(`v${VERSION}`)} — your agents leave trails. vaportrail reads them.

${bold('usage')}
  vaportrail ${dim('[list]')} ${dim('[options]')}        recent sessions across all projects
  vaportrail show ${cyan('<id>')} ${dim('[--full]')}      replay a session's timeline
  vaportrail search ${cyan('<query>')} ${dim('[opts]')}   search prompts & responses across history
  vaportrail stats                    aggregate activity, tools, models, files

${bold('options')}
  -s, --source <s>    agents to read: claude, codex, opencode (comma list; default all)
  -p, --project <s>   only sessions whose project path contains <s> ('.' = cwd)
  -n, --limit <n>     max rows/matches (list: 25, search: 50)
  -a, --all           no limit
  -j, --json          machine-readable output
  -d, --dir <path>    transcript root override (with -s for non-claude layouts)
      --agents        include subagent sessions
      --full          show: full untruncated text
      --regex         search: treat query as a regular expression
      --tools         search: also match tool inputs (commands, file paths)
  -h, --help          this help
  -v, --version       version

${bold('examples')}
  vaportrail                          what have my agents been up to?
  vaportrail show 6f3a                replay session 6f3a…
  vaportrail search "JWT" --tools     where did anything touch JWTs?
  vaportrail stats -p .               stats for the current project
`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const known = new Set(['list', 'show', 'search', 'stats', 'help']);
  let cmd = 'list';
  let rest = argv;
  if (argv[0] && !argv[0].startsWith('-')) {
    if (!known.has(argv[0])) {
      console.error(`Unknown command '${argv[0]}'. Run 'vaportrail --help'.`);
      process.exitCode = 1;
      return;
    }
    cmd = argv[0];
    rest = argv.slice(1);
  }

  const { flags, positional } = parseArgs(rest);

  if (flags.version) {
    console.log(VERSION);
    return;
  }
  if (flags.help || cmd === 'help') {
    help();
    return;
  }

  const common = {
    dir: strFlag(flags, 'dir'),
    json: flags.json === true,
    project: strFlag(flags, 'project'),
    agents: flags.agents === true,
    source: strFlag(flags, 'source'),
  };

  if (cmd === 'list') {
    await runList({ ...common, limit: intFlag(flags, 'limit', 25), all: flags.all === true });
  } else if (cmd === 'show') {
    const idPrefix = positional[0];
    if (!idPrefix) {
      console.error("Usage: vaportrail show <session-id-prefix>  (ids come from 'vaportrail list')");
      process.exitCode = 1;
      return;
    }
    await runShow({ ...common, idPrefix, full: flags.full === true });
  } else if (cmd === 'search') {
    const query = positional.join(' ');
    if (!query) {
      console.error('Usage: vaportrail search <query>');
      process.exitCode = 1;
      return;
    }
    await runSearch({
      ...common,
      query,
      regex: flags.regex === true,
      tools: flags.tools === true,
      limit: flags.all === true ? Number.MAX_SAFE_INTEGER : intFlag(flags, 'limit', 50),
    });
  } else if (cmd === 'stats') {
    await runStats(common);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
