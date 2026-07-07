/**
 * App-wide singleton IR store + React bindings.
 * The store itself is the framework-agnostic one from src/core; here we create a
 * single instance and expose a typed `useEditor` hook for components.
 */
import { useStore } from 'zustand';
import { createIRStore } from '../core/store';
import type { IRStore } from '../core/store';
import { demoApp } from '../core/demo';

// Boot with the demo app so the canvas is non-empty on first run.
export const editorStore = createIRStore(structuredClone(demoApp));

export function useEditor<T>(selector: (s: IRStore) => T): T {
  return useStore(editorStore, selector);
}

/** Non-reactive snapshot (for event handlers / emit). */
export const getEditor = () => editorStore.getState();
