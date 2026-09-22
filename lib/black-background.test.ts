import { beforeAll, describe, expect, test } from 'bun:test';
import { CanvasRenderer, Ghostty, type GhosttyCell } from './index';

let ghostty: Ghostty;
beforeAll(async () => {
  ghostty = await Ghostty.load();
});

// Use the real WASM parser and renderer, recording canvas background paints.
function paintBackground(sequence: string, background: number, selected = false) {
  const terminal = ghostty.createTerminal(10, 2, {
    fgColor: 0x30372c,
    bgColor: background,
    palette: [0x242a21],
  });
  try {
    terminal.write(sequence);
    const cell = terminal.getLine(0)?.[0];
    if (!cell) throw new Error('Missing terminal cell');
    const paints: { color: string; rect: number[] }[] = [];
    const renderer = Object.assign(Object.create(CanvasRenderer.prototype), {
      ctx: {
        fillStyle: '',
        save() {},
        restore() {},
        setTransform() {},
        fillRect(...rect: number[]) {
          paints.push({ color: this.fillStyle, rect });
        },
      },
      deviceMetrics: { width: 10, height: 20 },
      theme: { selectionBackground: '#cbd4bf' },
      currentSelectionCoords: selected ? { startCol: 0, startRow: 0, endCol: 0, endRow: 0 } : null,
    }) as CanvasRenderer;
    // Access the renderer's private method without mocking its behavior.
    const internal = renderer as unknown as {
      renderCellBackgrounds(line: GhosttyCell[], y: number): void;
    };
    internal.renderCellBackgrounds([cell], 0);
    return paints.at(-1);
  } finally {
    terminal.free();
  }
}

describe('resolved terminal backgrounds', () => {
  for (const background of [0xf5f3eb, 0x1e1e1e]) {
    describe(`theme background ${background.toString(16)}`, () => {
      for (const [name, sequence] of [
        ['truecolor black', '\x1b[48;2;0;0;0mX'],
        ['256-color black', '\x1b[48;5;16mX'],
        ['inverse black foreground', '\x1b[38;2;0;0;0;7mX'],
      ]) {
        test(`paints ${name}`, () => {
          expect(paintBackground(sequence, background)).toEqual({
            color: 'rgb(0, 0, 0)',
            rect: [0, 0, 10, 20],
          });
        });
      }

      test('restores the configured default after an explicit background', () => {
        const color = `rgb(${background >> 16}, ${(background >> 8) & 255}, ${background & 255})`;
        expect(paintBackground('\x1b[48;2;0;0;0m\x1b[49mX', background)?.color).toBe(color);
        expect(paintBackground('\x1b[48;2;0;0;0m\x1b[0mX', background)?.color).toBe(color);
      });

      test('uses the configured ANSI black palette entry', () => {
        expect(paintBackground('\x1b[40mX', background)?.color).toBe('rgb(36, 42, 33)');
      });

      test('preserves explicit nonblack RGB colors', () => {
        expect(paintBackground('\x1b[48;2;12;34;56mX', background)?.color).toBe('rgb(12, 34, 56)');
      });

      test('selection paints over black, including inverse video', () => {
        for (const sequence of ['\x1b[48;2;0;0;0mX', '\x1b[38;2;0;0;0;7mX']) {
          expect(paintBackground(sequence, background, true)?.color).toBe('#cbd4bf');
        }
      });

      test('fills both columns of a wide character', () => {
        expect(paintBackground('\x1b[48;2;0;0;0m界', background)).toEqual({
          color: 'rgb(0, 0, 0)',
          rect: [0, 0, 20, 20],
        });
      });
    });
  }
});
