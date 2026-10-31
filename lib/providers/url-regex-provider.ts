/**
 * URL Regex Link Provider
 *
 * Detects plain text URLs using regex pattern matching.
 * Supports common protocols but excludes file paths.
 *
 * This provider runs after OSC8LinkProvider, so explicit hyperlinks
 * take precedence over regex-detected URLs.
 */

import type { IBufferCellPosition, ILink, ILinkProvider } from '../types';

/**
 * URL Regex Provider
 *
 * Detects plain text URLs using regex. A URL that the terminal soft-wrapped
 * across rows is detected as one link spanning those rows. Rows the program
 * separated with a real newline are never joined. Does not detect file paths.
 *
 * Supported protocols:
 * - https://, http://
 * - mailto:
 * - ftp://, ssh://, git://
 * - tel:, magnet:
 * - gemini://, gopher://, news:
 */
export class UrlRegexProvider implements ILinkProvider {
  /**
   * URL regex pattern
   * Matches common protocols followed by valid URL characters
   * Excludes file paths (no ./ or ../ or bare /)
   */
  private static readonly URL_REGEX =
    /(?:https?:\/\/|mailto:|ftp:\/\/|ssh:\/\/|git:\/\/|tel:|magnet:|gemini:\/\/|gopher:\/\/|news:)[\w\-.~:\/?#@!$&*+,;=%]+/gi;

  /**
   * Characters to strip from end of URLs
   * Common punctuation that's unlikely to be part of the URL
   */
  private static readonly TRAILING_PUNCTUATION = /[.,;!?)\]]+$/;

  /**
   * Most rows joined in either direction from the requested row, bounding the
   * scan for very long wrapped output.
   */
  private static readonly MAX_WRAPPED_ROWS = 64;

  constructor(private terminal: ITerminalForUrlProvider) {}

  /**
   * Provide all regex-detected URLs touching the given row. A URL that
   * soft-wraps onto neighbouring rows is returned with its full multi-row range.
   */
  provideLinks(y: number, callback: (links: ILink[] | undefined) => void): void {
    const buffer = this.terminal.buffer.active;
    if (!buffer.getLine(y)) {
      callback(undefined);
      return;
    }

    // Expand to the soft-wrapped logical line containing y.
    let firstRow = y;
    while (
      firstRow > y - UrlRegexProvider.MAX_WRAPPED_ROWS &&
      buffer.getLine(firstRow)?.isWrapped &&
      buffer.getLine(firstRow - 1)
    ) {
      firstRow--;
    }
    let lastRow = y;
    while (
      lastRow < y + UrlRegexProvider.MAX_WRAPPED_ROWS &&
      buffer.getLine(lastRow + 1)?.isWrapped
    ) {
      lastRow++;
    }

    // Join the rows, recording the cell behind every UTF-16 code unit.
    let text = '';
    const positions: IBufferCellPosition[] = [];
    for (let row = firstRow; row <= lastRow; row++) {
      const line = buffer.getLine(row);
      if (!line) break;
      for (let x = 0; x < line.length; x++) {
        const char = cellToChar(line.getCell(x));
        text += char;
        for (let i = 0; i < char.length; i++) positions.push({ x, y: row });
      }
    }

    const links: ILink[] = [];

    // Reset regex state (global flag maintains state)
    UrlRegexProvider.URL_REGEX.lastIndex = 0;

    // Find all URL matches in the logical line
    let match: RegExpExecArray | null = UrlRegexProvider.URL_REGEX.exec(text);
    while (match !== null) {
      // Strip trailing punctuation
      const url = match[0].replace(UrlRegexProvider.TRAILING_PUNCTUATION, '');
      const start = positions[match.index];
      const end = positions[match.index + url.length - 1]; // Inclusive end

      // Skip URLs that are too short (e.g., just "http://") or don't touch the requested row
      if (url.length > 8 && start.y <= y && end.y >= y) {
        links.push({
          text: url,
          range: { start, end },
          activate: (event) => {
            // Open link if Ctrl/Cmd is pressed
            if (event.ctrlKey || event.metaKey) {
              window.open(url, '_blank', 'noopener,noreferrer');
            }
          },
        });
      }

      // Get next match
      match = UrlRegexProvider.URL_REGEX.exec(text);
    }

    callback(links.length > 0 ? links : undefined);
  }

  dispose(): void {
    // No resources to clean up
  }
}

/**
 * Text of one cell. Empty cells and control characters become a space so they
 * end a URL. The spacer cell after a wide character contributes nothing.
 */
function cellToChar(cell: ICellForUrlProvider | undefined): string {
  if (!cell) return ' ';
  const codepoint = cell.getCodepoint();
  if (codepoint === 0 && cell.getWidth?.() === 0) return '';
  if (codepoint < 32 || codepoint > 0x10ffff) return ' ';
  return String.fromCodePoint(codepoint);
}

/**
 * Minimal terminal interface required by UrlRegexProvider
 */
export interface ITerminalForUrlProvider {
  buffer: {
    active: {
      getLine(y: number): IBufferLineForUrlProvider | undefined;
    };
  };
}

/**
 * Minimal buffer line interface for URL detection
 */
interface IBufferLineForUrlProvider {
  length: number;
  /** True when this row is a soft-wrapped continuation of the row above */
  isWrapped?: boolean;
  getCell(x: number): ICellForUrlProvider | undefined;
}

interface ICellForUrlProvider {
  getCodepoint(): number;
  getWidth?(): number;
}
