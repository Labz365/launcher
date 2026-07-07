/**
 * Shared, target-agnostic helpers for emitters: a tiny indentation-aware code
 * builder, identifier casing, and color parsing. Nothing here emits target
 * syntax — it only helps emitters format what they produce.
 */

/** Accumulates lines with structured indentation. */
export class Code {
  private lines: string[] = [];
  private depth = 0;
  constructor(private readonly unit = '  ') {}

  line(text = ''): this {
    if (text === '') this.lines.push('');
    else this.lines.push(this.unit.repeat(this.depth) + text);
    return this;
  }

  /** Push multiple raw lines (each gets current indentation). */
  lines_(text: string): this {
    for (const l of text.split('\n')) this.line(l);
    return this;
  }

  indent(): this { this.depth += 1; return this; }
  dedent(): this { this.depth = Math.max(0, this.depth - 1); return this; }

  /** Run `fn` at one deeper indentation level. */
  block(fn: () => void): this {
    this.indent();
    fn();
    this.dedent();
    return this;
  }

  toString(): string {
    return this.lines.join('\n');
  }
}

export function pascalCase(s: string): string {
  return s
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ''))
    .join('') || 'Unnamed';
}

export function camelCase(s: string): string {
  const p = pascalCase(s);
  return p ? p[0].toLowerCase() + p.slice(1) : 'unnamed';
}

/** Escape a string for a double-quoted target literal. */
export function escapeStr(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

/** Parse "#RRGGBB" / "#RGB" into {r,g,b} 0-255. Returns null if unparseable. */
export function parseHex(hex?: string): { r: number; g: number; b: number } | null {
  if (!hex) return null;
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** Normalize hex to "RRGGBB" uppercase, or null. */
export function normHex(hex?: string): string | null {
  const c = parseHex(hex);
  if (!c) return null;
  const to2 = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
  return `${to2(c.r)}${to2(c.g)}${to2(c.b)}`;
}
