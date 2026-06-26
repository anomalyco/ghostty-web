import { expect, test } from 'bun:test';
import { createIsolatedTerminal } from './test-helpers';

test('repeated output and reflow resize completes with reused WASM pages', async () => {
  const terminal = await createIsolatedTerminal({ cols: 80, rows: 35, scrollback: 10_000 });
  terminal.open(document.createElement('div'));
  (terminal as any).cancelRenderLoop();

  const block = Array.from(
    { length: 120 },
    (_, row) =>
      `\x1b[48;5;${row % 256}m${String(row).padStart(4, '0')}:${'x'.repeat(180)}\x1b[0m\r\n`
  ).join('');

  for (const [cols, rows] of [
    [53, 71],
    [126, 34],
    [131, 36],
  ]) {
    terminal.write(block);
    terminal.resize(cols, rows);
  }

  expect(terminal.cols).toBe(131);
  expect(terminal.rows).toBe(36);
  expect(terminal.wasmTerm!.getScrollbackLength()).toBeGreaterThan(0);
  terminal.dispose();
});
