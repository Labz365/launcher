/** App shell + the single DndContext that wires palette/tree drags into IR mutations. */
import { useEffect, useState } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core';
import { Toolbar } from './components/Toolbar';
import { Palette } from './components/Palette';
import { Canvas } from './components/Canvas';
import { RightPanel } from './components/RightPanel';
import { CodePanel } from './components/CodePanel';
import { TemplatePicker } from './components/TemplatePicker';
import { useUI } from './state/ui';
import { editorStore } from './state/store';
import { findWithParent, findComponent, type Component, type ComponentType } from './core/ir';

interface DropTarget { parentId: string; index: number; }

function locate(id: string): { node: Component; parentId: string | null; index: number } | null {
  const { app } = editorStore.getState();
  for (const s of app.screens) {
    const hit = findWithParent(s.root, id);
    if (hit) return { node: hit.node, parentId: hit.parent?.id ?? null, index: hit.index };
  }
  return null;
}

function resolveTarget(over: { kind?: string; id?: string } | undefined): DropTarget | null {
  if (!over?.kind || !over.id) return null;
  if (over.kind === 'into') {
    const loc = locate(over.id);
    const len = loc?.node.children?.length ?? 0;
    return { parentId: over.id, index: len };
  }
  if (over.kind === 'before') {
    const loc = locate(over.id);
    if (!loc || !loc.parentId) return null;
    return { parentId: loc.parentId, index: loc.index };
  }
  return null;
}

export default function App() {
  const showCode = useUI((s) => s.showCode);
  const [drag, setDrag] = useState<{ kind: 'palette' | 'tree'; label: string } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const sel = editorStore.getState().selectedId;
        if (sel) { e.preventDefault(); editorStore.getState().removeComponent(sel); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function onDragStart(e: DragStartEvent) {
    const d = e.active.data.current as { source: string; type?: ComponentType; id?: string } | undefined;
    if (d?.source === 'palette') setDrag({ kind: 'palette', label: d.type ?? '' });
    else if (d?.source === 'tree') {
      const loc = d.id ? locate(d.id) : null;
      setDrag({ kind: 'tree', label: loc?.node.type ?? 'Move' });
    }
  }

  function onDragEnd(e: DragEndEvent) {
    setDrag(null);
    const a = e.active.data.current as { source: string; type?: ComponentType; id?: string } | undefined;
    const o = e.over?.data.current as { kind?: string; id?: string } | undefined;
    if (!a || !o) return;
    const target = resolveTarget(o);
    if (!target) return;

    if (a.source === 'palette' && a.type) {
      editorStore.getState().addComponent(target.parentId, a.type, target.index);
    } else if (a.source === 'tree' && a.id) {
      const loc = locate(a.id);
      if (!loc) return;
      if (findComponent(loc.node, target.parentId)) return;
      editorStore.getState().moveComponent(a.id, target.parentId, target.index);
    }
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="app">
        <Toolbar />
        <div className="body">
          <Palette />
          <main className="center"><Canvas /></main>
          <RightPanel />
          {showCode && <CodePanel />}
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {drag ? <div className="drag-chip">{drag.label}</div> : null}
      </DragOverlay>

      <TemplatePicker />
    </DndContext>
  );
}
