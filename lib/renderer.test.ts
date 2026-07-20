/**
 * Tests for Canvas Renderer
 *
 * Note: Most renderer tests are visual and require a browser environment.
 * These tests verify non-visual aspects like theme configuration.
 * Full visual tests are in examples/renderer-demo.html
 */

import { describe, expect, spyOn, test } from 'bun:test';
import { CanvasRenderer, DEFAULT_THEME } from './renderer';

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
          height: 14,
          baseline: 11,
        });
      } finally {
        HTMLCanvasElement.prototype.getContext = originalGetContext;
      }
    });

    test('rounds ascent and descent separately when a Nerd font differs from the fallback stack', () => {
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
          height: 12,
          baseline: 11,
        });
      } finally {
        HTMLCanvasElement.prototype.getContext = originalGetContext;
      }
    });
  });

  describe('Device Pixel Ratio', () => {
    test('resizes and redraws the backing store when browser DPR changes', () => {
      const descriptor = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');
      Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1 });

      try {
        const canvas = document.createElement('canvas');
        const renderer = new CanvasRenderer(canvas);
        const buffer = {
          getLine: () => null,
          getCursor: () => ({ x: 0, y: 0, visible: false }),
          getDimensions: () => ({ cols: 3, rows: 2 }),
          isRowDirty: () => false,
          clearDirty: () => {},
        };

        renderer.resize(3, 2);
        expect(canvas.width).toBe(24);
        expect(canvas.height).toBe(30);

        Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1.25 });
        renderer.render(buffer);

        expect(canvas.width).toBe(30);
        expect(canvas.height).toBe(38);
        expect(canvas.style.width).toBe('24px');
        expect(canvas.style.height).toBe('30px');
      } finally {
        if (descriptor) Object.defineProperty(window, 'devicePixelRatio', descriptor);
        else (window as { devicePixelRatio?: number }).devicePixelRatio = undefined;
      }
    });

    test('compares rounded backing dimensions without resizing every frame', () => {
      const renderer = new CanvasRenderer(document.createElement('canvas'), {
        devicePixelRatio: 1.25,
      });
      const resize = spyOn(renderer, 'resize');
      const buffer = {
        getLine: () => null,
        getCursor: () => ({ x: 0, y: 0, visible: false }),
        getDimensions: () => ({ cols: 3, rows: 1 }),
        isRowDirty: () => false,
        clearDirty: () => {},
      };

      renderer.resize(3, 1);
      resize.mockClear();
      renderer.render(buffer);
      renderer.render(buffer);

      expect(resize).not.toHaveBeenCalled();
    });
  });
});
