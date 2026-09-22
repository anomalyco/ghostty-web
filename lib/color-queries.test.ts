import { afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { type CanvasRenderer, Ghostty, type ITheme, Terminal } from './index';

let ghostty: Ghostty;
const terminals: Terminal[] = [];
beforeAll(async () => {
  ghostty = await Ghostty.load();
});
afterEach(() => {
  for (const terminal of terminals.splice(0)) terminal.dispose();
});

// Use the pinned Terminal write/input/reset paths and real WASM, without a
// canvas or render loop. Only open()'s DOM setup is replaced in this fixture.
function createTerminal(theme: ITheme = { foreground: '#010101', background: '#ffffff' }) {
  const terminal = new Terminal({ ghostty, theme, cols: 80, rows: 24 });
  const internals = terminal as unknown as {
    isOpen: boolean;
    buildWasmConfig(): Parameters<Ghostty['createTerminal']>[2];
  };
  terminal.wasmTerm = ghostty.createTerminal(80, 24, internals.buildWasmConfig());
  terminal.renderer = { clear() {}, dispose() {} } as CanvasRenderer;
  internals.isOpen = true;
  const replies: string[] = [];
  terminal.onData((data) => replies.push(data));
  terminals.push(terminal);
  return { terminal, replies };
}

const foregroundReply = '\x1b]10;rgb:0101/0101/0101\x1b\\';
const backgroundReply = '\x1b]11;rgb:ffff/ffff/ffff\x1b\\';
const codexQueries = '\x1b]10;?\x1b\\\x1b]11;?\x1b\\';

describe('default terminal color replies', () => {
  test('answers the Codex startup probe through onData', () => {
    const { terminal, replies } = createTerminal();
    terminal.write(`\x1b[6n${codexQueries}\x1b[?u\x1b[c`);
    const output = replies.join('');
    expect(output).toContain('\x1b[1;1R');
    expect(output).toContain(foregroundReply);
    expect(output).toContain(backgroundReply);
    expect(output.split(backgroundReply)).toHaveLength(2);
  });

  test('handles every split point in paired queries and their terminators', () => {
    const { terminal, replies } = createTerminal();
    for (let split = 1; split < codexQueries.length; split++) {
      replies.length = 0;
      terminal.write(codexQueries.slice(0, split));
      terminal.write(codexQueries.slice(split));
      expect(replies.join('')).toBe(foregroundReply + backgroundReply);
    }
  });

  test('handles byte arrays, mixed write types, and BEL termination', () => {
    const { terminal, replies } = createTerminal();
    const bytes = new TextEncoder().encode('\x1b]10;?\x07\x1b]11;?\x07');
    for (const [index, byte] of bytes.entries()) {
      terminal.write(index % 2 ? Uint8Array.of(byte) : String.fromCharCode(byte));
    }
    expect(replies.join('')).toBe('\x1b]10;rgb:0101/0101/0101\x07\x1b]11;rgb:ffff/ffff/ffff\x07');
  });

  test('answers a combined foreground and background query', () => {
    const { terminal, replies } = createTerminal();
    terminal.write('\x1b]10;?;?\x1b\\');
    expect(replies.join('')).toBe(foregroundReply + backgroundReply);
  });

  test('reports dark colors and the actual WASM defaults', () => {
    for (const [theme, expected] of [
      [
        { foreground: '#d4d4d4', background: '#1e1e1e' },
        '\x1b]10;rgb:d4d4/d4d4/d4d4\x1b\\\x1b]11;rgb:1e1e/1e1e/1e1e\x1b\\',
      ],
      [{}, '\x1b]10;rgb:ffff/ffff/ffff\x1b\\\x1b]11;rgb:0000/0000/0000\x1b\\'],
    ] as const) {
      const { terminal, replies } = createTerminal(theme);
      terminal.write(codexQueries);
      expect(replies.join('')).toBe(expected);
    }
  });

  test('uses resolved colors for RGB, shorthand, and unsupported named CSS colors', () => {
    for (const theme of [
      { foreground: 'rgb(12, 34, 56)', background: '#abc' },
      // The pinned library cannot parse CSS names into WASM. Report what it renders,
      // rather than inventing a second CSS parser with different behavior.
      { foreground: 'red', background: 'white' },
    ]) {
      const { terminal, replies } = createTerminal(theme);
      terminal.write('X');
      const cell = terminal.wasmTerm?.getLine(0)?.[0];
      if (!cell) throw new Error('Missing rendered cell');
      const component = (value: number) => value.toString(16).padStart(2, '0').repeat(2);
      terminal.write(codexQueries);
      expect(replies.join('')).toBe(
        `\x1b]10;rgb:${[cell.fg_r, cell.fg_g, cell.fg_b].map(component).join('/')}\x1b\\` +
          `\x1b]11;rgb:${[cell.bg_r, cell.bg_g, cell.bg_b].map(component).join('/')}\x1b\\`
      );
    }
  });

  test('ignores SGR text colors and inverse video, but follows OSC default-color changes', () => {
    const { terminal, replies } = createTerminal();
    terminal.write('\x1b[31;44;7mX\x1b]11;#112233\x07');
    expect(replies).toEqual([]);
    terminal.write(codexQueries);
    expect(replies.join('')).toBe(foregroundReply + '\x1b]11;rgb:1111/2222/3333\x1b\\');
  });

  test('preserves text, UTF-8, titles, and existing terminal responses', () => {
    const { terminal, replies } = createTerminal();
    const titles: string[] = [];
    terminal.onTitleChange((title) => titles.push(title));
    terminal.write('\x1b]2;My terminal\x07A');
    const text = new TextEncoder().encode('日本語😀');
    for (const byte of text) terminal.write(Uint8Array.of(byte));
    terminal.write('\x1b[6n');
    expect(titles).toEqual(['My terminal']);
    expect(terminal.buffer.active.getLine(0)?.translateToString(true)).toBe('A日本語😀');
    expect(replies.join('')).toBe('\x1b[1;10R');
  });

  test('does not answer query-looking text inside other control strings', () => {
    const { terminal, replies } = createTerminal();
    for (const introducer of ['P', 'X', '^', '_']) {
      terminal.write(`\x1b${introducer}payload\x1b]11;?\x07\x1b\\`);
    }
    terminal.write('\x1b]2;literal 11;?\x07\x1b]111;?\x07');
    expect(replies).toEqual([]);
    terminal.write(codexQueries);
    expect(replies.join('')).toBe(foregroundReply + backgroundReply);
  });

  test('recovers after cancelled, oversized, and malformed sequences', () => {
    const { terminal, replies } = createTerminal();
    for (const cancel of ['\x18', '\x1a']) {
      terminal.write(`\x1b]11;?${cancel}\x07`);
    }
    terminal.write(`\x1b]${'1'.repeat(1_000)};?\x07`);
    terminal.write('\x1b]11;?oops\x07');
    expect(replies).toEqual([]);
    terminal.write(codexQueries);
    expect(replies.join('')).toBe(foregroundReply + backgroundReply);
  });

  test('clears partial queries on reset and keeps separate terminal state', () => {
    const first = createTerminal();
    const second = createTerminal();
    first.terminal.write('\x1b]11;');
    second.terminal.write('?\x07');
    first.terminal.reset();
    first.terminal.write('?\x07');
    expect(first.replies).toEqual([]);
    expect(second.replies).toEqual([]);
    first.terminal.write(codexQueries);
    expect(first.replies.join('')).toBe(foregroundReply + backgroundReply);
  });
});
