import { expect, test } from 'bun:test';

const legacyWebExports = [
  'ghostty_terminal_new',
  'ghostty_terminal_new_with_config',
  'ghostty_terminal_free',
  'ghostty_terminal_resize',
  'ghostty_terminal_write',
  'ghostty_render_state_update',
  'ghostty_render_state_get_cols',
  'ghostty_render_state_get_rows',
  'ghostty_render_state_get_cursor_x',
  'ghostty_render_state_get_cursor_y',
  'ghostty_render_state_get_cursor_visible',
  'ghostty_render_state_get_bg_color',
  'ghostty_render_state_get_fg_color',
  'ghostty_render_state_is_row_dirty',
  'ghostty_render_state_mark_clean',
  'ghostty_render_state_get_viewport',
  'ghostty_render_state_get_grapheme',
  'ghostty_terminal_is_alternate_screen',
  'ghostty_terminal_has_mouse_tracking',
  'ghostty_terminal_get_mode',
  'ghostty_terminal_get_scrollback_length',
  'ghostty_terminal_get_scrollback_line',
  'ghostty_terminal_get_scrollback_grapheme',
  'ghostty_terminal_is_row_wrapped',
  'ghostty_terminal_get_hyperlink_uri',
  'ghostty_terminal_get_scrollback_hyperlink_uri',
  'ghostty_terminal_has_response',
  'ghostty_terminal_read_response',
  'ghostty_sprite_has_codepoint',
  'ghostty_sprite_rasterize',
] as const;

test('the published ghostty-web WASM ABI remains available', async () => {
  const bytes = await Bun.file(new URL('../ghostty-vt.wasm', import.meta.url)).arrayBuffer();
  const module = await WebAssembly.compile(bytes);
  const exports = new Set(WebAssembly.Module.exports(module).map(({ name }) => name));

  for (const name of legacyWebExports) {
    expect(exports.has(name), `missing WASM export: ${name}`).toBe(true);
  }
});
