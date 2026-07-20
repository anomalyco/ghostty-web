import { expect, test } from 'bun:test';
import { Ghostty } from './ghostty';

test('Ghostty rasterizes its built-in block and Powerline sprites', async () => {
  const ghostty = await Ghostty.load();
  const width = 11;
  const height = 19;

  expect(ghostty.hasSpriteCodepoint(0x41)).toBe(false);
  expect(ghostty.rasterizeSprite(0x41, width, height, 2)).toBeNull();

  for (const codepoint of [0x2588, 0xe0b0, 0xe0b4, 0xe0b6]) {
    expect(ghostty.hasSpriteCodepoint(codepoint)).toBe(true);
    const bitmap = ghostty.rasterizeSprite(codepoint, width, height, 2);
    expect(bitmap).not.toBeNull();
    expect(bitmap?.width).toBe(width);
    expect(bitmap?.height).toBe(height);
    expect(bitmap?.pixels).toHaveLength(width * height);
    expect(bitmap?.pixels.some((pixel) => pixel !== 0)).toBe(true);
  }
});
