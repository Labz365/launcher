/** Editor-only UI state (not part of the IR): canvas mode, panel toggles,
 * and manual code-edit overrides (keyed `${target}:${path}`). */
import { create } from 'zustand';

export type CanvasMode = 'design' | 'blocks' | 'preview';

export const overrideKey = (target: string, path: string) => `${target}:${path}`;

interface UIState {
  canvasMode: CanvasMode;
  setCanvasMode(m: CanvasMode): void;
  showCode: boolean;
  toggleCode(): void;
  templatePickerOpen: boolean;
  openTemplatePicker(): void;
  closeTemplatePicker(): void;

  codeOverrides: Record<string, string>;
  setCodeOverride(key: string, contents: string): void;
  clearCodeOverride(key: string): void;
  clearAllOverridesForTarget(target: string): void;
}

export const useUI = create<UIState>((set) => ({
  canvasMode: 'design',
  setCanvasMode: (m) => set({ canvasMode: m }),
  showCode: true,
  toggleCode: () => set((s) => ({ showCode: !s.showCode })),
  templatePickerOpen: false,
  openTemplatePicker: () => set({ templatePickerOpen: true }),
  closeTemplatePicker: () => set({ templatePickerOpen: false }),

  codeOverrides: {},
  setCodeOverride: (key, contents) =>
    set((s) => ({ codeOverrides: { ...s.codeOverrides, [key]: contents } })),
  clearCodeOverride: (key) =>
    set((s) => {
      const next = { ...s.codeOverrides };
      delete next[key];
      return { codeOverrides: next };
    }),
  clearAllOverridesForTarget: (target) =>
    set((s) => {
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries(s.codeOverrides)) {
        if (!k.startsWith(target + ':')) next[k] = v;
      }
      return { codeOverrides: next };
    }),
}));
