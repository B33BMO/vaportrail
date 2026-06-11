#!/usr/bin/env node
// Generates synthetic Claude Code transcripts under demo/claude/projects/
// so the README demo can be recorded without exposing real session data.
// Usage: node demo/generate.mjs
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, 'claude', 'projects');
rmSync(root, { recursive: true, force: true });

const NOW = Date.now();
const MIN = 60_000;
let msgSeq = 0;

function session({ dir, id, title, cwd, branch, model, start, steps }) {
  const lines = [];
  let t = start;
  const sessionId = id;
  lines.push({ type: 'ai-title', aiTitle: title, sessionId });
  const base = () => ({
    sessionId,
    uuid: `u-${sessionId}-${lines.length}`,
    cwd,
    gitBranch: branch,
    version: '2.1.172',
    isSidechain: false,
    timestamp: new Date(t).toISOString(),
  });
  for (const step of steps) {
    t += (step.dt ?? 1) * MIN;
    if (step.user) {
      lines.push({ ...base(), type: 'user', message: { role: 'user', content: step.user } });
    } else {
      const msgId = `msg_demo_${++msgSeq}`;
      const usage = {
        input_tokens: 40 + ((msgSeq * 37) % 300),
        output_tokens: step.out ?? 400 + ((msgSeq * 211) % 2200),
        cache_read_input_tokens: 12_000 + ((msgSeq * 911) % 60_000),
        cache_creation_input_tokens: 800 + ((msgSeq * 131) % 4000),
      };
      const emit = (content) =>
        lines.push({
          ...base(),
          type: 'assistant',
          requestId: `req_${msgId}`,
          message: { id: msgId, role: 'assistant', model, content: [content], usage },
        });
      if (step.text) emit({ type: 'text', text: step.text });
      for (const tool of step.tools ?? []) {
        emit({ type: 'tool_use', id: `tu_${++msgSeq}`, name: tool[0], input: tool[1] });
        t += 0.2 * MIN;
      }
    }
  }
  const file = join(root, dir, `${id}.jsonl`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
}

const HOME = '/Users/ada';

session({
  dir: '-Users-ada-relay',
  id: '1a2b3c4d-1111-4aaa-8bbb-0123456789ab',
  title: 'Build SSH over WebSocket relay',
  cwd: `${HOME}/relay`,
  branch: 'main',
  model: 'claude-opus-4-8',
  start: NOW - 26 * 60 * MIN,
  steps: [
    { user: 'So.. I have a cool idea. SSH, but over websocket. One relay, every box I own reachable from anywhere.' },
    { dt: 1, text: "This is very buildable — it's basically a reverse tunnel with multiplexed streams. Let me scaffold the Go module.", tools: [['Bash', { command: 'go mod init relay && ls -la' }], ['Write', { file_path: `${HOME}/relay/main.go` }], ['Write', { file_path: `${HOME}/relay/relay.go` }], ['Write', { file_path: `${HOME}/relay/agent.go` }]] },
    { dt: 2, text: 'Builds clean. Now proving the byte pipe end-to-end with a loopback echo test.', tools: [['Bash', { command: 'go build -o relay . && echo BUILD OK' }], ['Bash', { command: './relay serve --port 9000 & sleep 1 && ./relay ping localhost:9000' }]] },
    { dt: 3, user: 'Hell yes. Now make enrollment work — new boxes should join with a one-time code.' },
    { dt: 1, text: 'Enrollment flow: relay mints a one-time code, agent presents it, gets a client cert from our CA.', tools: [['Write', { file_path: `${HOME}/relay/enroll.go` }], ['Edit', { file_path: `${HOME}/relay/relay.go` }], ['Bash', { command: 'go test ./... -run TestEnroll -v' }]] },
    { dt: 2, text: 'Enrollment works end-to-end: code minted, cert issued, agent reconnects with mTLS. Ready to deploy.', out: 2400 },
  ],
});

session({
  dir: '-Users-ada-payments',
  id: '5e6f7a8b-2222-4ccc-9ddd-0123456789ab',
  title: 'Fix flaky checkout tests in CI',
  cwd: `${HOME}/payments`,
  branch: 'fix/flaky-checkout',
  model: 'claude-sonnet-4-6',
  start: NOW - 3 * 24 * 60 * MIN,
  steps: [
    { user: 'Our checkout test suite fails about 1 in 5 CI runs. Different test every time. Find out why.' },
    { dt: 1, text: 'Intermittent + different test each run smells like shared state or timing. Checking for order dependence first.', tools: [['Grep', { pattern: 'beforeAll|afterEach' }], ['Read', { file_path: `${HOME}/payments/tests/checkout.test.ts` }], ['Bash', { command: 'npx vitest run --sequence.shuffle --reporter=verbose' }]] },
    { dt: 4, text: 'Found it: three tests share one mock clock and never reset it. Shuffled order reproduces the failure 100% of the time.', tools: [['Edit', { file_path: `${HOME}/payments/tests/helpers/clock.ts` }], ['Edit', { file_path: `${HOME}/payments/tests/checkout.test.ts` }], ['Bash', { command: 'for i in $(seq 20); do npx vitest run --sequence.shuffle || break; done' }]] },
    { dt: 5, text: '20 shuffled runs, zero failures. The mock clock now resets in afterEach. Committing the fix.', tools: [['Bash', { command: 'git commit -am "fix: reset shared mock clock between checkout tests"' }], ['Bash', { command: 'git push origin fix/flaky-checkout' }]] },
    { dt: 1, user: 'legend. thanks!' },
    { dt: 1, text: 'Anytime — and the shuffle flag is now in the CI config, so order bugs like this surface immediately instead of haunting you.', out: 900 },
  ],
});

session({
  dir: '-Users-ada-dashboard',
  id: '9c0d1e2f-3333-4eee-afff-0123456789ab',
  title: 'Add dark mode with system preference sync',
  cwd: `${HOME}/dashboard`,
  branch: 'feat/dark-mode',
  model: 'claude-opus-4-8',
  start: NOW - 7 * 24 * 60 * MIN,
  steps: [
    { user: 'Add dark mode. Respect the OS preference, persist manual overrides, no flash of wrong theme on load.' },
    { dt: 1, text: 'Three requirements, three mechanisms: prefers-color-scheme, localStorage, and a blocking inline script in <head>.', tools: [['Read', { file_path: `${HOME}/dashboard/src/app/layout.tsx` }], ['Write', { file_path: `${HOME}/dashboard/src/theme/ThemeProvider.tsx` }], ['Edit', { file_path: `${HOME}/dashboard/src/app/layout.tsx` }], ['Edit', { file_path: `${HOME}/dashboard/tailwind.config.ts` }]] },
    { dt: 3, text: 'Theme toggle wired up. Verifying the no-flash behavior with a throttled reload.', tools: [['Bash', { command: 'npm run build && npm run start' }]] },
    { dt: 2, user: 'Toggle works but code blocks are unreadable in dark mode' },
    { dt: 1, text: 'The syntax highlighter ships its own palette — swapping to a theme pair that follows the html class.', tools: [['Edit', { file_path: `${HOME}/dashboard/src/components/CodeBlock.tsx` }], ['Bash', { command: 'npm run dev' }]] },
    { dt: 2, text: 'Dark mode complete: system sync, persisted override, zero flash, and readable code blocks in both themes.', out: 1800 },
  ],
});

session({
  dir: '-Users-ada-dashboard',
  id: '7f8a9b0c-4444-4abc-8def-0123456789ab',
  title: 'Hunt down a memory leak in the websocket layer',
  cwd: `${HOME}/dashboard`,
  branch: 'main',
  model: 'claude-opus-4-7',
  start: NOW - 12 * 24 * 60 * MIN,
  steps: [
    { user: 'Node process grows ~40MB/hour in prod. Suspect the websocket reconnect logic. Can you find the leak?' },
    { dt: 1, text: 'Reconnect leaks are usually listeners that survive the old socket. Taking heap snapshots an hour apart to compare.', tools: [['Bash', { command: 'node --inspect server.js & sleep 2 && node scripts/heap-snapshot.mjs before.heapsnapshot' }], ['Grep', { pattern: 'addEventListener|on\\(' }], ['Read', { file_path: `${HOME}/dashboard/src/ws/reconnect.ts` }]] },
    { dt: 6, text: "Confirmed: every reconnect registers a new 'message' handler on the shared emitter and never removes the old one. 412 handlers after an hour.", tools: [['Edit', { file_path: `${HOME}/dashboard/src/ws/reconnect.ts` }], ['Bash', { command: 'npm test -- ws && node scripts/soak.mjs --minutes 30' }]] },
    { dt: 31, text: 'Soak test: heap flat for 30 minutes after the fix. Leak closed.', out: 1200 },
  ],
});

console.log(`demo transcripts written to ${root}`);
