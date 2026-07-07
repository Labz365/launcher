/**
 * Minimal dependency-free ZIP writer (method 0 = stored, UTF-8 names).
 * Enough to package generated projects for download; no compression needed
 * since source files are small.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

export function crc32(d: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < d.length; i++) c = CRC_TABLE[(c ^ d[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

class ByteSink {
  private chunks: Uint8Array[] = [];
  size = 0;
  push(b: Uint8Array): void { this.chunks.push(b); this.size += b.length; }
  u16(v: number): void { this.push(new Uint8Array([v & 0xff, (v >>> 8) & 0xff])); }
  u32(v: number): void { this.push(new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff])); }
  concat(): Uint8Array {
    const out = new Uint8Array(this.size);
    let o = 0;
    for (const c of this.chunks) { out.set(c, o); o += c.length; }
    return out;
  }
}

export interface ZipEntry {
  path: string;
  contents: string;
}

/** Build a ZIP archive (stored entries) from text files. */
export function makeZip(entries: ZipEntry[]): Uint8Array {
  const enc = new TextEncoder();
  const sink = new ByteSink();
  const central: Array<{ name: Uint8Array; crc: number; size: number; offset: number }> = [];

  // DOS date: 2026-01-01 00:00 (any fixed valid stamp).
  const dosTime = 0;
  const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;

  for (const e of entries) {
    const name = enc.encode(e.path.replace(/\\/g, '/'));
    const data = enc.encode(e.contents);
    const crc = crc32(data);
    const offset = sink.size;

    sink.u32(0x04034b50);     // local file header
    sink.u16(20);             // version needed
    sink.u16(0x0800);         // flags: UTF-8 names
    sink.u16(0);              // method: stored
    sink.u16(dosTime);
    sink.u16(dosDate);
    sink.u32(crc);
    sink.u32(data.length);    // compressed size
    sink.u32(data.length);    // uncompressed size
    sink.u16(name.length);
    sink.u16(0);              // extra length
    sink.push(name);
    sink.push(data);

    central.push({ name, crc, size: data.length, offset });
  }

  const cdStart = sink.size;
  for (const c of central) {
    sink.u32(0x02014b50);     // central directory header
    sink.u16(20);             // version made by
    sink.u16(20);             // version needed
    sink.u16(0x0800);
    sink.u16(0);
    sink.u16(dosTime);
    sink.u16(dosDate);
    sink.u32(c.crc);
    sink.u32(c.size);
    sink.u32(c.size);
    sink.u16(c.name.length);
    sink.u16(0);              // extra
    sink.u16(0);              // comment
    sink.u16(0);              // disk number
    sink.u16(0);              // internal attrs
    sink.u32(0);              // external attrs
    sink.u32(c.offset);
    sink.push(c.name);
  }
  const cdSize = sink.size - cdStart;

  sink.u32(0x06054b50);       // end of central directory
  sink.u16(0);
  sink.u16(0);
  sink.u16(central.length);
  sink.u16(central.length);
  sink.u32(cdSize);
  sink.u32(cdStart);
  sink.u16(0);

  return sink.concat();
}
