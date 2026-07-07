/**
 * Block-tree canvas mode: the screen's component tree rendered as nested,
 * selectable blocks with dnd-kit drop zones (append-into containers + insert-before
 * siblings). The rendered-preview mode lands in P4; this is the abstract view.
 */
import { useDroppable } from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';
import type { Component } from '../core/ir';
import { acceptsChildren } from '../core/ir';
import { glyphOfType, hueOfType } from '../catalog';
import { useEditor } from '../state/store';
import { editorStore } from '../state/store';

function summarize(c: Component): string {
  const p = c.props ?? {};
  const v = (k: string) => {
    const pv = p[k];
    if (!pv) return '';
    if (pv.kind === 'static') return String(pv.value);
    if (pv.kind === 'bind') return `⟵ ${pv.var || '?'}`;
    return 'ƒ';
  };
  switch (c.type) {
    case 'Text': return v('text');
    case 'Button': return v('label');
    case 'TextField': return v('placeholder');
    case 'Image': return v('src');
    case 'Switch': return v('value');
    case 'ListView': return v('items');
    default: return '';
  }
}

function DropLine({ id }: { id: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: `before:${id}`, data: { kind: 'before', id } });
  return <div ref={setNodeRef} className={`drop-line ${isOver ? 'over' : ''}`} />;
}

function TreeNode({ node, depth }: { node: Component; depth: number }) {
  const selectedId = useEditor((s) => s.selectedId);
  const isSelected = selectedId === node.id;
  const isContainer = acceptsChildren(node.type) || node.type === 'ListView';
  const canDrop = acceptsChildren(node.type);

  const drag = useDraggable({ id: node.id, data: { source: 'tree', id: node.id } });
  const into = useDroppable({ id: `into:${node.id}`, data: { kind: 'into', id: node.id } });

  const hue = hueOfType(node.type);
  const summary = summarize(node);
  const evCount = node.events ? Object.keys(node.events).length : 0;

  return (
    <div className="tnode-wrap" style={{ opacity: drag.isDragging ? 0.4 : 1 }}>
      <div
        ref={drag.setNodeRef}
        className={`tnode ${isSelected ? 'sel' : ''}`}
        style={{ borderLeftColor: hue }}
        onClick={(e) => { e.stopPropagation(); editorStore.getState().select(node.id); }}
        {...drag.listeners}
        {...drag.attributes}
      >
        <span className="tnode-glyph" style={{ color: hue }}>{glyphOfType(node.type)}</span>
        <span className="tnode-type">{node.type}</span>
        {node.name && <span className="tnode-name">{node.name}</span>}
        {summary && <span className="tnode-sum">{summary}</span>}
        {evCount > 0 && <span className="tnode-badge" title={`${evCount} event(s)`}>⚡{evCount}</span>}
      </div>

      {isContainer && (
        <div
          ref={canDrop ? into.setNodeRef : undefined}
          className={`tnode-children ${canDrop && into.isOver ? 'into-over' : ''}`}
        >
          {(node.children ?? []).map((child) => (
            <div key={child.id}>
              {canDrop && <DropLine id={child.id} />}
              <TreeNode node={child} depth={depth + 1} />
            </div>
          ))}
          {(!node.children || node.children.length === 0) && (
            <div className="tnode-empty">
              {canDrop ? 'Drop components here' : node.type === 'ListView' ? 'item template ↑' : ''}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function BlockTree() {
  const app = useEditor((s) => s.app);
  const currentScreenId = useEditor((s) => s.currentScreenId);
  const screen = app.screens.find((s) => s.id === currentScreenId) ?? app.screens[0];

  return (
    <div className="canvas-scroll" onClick={() => editorStore.getState().select(null)}>
      <div className="canvas-inner">
        <div className="canvas-screen-label">{screen.name}</div>
        <TreeNode node={screen.root} depth={0} />
      </div>
    </div>
  );
}
