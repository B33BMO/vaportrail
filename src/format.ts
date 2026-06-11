const useColor = process.stdout.isTTY === true && !process.env.NO_COLOR;

function ansi(open: number, close: number) {
  return (s: string): string => (useColor ? `[${open}m${s}[${close}m` : s);
}

export const bold = ansi(1, 22);
export const dim = ansi(2, 22);
export const cyan = ansi(36, 39);
export const magenta = ansi(35, 39);
export const yellow = ansi(33, 39);
export const green = ansi(32, 39);
export const inverse = ansi(7, 27);

export function highlight(s: string): string {
  return useColor ? inverse(s) : `«${s}»`;
}

export function humanTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return `${(n / 1_000_000_000).toFixed(2)}G`;
}

export function humanCount(n: number): string {
  return n.toLocaleString('en-US');
}

export function relTime(iso: string | undefined, now = Date.now()): string {
  if (!iso) return '?';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '?';
  const diff = now - t;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return iso.slice(0, 10);
}

export function fmtDuration(ms: number): string {
  if (ms < 0) return '?';
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ${sec % 60}s`;
  const h = Math.floor(min / 60);
  return `${h}h ${min % 60}m`;
}

export function fmtClock(iso: string | undefined): string {
  if (!iso) return '--:--:--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--:--';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function fmtDateTime(iso: string | undefined): string {
  if (!iso) return '?';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '?';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function shortModel(model: string): string {
  return model.replace(/^claude-/, '').replace(/-\d{8}$/, '');
}

export function truncate(s: string, max: number): string {
  const oneLine = s.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= max) return oneLine;
  return oneLine.slice(0, Math.max(0, max - 1)) + '…';
}

export function shortenHome(p: string): string {
  const home = process.env.HOME;
  if (home && p.startsWith(home)) return '~' + p.slice(home.length);
  return p;
}

const TICKS = '▁▂▃▄▅▆▇█';

export function sparkline(values: number[]): string {
  const max = Math.max(...values, 1);
  return values
    .map((v) => (v === 0 ? ' ' : TICKS[Math.min(TICKS.length - 1, Math.floor((v / max) * TICKS.length))] ?? '█'))
    .join('');
}

export function bar(value: number, max: number, width = 24): string {
  const n = max > 0 ? Math.max(value > 0 ? 1 : 0, Math.round((value / max) * width)) : 0;
  return '█'.repeat(n);
}

/** Render rows as a padded table. Each cell is plain text; `paint[i]` colors column i after padding. */
export function table(rows: string[][], paint: Array<((s: string) => string) | null> = [], rightAlign: number[] = []): string[] {
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] ?? 0, cell.length);
    });
  }
  const right = new Set(rightAlign);
  return rows.map((row) =>
    row
      .map((cell, i) => {
        const padded = right.has(i) ? cell.padStart(widths[i]) : cell.padEnd(widths[i]);
        const fn = paint[i];
        return fn ? fn(padded) : padded;
      })
      .join('  ')
      .trimEnd(),
  );
}
