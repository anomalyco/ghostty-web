type State = 'text' | 'escape' | 'osc' | 'osc-escape' | 'string' | 'string-escape';
interface ColorQuery {
  slot: 10 | 11;
  terminator: string;
}

// Stateful, bounded observer of 7-bit control sequences in the UTF-8 stream.
// Binary writes are scanned without decoding or altering split UTF-8 codepoints.
export class ColorQueryParser {
  private state: State = 'text';
  private body: string | null = '';

  reset(): void {
    this.state = 'text';
    this.body = '';
  }

  read(data: string | Uint8Array): ColorQuery[] {
    const queries: ColorQuery[] = [];
    for (let index = 0; index < data.length; index++) {
      const byte = typeof data === 'string' ? data.charCodeAt(index) : data[index];
      if (byte === 0x18 || byte === 0x1a) {
        this.reset(); // CAN / SUB cancel an incomplete control sequence.
        continue;
      }
      switch (this.state) {
        case 'text':
          if (byte === 0x1b) this.state = 'escape';
          break;
        case 'escape':
          this.escape(byte);
          break;
        case 'osc':
          if (byte === 0x07) this.finish('\x07', queries);
          else if (byte === 0x1b) this.state = 'osc-escape';
          else if (this.body !== null) {
            // Longer / non-ASCII payloads cannot be the queries we support.
            // Stay inside OSC until its terminator without retaining the data.
            this.body =
              this.body.length < 32 && byte >= 0x20 && byte < 0x7f
                ? this.body + String.fromCharCode(byte)
                : null;
          }
          break;
        case 'osc-escape':
          if (byte === 0x5c) this.finish('\x1b\\', queries);
          else {
            this.body = '';
            this.escape(byte);
          }
          break;
        case 'string':
          if (byte === 0x1b) this.state = 'string-escape';
          break;
        case 'string-escape':
          // DCS / SOS / PM / APC payloads are opaque, including embedded OSC.
          if (byte === 0x5c) this.reset();
          else if (byte !== 0x1b) this.state = 'string';
          break;
      }
    }
    return queries;
  }

  private escape(byte: number): void {
    if (byte === 0x5d) {
      this.state = 'osc';
      this.body = '';
    } else if ([0x50, 0x58, 0x5e, 0x5f].includes(byte)) {
      this.state = 'string';
    } else {
      this.state = byte === 0x1b ? 'escape' : 'text';
    }
  }

  private finish(terminator: string, queries: ColorQuery[]): void {
    const match = this.body?.match(/^(10|11);(\?(?:;\?)*)$/);
    if (match) {
      const start = Number(match[1]);
      const count = match[2].split(';').length;
      for (let slot = start; slot < start + count && slot <= 11; slot++) {
        queries.push({ slot: slot as 10 | 11, terminator });
      }
    }
    this.reset();
  }
}
