/** Editor-only UI state (not part of the IR): canvas mode, panel toggles,
 * and manual code-edit overrides (keyed `${target}:${path}`). */
import { create } from 'zustand';

export type CanvasMode = 'blocks' | 'preview';

export const overrideKey = (target: string, path: string) => `${target}:${path}`;

interface UIState {
  canvasMode: CanvasMode;
  setCanvasMode(m: CanvasMode): void;
  showCode: boolean;
  toggleCode(): void;

  /** Manual edits to generated files. The IR stays the sourc