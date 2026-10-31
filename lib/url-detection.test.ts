/**
 * URL Detection Tests
 *
 * Tests for the UrlRegexProvider to ensure plain text URLs
 * are correctly detected and made clickable.
 */

import { describe, expect, test } from 'bun:test';
import { UrlRegexProvider } from './providers/url-regex-provider';
import { createIsolatedTerminal } from './test-helpers';
import type { ILink } from './types';

/**
 * Mock terminal for testing
 */
function createMockTerminal(lineText: string) {
  const cells = Array.from(lineText).map((char) => ({
    getCodepoint: () => char.codePointAt(0) || 0,
  }));

  return {
    buffer: {
      active: {
        getLine: (y: number) => {
          if (y !== 0) return undefined;
          return {
            length: cells.length,
            getCell: (x: number) => cells[x],
          };
        },
      },
    },
  };
}

/**
 * Helper to get links from provider
 */
function getLinks(lineText: string): Promise<ILink[] | undefined> {
  const terminal = createMockTerminal(lineText) as any;
  const provider = new UrlRegexProvider(terminal);

  return new Promise((resolve) => {
    provider.provideLinks(0, resolve);
  });
}

describe('URL Detection', () => {
  test('detects HTTPS URLs', async () => {
    const links = await getLinks('Visit https://github.com for code');
    expect(links).toBeDefined();
    expect(links?.length).toBe(1);
    expect(links?.[0].text).toBe('https://github.com');
    expect(links?.[0].range.start.x).toBe(6);
    // End is inclusive - last character is at index 23 (https://github.com is 19 chars, starts at 6)
    expect(links?.[0].range.end.x).toBe(23);
  });

  test('detects HTTP URLs', async () => {
    const links = await getLinks('Check http://example.com');
    expect(links).toBeDefined();
    expect(links?.length).toBe(1);
    expect(links?.[0].text).toBe('http://example.com');
  });

  test('detects mailto: links', async () => {
    const links = await getLinks('Email: mailto:test@example.com');
    expect(links).toBeDefined();
    expect(links?.length).toBe(1);
    expect(links?.[0].text).toBe('mailto:test@example.com');
  });

  test('detects ssh:// URLs', async () => {
    const links = await getLinks('Connect via ssh://user@server.com');
    expect(links).toBeDefined();
    expect(links?.length).toBe(1);
    expect(links?.[0].text).toBe('ssh://user@server.com');
  });

  test('detects git:// URLs', async () => {
    const links = await getLinks('Clone git://github.com/repo.git');
    expect(links).toBeDefined();
    expect(links?.length).toBe(1);
    expect(links?.[0].text).toBe('git://github.com/repo.git');
  });

  test('detects ftp:// URLs', async () => {
    const links = await getLinks('Download ftp://files.example.com/file');
    expect(links).toBeDefined();
    expect(links?.length).toBe(1);
    expect(links?.[0].text).toBe('ftp://files.example.com/file');
  });

  test('strips trailing period', async () => {
    const links = await getLinks('Check https://example.com.');
    expect(links).toBeDefined();
    expect(links?.length).toBe(1);
    expect(links?.[0].text).toBe('https://example.com');
    // Should NOT include the trailing period
    expect(links?.[0].text.endsWith('.')).toBe(false);
  });

  test('strips trailing comma', async () => {
    const links = await getLinks('See https://example.com, or else');
    expect(links).toBeDefined();
    expect(links?.length).toBe(1);
    expect(links?.[0].text).toBe('https://example.com');
  });

  test('strips trailing parenthesis', async () => {
    const links = await getLinks('(see https://example.com)');
    expect(links).toBeDefined();
    expect(links?.length).toBe(1);
    expect(links?.[0].text).toBe('https://example.com');
  });

  test('strips trailing exclamation', async () => {
    const links = await getLinks('Visit https://example.com!');
    expect(links).toBeDefined();
    expect(links?.length).toBe(1);
    expect(links?.[0].text).toBe('https://example.com');
  });

  test('handles multiple URLs on same line', async () => {
    const links = await getLinks('https://a.com and https://b.com');
    expect(links).toBeDefined();
    expect(links?.length).toBe(2);
    expect(links?.[0].text).toBe('https://a.com');
    expect(links?.[1].text).toBe('https://b.com');
  });

  test('returns undefined when no URL present', async () => {
    const links = await getLinks('No URLs here');
    expect(links).toBeUndefined();
  });

  test('handles URLs with query parameters', async () => {
    const links = await getLinks('https://example.com?foo=bar&baz=qux');
    expect(links).toBeDefined();
    expect(links?.length).toBe(1);
    expect(links?.[0].text).toBe('https://example.com?foo=bar&baz=qux');
  });

  test('handles URLs with fragments', async () => {
    const links = await getLinks('https://example.com/page#section');
    expect(links).toBeDefined();
    expect(links?.length).toBe(1);
    expect(links?.[0].text).toBe('https://example.com/page#section');
  });

  test('handles URLs with ports', async () => {
    const links = await getLinks('https://example.com:8080/path');
    expect(links).toBeDefined();
    expect(links?.length).toBe(1);
    expect(links?.[0].text).toBe('https://example.com:8080/path');
  });

  test('does not detect file paths', async () => {
    const links = await getLinks('/home/user/file.txt');
    expect(links).toBeUndefined();
  });

  test('does not detect relative paths', async () => {
    const links = await getLinks('./relative/path');
    expect(links).toBeUndefined();
  });

  test('link has activate function', async () => {
    const links = await getLinks('https://example.com');
    expect(links).toBeDefined();
    expect(links?.length).toBe(1);
    expect(typeof links?.[0].activate).toBe('function');
  });

  test('detects tel: URLs', async () => {
    const links = await getLinks('Call tel:+1234567890');
    expect(links).toBeDefined();
    expect(links?.length).toBe(1);
    expect(links?.[0].text).toBe('tel:+1234567890');
  });

  test('detects magnet: URLs', async () => {
    const links = await getLinks('Download magnet:?xt=urn:btih:abc123');
    expect(links).toBeDefined();
    expect(links?.length).toBe(1);
    expect(links?.[0].text).toContain('magnet:?xt=urn:btih:abc123');
  });
});

/**
 * Mock terminal whose rows are given as text. A row marked wrapped is a
 * soft-wrapped continuation of the row above, like isWrapped in the buffer.
 * Characters in `wide` occupy two cells, the second a zero-width spacer.
 */
function createMockRows(rows: Array<{ text: string; wrapped?: boolean }>, wide = '') {
  const lines = rows.map(({ text, wrapped }) => {
    const cells = Array.from(text).flatMap((char) => {
      const cell = { getCodepoint: () => char.codePointAt(0) || 0, getWidth: () => 1 };
      if (!wide.includes(char)) return [cell];
      return [cell, { getCodepoint: () => 0, getWidth: () => 0 }];
    });
    return { length: cells.length, isWrapped: wrapped ?? false, getCell: (x: number) => cells[x] };
  });
  return { buffer: { active: { getLine: (y: number) => lines[y] } } };
}

function getRowLinks(terminal: unknown, y: number): Promise<ILink[] | undefined> {
  const provider = new UrlRegexProvider(terminal as any);
  return new Promise((resolve) => provider.provideLinks(y, resolve));
}

describe('URL Detection across soft-wrapped rows', () => {
  const wrappedUrl = createMockRows([
    { text: 'Open http://localhost:5174/#setup-key=6gUCrCAV' },
    { text: 'nq_CYVZYBoCDtsL-6U1gqftme4sEJ_l2Qms to set up', wrapped: true },
  ]);
  const fullUrl = 'http://localhost:5174/#setup-key=6gUCrCAVnq_CYVZYBoCDtsL-6U1gqftme4sEJ_l2Qms';

  test('detects a URL wrapped onto the next row from its first row', async () => {
    const links = await getRowLinks(wrappedUrl, 0);
    expect(links?.length).toBe(1);
    expect(links?.[0].text).toBe(fullUrl);
    expect(links?.[0].range).toEqual({ start: { x: 5, y: 0 }, end: { x: 34, y: 1 } });
  });

  test('detects the same URL from its continuation row', async () => {
    const links = await getRowLinks(wrappedUrl, 1);
    expect(links?.length).toBe(1);
    expect(links?.[0].text).toBe(fullUrl);
    expect(links?.[0].range).toEqual({ start: { x: 5, y: 0 }, end: { x: 34, y: 1 } });
  });

  test('joins a URL wrapped across three rows', async () => {
    const rows = createMockRows([
      { text: 'see https://exa' },
      { text: 'mple.com/a/very', wrapped: true },
      { text: '/long/path done', wrapped: true },
    ]);
    for (const y of [0, 1, 2]) {
      const links = await getRowLinks(rows, y);
      expect(links?.[0].text).toBe('https://example.com/a/very/long/path');
      expect(links?.[0].range).toEqual({ start: { x: 4, y: 0 }, end: { x: 9, y: 2 } });
    }
  });

  test('does not join rows separated by a hard newline', async () => {
    const rows = createMockRows([
      { text: 'Open http://localhost:5174/#setup-key=6gUCrCAV' },
      { text: 'nq_CYVZYBoCDtsL-6U1gqftme4sEJ_l2Qms' },
    ]);
    const links = await getRowLinks(rows, 0);
    expect(links?.[0].text).toBe('http://localhost:5174/#setup-key=6gUCrCAV');
    expect(links?.[0].range.end).toEqual({ x: 45, y: 0 });
    expect(await getRowLinks(rows, 1)).toBeUndefined();
  });

  test('returns only links touching the requested row', async () => {
    const rows = createMockRows([
      { text: 'https://a.com and some text ' },
      { text: 'here then https://b.com', wrapped: true },
    ]);
    expect((await getRowLinks(rows, 0))?.map((link) => link.text)).toEqual(['https://a.com']);
    expect((await getRowLinks(rows, 1))?.map((link) => link.text)).toEqual(['https://b.com']);
  });

  test('maps columns past wide characters and surrogate pairs', async () => {
    const rows = createMockRows([{ text: '漢😀 https://example.com' }], '漢😀');
    const links = await getRowLinks(rows, 0);
    expect(links?.[0].text).toBe('https://example.com');
    expect(links?.[0].range).toEqual({ start: { x: 5, y: 0 }, end: { x: 23, y: 0 } });
  });

  test('detects a URL the real terminal soft-wraps', async () => {
    const term = await createIsolatedTerminal({ cols: 20, rows: 5 });
    term.open(document.createElement('div'));
    try {
      term.write('go https://example.com/abcdefghijklmnop now');
      const links = await getRowLinks(term, 1);
      expect(links?.[0].text).toBe('https://example.com/abcdefghijklmnop');
      expect(links?.[0].range).toEqual({ start: { x: 3, y: 0 }, end: { x: 18, y: 1 } });
    } finally {
      term.dispose();
    }
  });
});
