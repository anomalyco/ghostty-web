/**
 * Tests for Canvas Renderer
 *
 * Note: Most renderer tests are visual and require a browser environment.
 * These tests verify non-visual aspects like theme configuration.
 * Full visual tests are in examples/renderer-demo.html
 */

import { describe, expect, spyOn, test } from 'bun:test';
import { Ghostty } from './ghostty';
import { CanvasRenderer, DEFAULT_THEME } from './renderer';
import type { GhosttyCell } from './types';
import { CellFlags } from './types';

function mockCanvas() {
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  const fillRects: Array<{ color: string; rect: [number, number, number, number] }> = [];
  const transforms: Array<[number, number, number, number, number, number]> = [];
  const fillTextTransforms: Array<[number, number, number, number, number, number]> = [];
  const measuredFontSizes: number[] = [];
  const drawImages: Array<{ width: number; height: number; x: number; y: number }> = [];
  const tints: Array<{ color: string; alpha: number; width: number; height: number }> = [];
  const paths: Array<[number, number, number, number]> = [];
  let fillTextCount = 0;
  let strokeCount = 0;
  let clipCount = 0;

  HTMLCanvasElement.prototype.getContext = function (contextType: string, options?: any) {
    if (contextType !== '2d') return originalGetContext.call(this, contextType, options);
    const stack: Array<[number, number, number, number, number, number]> = [];
    let transform: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];

    return {
      canvas: this,
      fillStyle: '#000000',
      strokeStyle: '#000000',
      font: '15px monospace',
      textAlign: 'start',
      textBaseline: 'alphabetic',
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      lineWidth: 1,
      measureText(this: { font: string }, text: string) {
        const size = Number.parseFloat(this.font);
        measuredFontSizes.push(size);
        return {
          width: text === 'M' ? size * 0.51 : size,
          actualBoundingBoxAscent: size * 0.7,
          actualBoundingBoxDescent: size * 0.2,
        };
      },
      fillRect(this: { fillStyle: string }, x: number, y: number, width: number, height: number) {
        fillRects.push({ color: this.fillStyle, rect: [x, y, width, height] });
        if ((this as any).globalCompositeOperation === 'source-in') {
          tints.push({
            color: this.fillStyle,
            alpha: (this as any).globalAlpha,
            width,
            height,
          });
        }
      },
      setTransform(a: number, b: number, c: number, d: number, e: number, f: number) {
        transform = [a, b, c, d, e, f];
        transforms.push(transform);
      },
      clearRect: () => {},
      fillText: () => {
        fillTextCount++;
        fillTextTransforms.push(transform);
      },
      createImageData: (width: number, height: number) => ({
        data: new Uint8ClampedArray(width * height * 4),
        width,
        height,
      }),
      putImageData: () => {},
      drawImage: (image: HTMLCanvasElement, x: number, y: number) => {
        drawImages.push({ width: image.width, height: image.height, x, y });
      },
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => strokeCount++,
      rect: (x: number, y: number, width: number, height: number) =>
        paths.push([x, y, width, height]),
      clip: () => clipCount++,
      save: () => stack.push(transform),
      restore: () => {
        transform = stack.pop() ?? transform;
      },
    } as any;
  };

  return {
    fillRects,
    transforms,
    fillTextTransforms,
    measuredFontSizes,
    drawImages,
    tints,
    paths,
    get fillTextCount() {
      return fillTextCount;
    },
    get strokeCount() {
      return strokeCount;
    },
    get clipCount() {
      return clipCount;
    },
    restore: () => {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
    },
  };
}

function cell(bg_r: number, bg_g: number, bg_b: number): GhosttyCell {
  return {
    codepoint: 32,
    fg_r: 255,
    fg_g: 255,
    fg_b: 255,
    bg_r,
    bg_g,
    bg_b,
    flags: 0,
    width: 1,
    hyperlink_id: 0,
    grapheme_len: 0,
  };
}

function buffer(
  line: GhosttyCell[] | null,
  cols: number,
  rows: number = 1,
  cursor = { x: 0, y: 0, visible: false }
) {
  return {
    getLine: () => line,
    getCursor: () => cursor,
    getDimensions: () => ({ cols, rows }),
    isRowDirty: () => true,
    clearDirty: () => {},
  };
}

describe('CanvasRenderer', () => {
  describe('Default Theme', () => {
    test('has all required ANSI colors', () => {
      expect(DEFAULT_THEME.black).toBe('#000000');
      expect(DEFAULT_THEME.red).toBe('#cd3131');
      expect(DEFAULT_THEME.green).toBe('#0dbc79');
      expect(DEFAULT_THEME.yellow).toBe('#e5e510');
      expect(DEFAULT_THEME.blue).toBe('#2472c8');
      expect(DEFAULT_THEME.magenta).toBe('#bc3fbc');
      expect(DEFAULT_THEME.cyan).toBe('#11a8cd');
      expect(DEFAULT_THEME.white).toBe('#e5e5e5');
    });

    test('has all bright ANSI colors', () => {
      expect(DEFAULT_THEME.brightBlack).toBe('#666666');
      expect(DEFAULT_THEME.brightRed).toBe('#f14c4c');
      expect(DEFAULT_THEME.brightGreen).toBe('#23d18b');
      expect(DEFAULT_THEME.brightYellow).toBe('#f5f543');
      expect(DEFAULT_THEME.brightBlue).toBe('#3b8eea');
      expect(DEFAULT_THEME.brightMagenta).toBe('#d670d6');
      expect(DEFAULT_THEME.brightCyan).toBe('#29b8db');
      expect(DEFAULT_THEME.brightWhite).toBe('#ffffff');
    });

    test('has foreground and background colors', () => {
      expect(DEFAULT_THEME.foreground).toBe('#d4d4d4');
      expect(DEFAULT_THEME.background).toBe('#1e1e1e');
    });

    test('has cursor colors', () => {
      expect(DEFAULT_THEME.cursor).toBe('#ffffff');
      expect(DEFAULT_THEME.cursorAccent).toBe('#1e1e1e');
    });

    test('has selection colors', () => {
      // Selection colors are now solid (not semi-transparent overlay)
      // Ghostty-style: selection bg = foreground color, selection fg = background color
      expect(DEFAULT_THEME.selectionBackground).toBe('#d4d4d4');
      expect(DEFAULT_THEME.selectionForeground).toBe('#1e1e1e');
    });
  });

  describe('Theme Color Format', () => {
    test('all colors are valid hex strings', () => {
      const hexPattern = /^#[0-9a-f]{6}$/i;

      expect(DEFAULT_THEME.black).toMatch(hexPattern);
      expect(DEFAULT_THEME.foreground).toMatch(hexPattern);
      expect(DEFAULT_THEME.background).toMatch(hexPattern);
      expect(DEFAULT_THEME.cursor).toMatch(hexPattern);
    });
  });

  describe('Font Metrics', () => {
    test('ignores powerline glyph metrics when they match the fallback stack', () => {
      const originalGetContext = HTMLCanvasElement.prototype.getContext;

      HTMLCanvasElement.prototype.getContext = function (contextType: string, options?: any) {
        if (contextType !== '2d') {
          return originalGetContext.call(this, contextType, options);
        }

        return {
          canvas: this,
          font: '15px "JetBrainsMono Nerd Font Mono", monospace',
          scale: () => {},
          measureText(this: { font: string }, text: string) {
            if (text === 'M') {
              return {
                width: 8,
                actualBoundingBoxAscent: 10.1,
                actualBoundingBoxDescent: 2.1,
              };
            }

            if (text === 'Mg') {
              return {
                width: 16,
                actualBoundingBoxAscent: 10.1,
                actualBoundingBoxDescent: 2.1,
              };
            }

            if (text === 'Mg\uE0B0\uE0B2') {
              return this.font.includes('__ghostty_missing_font__')
                ? {
                    width: 32,
                    actualBoundingBoxAscent: 14.6,
                    actualBoundingBoxDescent: 4.4,
                  }
                : {
                    width: 32,
                    actualBoundingBoxAscent: 14.6,
                    actualBoundingBoxDescent: 4.4,
                  };
            }

            return { width: 0 };
          },
        } as any;
      };

      try {
        const renderer = new CanvasRenderer(document.createElement('canvas'));

        expect(renderer.getMetrics()).toEqual({
          width: 8,
          height: 12,
          baseline: 10,
        });
      } finally {
        HTMLCanvasElement.prototype.getContext = originalGetContext;
      }
    });

    test('uses face metrics when Nerd sprite glyph bounds differ', () => {
      const originalGetContext = HTMLCanvasElement.prototype.getContext;

      HTMLCanvasElement.prototype.getContext = function (contextType: string, options?: any) {
        if (contextType !== '2d') {
          return originalGetContext.call(this, contextType, options);
        }

        return {
          canvas: this,
          font: '15px "JetBrainsMono Nerd Font Mono"',
          scale: () => {},
          measureText(this: { font: string }, text: string) {
            if (text === 'M') {
              return {
                width: 8,
                actualBoundingBoxAscent: 10.2,
                actualBoundingBoxDescent: 0.3,
              };
            }

            if (text === 'Mg') {
              return {
                width: 16,
                actualBoundingBoxAscent: 9.4,
                actualBoundingBoxDescent: 0.2,
              };
            }

            if (text === 'Mg\uE0B0\uE0B2') {
              return this.font.includes('__ghostty_missing_font__')
                ? {
                    width: 32,
                    actualBoundingBoxAscent: 14.6,
                    actualBoundingBoxDescent: 4.4,
                  }
                : {
                    width: 32,
                    actualBoundingBoxAscent: 10.2,
                    actualBoundingBoxDescent: 0.3,
                  };
            }

            return { width: 0 };
          },
        } as any;
      };

      try {
        const renderer = new CanvasRenderer(document.createElement('canvas'), {
          fontFamily: '"JetBrainsMono Nerd Font Mono", monospace',
        });

        expect(renderer.getMetrics()).toEqual({
          width: 8,
          height: 10,
          baseline: 10,
        });
      } finally {
        HTMLCanvasElement.prototype.getContext = originalGetContext;
      }
    });
  });

  describe('Device Pixel Ratio', () => {
    test('remeasures and synchronously rebuilds the backing store when browser DPR changes', () => {
      const descriptor = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');
      const mock = mockCanvas();
      Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1 });

      try {
        const canvas = document.createElement('canvas');
        const renderer = new CanvasRenderer(canvas);

        renderer.resize(3, 2);
        expect(canvas.width).toBe(24);
        expect(canvas.height).toBe(28);

        Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1.25 });
        renderer.render(buffer(null, 3, 2));

        expect(canvas.width).toBe(30);
        expect(canvas.height).toBe(34);
        expect(canvas.style.width).toBe('24px');
        expect(canvas.style.height).toBe('27.2px');
        expect(mock.measuredFontSizes).toContain(15);
        expect(mock.measuredFontSizes).toContain(18.75);
      } finally {
        mock.restore();
        if (descriptor) Object.defineProperty(window, 'devicePixelRatio', descriptor);
        else (window as { devicePixelRatio?: number }).devicePixelRatio = undefined;
      }
    });

    test('uses exact integer device cells at fractional DPR', () => {
      const mock = mockCanvas();

      try {
        const canvas = document.createElement('canvas');
        const renderer = new CanvasRenderer(canvas, { devicePixelRatio: 1.25 });
        renderer.resize(7, 3);

        expect(canvas.width).toBe(70);
        expect(canvas.height).toBe(51);
        expect(canvas.style.width).toBe('56px');
        expect(canvas.style.height).toBe('40.8px');
        expect(renderer.getMetrics()).toEqual({ width: 8, height: 13.6, baseline: 10.4 });
      } finally {
        mock.restore();
      }
    });

    test('coalesces equal backgrounds into one gap-free physical fill', () => {
      const mock = mockCanvas();

      try {
        const renderer = new CanvasRenderer(document.createElement('canvas'), {
          devicePixelRatio: 1.25,
        });
        renderer.render(buffer([cell(12, 34, 56), cell(12, 34, 56), cell(12, 34, 56)], 3));

        expect(mock.fillRects.filter((call) => call.color === 'rgb(12, 34, 56)')).toEqual([
          { color: 'rgb(12, 34, 56)', rect: [0, 0, 30, 17] },
        ]);
        expect(mock.transforms.at(-1)).toEqual([1, 0, 0, 1, 0, 0]);
      } finally {
        mock.restore();
      }
    });

    test('does not resize repeatedly when the integer grid is unchanged', () => {
      const mock = mockCanvas();

      try {
        const renderer = new CanvasRenderer(document.createElement('canvas'), {
          devicePixelRatio: 1.25,
        });
        const resize = spyOn(renderer, 'resize');
        const renderBuffer = buffer(null, 3);

        renderer.resize(3, 1);
        resize.mockClear();
        renderer.render(renderBuffer);
        renderer.render(renderBuffer);

        expect(resize).not.toHaveBeenCalled();
      } finally {
        mock.restore();
      }
    });

    test('renders cached native block and Powerline sprites at exact physical cell bounds', async () => {
      const mock = mockCanvas();

      try {
        const ghostty = await Ghostty.load();
        const rasterize = spyOn(ghostty, 'rasterizeSprite');
        const renderer = new CanvasRenderer(document.createElement('canvas'), {
          devicePixelRatio: 1.25,
          ghostty,
        });
        const block = cell(0, 0, 0);
        block.codepoint = 0x2588;
        block.width = 2;
        block.fg_r = 12;
        block.fg_g = 34;
        block.fg_b = 56;
        block.flags = CellFlags.FAINT | CellFlags.UNDERLINE;

        renderer.render(buffer([block], 2));
        renderer.render(buffer([block], 2));

        expect(rasterize).toHaveBeenCalledTimes(1);
        expect(rasterize).toHaveBeenCalledWith(0x2588, 20, 17, 2);
        expect(mock.drawImages.at(-1)).toEqual({ width: 20, height: 17, x: 0, y: 0 });
        expect(mock.tints).toContainEqual({
          color: 'rgb(12, 34, 56)',
          alpha: 0.5,
          width: 20,
          height: 17,
        });
        expect(mock.fillTextCount).toBe(0);
        expect(mock.strokeCount).toBe(0);
        expect(mock.fillRects.filter((call) => call.color === 'rgb(12, 34, 56)')).toContainEqual({
          color: 'rgb(12, 34, 56)',
          rect: [0, 15, 20, 2],
        });

        const powerline = cell(0, 0, 0);
        powerline.codepoint = 0xe0b0;
        renderer.render(buffer([cell(0, 0, 0), powerline], 2));

        expect(rasterize).toHaveBeenLastCalledWith(0xe0b0, 10, 17, 2);
        expect(mock.drawImages.at(-1)).toEqual({ width: 10, height: 17, x: 10, y: 0 });
      } finally {
        mock.restore();
      }
    });

    test('draws cell and link decorations on integer physical coordinates', () => {
      const mock = mockCanvas();

      try {
        const renderer = new CanvasRenderer(document.createElement('canvas'), {
          devicePixelRatio: 1.25,
        });
        const decorated = cell(0, 0, 0);
        decorated.width = 2;
        decorated.flags = CellFlags.UNDERLINE | CellFlags.STRIKETHROUGH;
        decorated.fg_r = 12;
        decorated.fg_g = 34;
        decorated.fg_b = 56;
        decorated.hyperlink_id = 7;
        renderer.setHoveredHyperlinkId(7);
        renderer.setHoveredLinkRange({ startX: 1, startY: 0, endX: 1, endY: 0 });

        renderer.render(buffer([cell(0, 0, 0), decorated], 3));

        expect(mock.fillRects.filter((call) => call.color === 'rgb(12, 34, 56)')).toEqual([
          { color: 'rgb(12, 34, 56)', rect: [10, 15, 20, 2] },
          { color: 'rgb(12, 34, 56)', rect: [10, 8, 20, 2] },
        ]);
        expect(mock.fillRects.filter((call) => call.color === '#4A90E2')).toEqual([
          { color: '#4A90E2', rect: [10, 15, 20, 2] },
          { color: '#4A90E2', rect: [10, 15, 20, 2] },
        ]);
        expect(mock.strokeCount).toBe(0);
      } finally {
        mock.restore();
      }
    });

    test('draws and clips cursors to exact integer physical cell bounds', () => {
      const mock = mockCanvas();

      try {
        const line = [cell(0, 0, 0), cell(0, 0, 0)];
        const cursor = { x: 1, y: 1, visible: true };
        const block = new CanvasRenderer(document.createElement('canvas'), {
          devicePixelRatio: 1.25,
          cursorStyle: 'block',
          theme: { cursor: '#010203' },
        });
        block.render(buffer(line, 2, 2, cursor));

        const underline = new CanvasRenderer(document.createElement('canvas'), {
          devicePixelRatio: 1.25,
          cursorStyle: 'underline',
          theme: { cursor: '#040506' },
        });
        underline.render(buffer(line, 2, 2, cursor));

        const bar = new CanvasRenderer(document.createElement('canvas'), {
          devicePixelRatio: 1.25,
          cursorStyle: 'bar',
          theme: { cursor: '#070809' },
        });
        bar.render(buffer(line, 2, 2, cursor));

        expect(mock.fillRects).toContainEqual({ color: '#010203', rect: [10, 17, 10, 17] });
        expect(mock.fillRects).toContainEqual({ color: '#040506', rect: [10, 32, 10, 2] });
        expect(mock.fillRects).toContainEqual({ color: '#070809', rect: [10, 17, 2, 17] });
        expect(mock.paths).toContainEqual([10, 17, 10, 17]);
        expect(mock.clipCount).toBe(1);
        expect(mock.fillTextTransforms.at(-1)).toEqual([1.25, 0, 0, 1.25, 0, 0]);
      } finally {
        mock.restore();
      }
    });
  });
});
