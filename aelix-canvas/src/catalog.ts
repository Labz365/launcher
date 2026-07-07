/**
 * Palette catalog: how the 11 component types are grouped + labelled in the UI.
 * Pure metadata — no behavior. The IR knows nothing about this; it's editor chrome.
 */
import type { ComponentType } from './core/ir';

export type PaletteGroup = 'Layout' | 'Input' | 'Display' | 'Logic/State';

export interface PaletteItem {
  type: ComponentType;
  label: string;
  group: PaletteGroup;
  /** single-glyph icon (kept dependency-free) */
  glyph: string;
  hint: string;
}

export const PALETTE: PaletteItem[] = [
  { type: 'Container', label: 'Container', group: 'Layout', glyph: '▢', hint: 'Box with padding/background' },
  { type: 'Column', label: 'Column', group: 'Layout', glyph: '▤', hint: 'Vertical stack' },
  { type: 'Row', label: 'Row', group: 'Layout', glyph: '▦', hint: 'Horizontal stack' },
  { type: 'Stack', label: 'Stack', group: 'Layout', glyph: '▣', hint: 'Overlapping layers' },

  { type: 'Text', label: 'Text', group: 'Display', glyph: 'T', hint: 'Label / paragraph' },
  { type: 'Image', label: 'Image', group: 'Display', glyph: '◳', hint: 'Network image' },
  { type: 'Spacer', label: 'Spacer', group: 'Display', glyph: '⎵', hint: 'Fixed gap' },
  { type: 'ListView', label: 'List', group: 'Display', glyph: '☰', hint: 'Repeats over a list var' },

  { type: 'Button', label: 'Button', group: 'Input', glyph: '⬢', hint: 'Tappable action' },
  { type: 'TextField', label: 'Text Field', group: 'Input', glyph: '⌶', hint: 'Text input' },
  { type: 'Switch', label: 'Switch', group: 'Input', glyph: '◖', hint: 'Boolean toggle' },
];

export const GROUP_ORDER: PaletteGroup[] = ['Display', 'Input', 'Layout', 'Logic/State'];

/** Friendlier headings shown in the palette. */
export const GROUP_LABEL: Record<PaletteGroup, string> = {
  Display: 'Content',
  Input: 'Inputs',
  Layout: 'Layout',
  'Logic/State': 'Data',
};

export const GROUP_HUE: Record<PaletteGroup, string> = {
  Layout: 'var(--hue-layout)',
  Display: 'var(--hue-display)',
  Input: 'var(--hue-input)',
  'Logic/State': 'var(--hue-logic)',
};

export function groupOfType(type: ComponentType): PaletteGroup {
  return PALETTE.find((p) => p.type === type)?.group ?? 'Display';
}

export function hueOfType(type: ComponentType): string {
  return GROUP_HUE[groupOfType(type)];
}

export function glyphOfType(type: ComponentType): string {
  return PALETTE.find((p) => p.type === type)?.glyph ?? '◦';
}
