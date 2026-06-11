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

// ---- codex fixture (CODEX_HOME=demo/codex) ----
const codexRoot = join(here, 'codex', 'sessions', '2026', '06', '09');
rmSync(join(here, 'codex'), { recursive: true, force: true });
mkdirSync(codexRoot, { recursive: true });
{
  const id = '019d1234-5555-7abc-8def-0123456789ab';
  let t = NOW - 30 * 60 * MIN;
  const ts = () => new Date(t).toISOString();
  const lines = [
    { timestamp: ts(), type: 'session_meta', payload: { id, timestamp: ts(), cwd: `${HOME}/relay`, cli_version: '0.72.0', source: 'cli', git: { branch: 'main' } } },
    { timestamp: ts(), type: 'turn_context', payload: { cwd: `${HOME}/relay`, model: 'gpt-5.1-codex-max' } },
  ];
  const user = (text) => lines.push({ timestamp: ts(), type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } });
  const agent = (text) => lines.push({ timestamp: ts(), type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] } });
  const shell = (command) => lines.push({ timestamp: ts(), type: 'response_item', payload: { type: 'function_call', name: 'shell_command', arguments: JSON.stringify({ command, workdir: `${HOME}/relay` }) } });
  const patch = (files) => lines.push({ timestamp: ts(), type: 'response_item', payload: { type: 'custom_tool_call', name: 'apply_patch', input: files.map((f) => `*** Update File: ${f}`).join('\n') } });
  const tokens = (totals) => lines.push({ timestamp: ts(), type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: totals, last_token_usage: totals } } });

  user('Containerize the relay — multi-stage build, distroless runtime, under 20MB.');
  t += MIN;
  shell('ls && cat go.mod');
  t += MIN;
  agent('Go 1.23, no cgo — perfect for a static build in a distroless image. Writing the Dockerfile.');
  patch(['Dockerfile', '.dockerignore']);
  t += 2 * MIN;
  shell('docker build -t relay:dev . && docker images relay:dev --format "{{.Size}}"');
  t += 3 * MIN;
  agent('14.2MB final image. Build stage compiles with CGO_ENABLED=0, runtime is distroless/static. Done.');
  tokens({ input_tokens: 48_200, cached_input_tokens: 39_800, output_tokens: 6_150, total_tokens: 54_350 });
  writeFileSync(join(codexRoot, `rollout-2026-06-09T10-00-00-${id}.jsonl`), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
}

// ---- opencode fixture (XDG_DATA_HOME=demo/xdg) ----
const oc = join(here, 'xdg', 'opencode', 'storage');
rmSync(join(here, 'xdg'), { recursive: true, force: true });
{
  const sid = 'ses_demo0001thumbnailpipeline';
  const created = NOW - 4 * 24 * 60 * MIN;
  const dirOf = (p) => mkdirSync(dirname(p), { recursive: true });
  const writeJson = (p, obj) => { dirOf(p); writeFileSync(p, JSON.stringify(obj)); };
  writeJson(join(oc, 'session', 'demoproject0000000000', `${sid}.json`), {
    id: sid, version: '1.0.220', projectID: 'demoproject0000000000', directory: `${HOME}/gallery`,
    title: 'Speed up the thumbnail pipeline 6x', time: { created, updated: created + 22 * MIN },
  });
  let n = 0;
  const msg = (obj) => { const id = `msg_demo${String(++n).padStart(4, '0')}`; writeJson(join(oc, 'message', sid, `${id}.json`), { id, sessionID: sid, ...obj }); return id; };
  const part = (mid, obj) => writeJson(join(oc, 'part', mid, `prt_demo${String(++n).padStart(4, '0')}.json`), { id: `prt_${n}`, messageID: mid, sessionID: sid, ...obj });
  const m1 = msg({ role: 'user', time: { created } });
  part(m1, { type: 'text', text: 'Thumbnail generation takes 90s for a 200-image album. Make it fast.' });
  const m2 = msg({ role: 'assistant', time: { created: created + MIN, completed: created + 8 * MIN }, modelID: 'qwen3-coder:480b-cloud', providerID: 'ollama-cloud', tokens: { input: 8400, output: 2100, reasoning: 0, cache: { read: 31000, write: 2400 } } });
  part(m2, { type: 'text', text: 'Profiling first — my bet is sequential processing and full-size decodes.' });
  part(m2, { type: 'tool', tool: 'bash', callID: 'c1', state: { status: 'completed', input: { command: 'python -m cProfile -s cumtime thumbs.py album/ | head -20' }, time: { start: created + 2 * MIN } } });
  part(m2, { type: 'tool', tool: 'read', callID: 'c2', state: { status: 'completed', input: { filePath: `${HOME}/gallery/thumbs.py` }, time: { start: created + 3 * MIN } } });
  const m3 = msg({ role: 'assistant', time: { created: created + 9 * MIN, completed: created + 20 * MIN }, modelID: 'qwen3-coder:480b-cloud', providerID: 'ollama-cloud', tokens: { input: 9100, output: 3800, reasoning: 0, cache: { read: 38000, write: 1800 } } });
  part(m3, { type: 'text', text: 'Confirmed: PIL decodes every image at full resolution, one at a time. Switching to draft-mode decode + a process pool.' });
  part(m3, { type: 'tool', tool: 'edit', callID: 'c3', state: { status: 'completed', input: { filePath: `${HOME}/gallery/thumbs.py` }, time: { start: created + 10 * MIN } } });
  part(m3, { type: 'tool', tool: 'bash', callID: 'c4', state: { status: 'completed', input: { command: 'time python thumbs.py album/' }, time: { start: created + 12 * MIN } } });
  part(m3, { type: 'text', text: '90s → 14s on the same album. Draft mode skips the full JPEG decode and the pool uses all 8 cores.' });
}

// ---- gemini fixture (HOME=demo/home) ----
const ghome = join(here, 'home');
rmSync(ghome, { recursive: true, force: true });
{
  const chats = join(ghome, '.gemini', 'tmp', 'demohash0000', 'chats');
  mkdirSync(chats, { recursive: true });
  const t0 = NOW - 2 * 24 * 60 * MIN;
  const at = (m) => new Date(t0 + m * MIN).toISOString();
  const tok = (input, output) => ({ input, output, cached: Math.round(input * 0.7), thoughts: 0, tool: 0, total: input + output });
  const session = {
    sessionId: 'ge3a7c1d-6666-4abc-9def-0123456789ab',
    projectHash: 'demohash0000',
    startTime: at(0),
    lastUpdated: at(11),
    messages: [
      { id: 'g1', timestamp: at(0), type: 'user', content: 'The RSS feed broke after the markdown migration. Validator says invalid XML.' },
      { id: 'g2', timestamp: at(1), type: 'gemini', model: 'gemini-2.5-pro', tokens: tok(5200, 900), content: 'Invalid XML in a feed usually means unescaped entities from post content. Checking the feed template.', toolCalls: [
        { id: 't1', name: 'read_file', args: { absolute_path: '/Users/ada/blog/src/feed.ts' } },
        { id: 't2', name: 'run_shell_command', args: { command: 'curl -s localhost:3000/rss.xml | xmllint --noout -', directory: '/Users/ada/blog' } },
      ] },
      { id: 'g3', timestamp: at(6), type: 'gemini', model: 'gemini-2.5-pro', tokens: tok(6100, 1400), content: 'Found it — post excerpts are interpolated raw, and the migration introduced & in titles. Wrapping all text nodes in CDATA.', toolCalls: [
        { id: 't3', name: 'replace', args: { file_path: '/Users/ada/blog/src/feed.ts' } },
        { id: 't4', name: 'run_shell_command', args: { command: 'curl -s localhost:3000/rss.xml | xmllint --noout - && echo VALID', directory: '/Users/ada/blog' } },
      ] },
      { id: 'g4', timestamp: at(11), type: 'gemini', model: 'gemini-2.5-pro', tokens: tok(6900, 600), content: 'Feed validates clean. CDATA wrapping handles every entity case the old escaping missed.' },
    ],
  };
  writeFileSync(join(chats, 'session-demo-ge3a7c1d.json'), JSON.stringify(session));
}

// ---- aider fixture (HOME=demo/home) ----
{
  const proj = join(ghome, 'blog-engine');
  mkdirSync(proj, { recursive: true });
  const d = new Date(NOW - 5 * 24 * 60 * MIN);
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  writeFileSync(join(proj, '.aider.chat.history.md'), `
# aider chat started at ${stamp}

> Aider v0.86.1
> Model: ollama/qwen3-coder:480b-cloud with diff edit format
> Git repo: .git with 42 files

#### add reading-time estimates to post headers

I'll add a reading-time helper and wire it into the post header component.

> Applied edit to src/lib/reading-time.ts
> Applied edit to src/components/PostHeader.tsx
> Commit a1b2c3d feat: reading-time estimates on post headers
> Tokens: 9.6k sent, 1.8k received.

#### nice, also show it on the index cards

Done — the index card now reuses the same helper.

> Applied edit to src/components/PostCard.tsx
> Commit d4e5f6a feat: reading time on index cards
> Tokens: 11k sent, 950 received.
`);
}

console.log(`demo transcripts written to ${root}, ${join(here, 'codex')}, ${join(here, 'xdg')}, ${ghome}`);
