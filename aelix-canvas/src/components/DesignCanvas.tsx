/**
 * WYSIWYG design canvas. Renders the current screen's IR as *real* laid-out UI
 * (not abstract blocks) with live drop targets: drag from the palette straight
 * onto the rendered layout, click to select, drag to move. It reuses the same
 * dnd-kit drop semantics as the block tree ({kind:'into'} on containers,
 * {kind:'before'} on siblings) so App.tsx's single DndContext wires it for free.
 *
 * Visual fidelity is intentionally "wireframe-grade": faithful enough to design
 * against, driven from the same Style model the emitters consume. For a
 * pixel-exact, interactive render use the Preview tab (HTML runtime).
 */
import { Fragment } from 'react';
import type { CSSProperties, MouseEvent } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { Component, Style } from '../core/ir';
import { acceptsChildren } from '../core/ir';
import { useEditor, editorStore } from '../state/store';

// ---- Style (IR) -> CSS, mirrors the HTML emitter's mapping --------------------

const MAIN: Record<string, string> = {
  start: 'flex-start', center: 'center', end: 'flex-end',
  spaceBetween: 'space-between', spaceAround: 'space-around', spaceEvenly: 'space-evenly',
};
const CROSS: Record<string, string> = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' };
const WEIGHT: Record<string, number> = { normal: 400, medium: 500, semibold: 600, bold: 700 };

function edge(v: number | { top?: number; right?: number; bottom?: number; left?: number }): string {
  if (typeof v === 'number') return `${v}px`;
  return `${v.top ?? 0}px ${v.right ?? 0}px ${v.bottom ?? 0}px ${v.left ?? 0}px`;
}
function dim(d: Style['width']): string | undefined {
  if (d === undefined || d === 'hug') return undefined;
  if (d === 'fill') return '100%';
  return `${d}px`;
}

function styleToCss(c: Component): CSSProperties {
  const s = c.style ?? {};
  const css: CSSProperties = { position: 'relative' };
  if (s.padding !== undefined) css.padding = edge(s.padding);
  if (s.margin !== undefined) css.margin = edge(s.margin);
  const w = dim(s.width); if (w) css.width = w;
  const h = dim(s.height); if (h) css.height = h;
  if (s.color) css.color = s.color;
  if (s.background) css.background = s.background;
  if (s.fontSize) css.fontSize = s.fontSize;
  if (s.fontWeight) css.fontWeight = WEIGHT[s.fontWeight];
  if (s.radius !== undefined) css.borderRadius = s.radius;
  if (s.flex !== undefined) css.flex = String(s.flex);
  if (c.type === 'Row' || c.type === 'Column') {
    css.display = 'flex';
    css.flexDirection = c.type === 'Row' ? 'row' : 'column';
    if (s.gap) css.gap = s.gap;
    css.justifyContent = MAIN[s.mainAxis ?? 'start'];
    css.alignItems = CROSS[s.crossAxis ?? (c.type === 'Row' ? 'center' : 'start')];
  }
  if (c.type === 'Stack') { css.display = 'grid'; }
  return css;
}

// ---- prop display -------------------------------------------------------------

function propText(c: Component, key: string, fallback = ''): string {
  const pv = c.props?.[key];
  if (!pv) return fallback;
  if (pv.kind === 'static') return String(pv.value);
  if (pv.kind === 'bind') return `{${pv.var || '…'}}`;
  return '{ƒ}';
}

// ---- drop line (insert-before a sibling) --------------------------------------

function DropLine({ id, horizontal }: { id: string; horizontal: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `dz-before:${id}`, data: { kind: 'before', id } });
  return <div ref={setNodeRef} className={`dz-drop ${horizontal ? 'h' : 'v'} ${isOver ? 'over' : ''}`} />;
}

// ---- leaf visuals -------------------------------------------------------------

function Leaf({ node }: { node: Component }) {
  switch (node.type) {
    case 'Text':
      return <span className="dz-text">{propText(node, 'text', 'Text') || ' '}</span>;
    case 'Button':
      return <span className="dz-btn">{propText(node, 'label', 'Button')}</span>;
    case 'TextField':
      return <span className="dz-input">{propText(node, 'value') || propText(node, 'placeholder', 'Text field…')}</span>;
    case 'Switch':
      return <span className="dz-switch" data-on={propText(node, 'value') === 'true'} aria-hidden />;
    case 'Image': {
      const src = node.props?.src?.kind === 'static' ? String(node.props.src.value) : '';
      return src
        ? <img className="dz-img" src={src} alt="" draggable={false} />
        : <span className="dz-img ph">◳</span>;
    }
    case 'Spacer':
      return <span className="dz-spacer">↔ spacer</span>;
    case 'ListView': {
      const bound = propText(node, 'items', '');
      return (
        <span className="dz-list">
          <span className="dz-list-h">☰ List{bound ? ` · ${bound}` : ''}</span>
          <span className="dz-list-row" /><span className="dz-list-row" /><span className="dz-list-row" />
        </span>
      );
    }
    default:
      return <span className="dz-text">{node.type}</span>;
  }
}

// ---- node -------------------------------------------------------------------

function NodeView({ node }: { node: Component }) {
  const selectedId = useEditor((s) => s.selectedId);
  const sel = selectedId === node.id;
  const drag = useDraggable({ id: `dz-${node.id}`, data: { source: 'tree', id: node.id } });
  const into = useDroppable({ id: `dz-into:${node.id}`, data: { kind: 'into', id: node.id } });
  const isContainer = acceptsChildren(node.type);

  const select = (e: MouseEvent) => { e.stopPropagation(); editorStore.getState().select(node.id); };
  const dragProps = { ...drag.listeners, ...drag.attributes };

  if (isContainer) {
    const kids = node.children ?? [];
    const horizontal = node.type === 'Row';
    const setRef = (el: HTMLDivElement | null) => { drag.setNodeRef(el); into.setNodeRef(el); };
    return (
      <div
        ref={setRef}
        className={`dz-node dz-container ${sel ? 'sel' : ''} ${into.isOver ? 'into' : ''} ${kids.length === 0 ? 'empty' : ''}`}
        style={{ ...styleToCss(node), opacity: drag.isDragging ? 0.4 : 1 }}
        onClick={select}
        {...dragProps}
      >
        {sel && <span className="dz-tag">{node.type}</span>}
        {kids.length === 0 && <span className="dz-empty">Drop components here</span>}
        {kids.map((k) => (
          <Fragment key={k.id}>
            <DropLine id={k.id} horizontal={horizontal} />
            <NodeView node={k} />
          </Fragment>
        ))}
      </div>
    );
  }

  return (
    <div
      ref={drag.setNodeRef}
      className={`dz-node dz-leaf ${sel ? 'sel' : ''}`}
      style={{ ...styleToCss(node), opacity: drag.isDragging ? 0.4 : 1 }}
      onClick={select}
      {...dragProps}
    >
      {sel && <span className="dz-tag">{node.type}</span>}
      <Leaf node={node} />
    </div>
  );
}

// ---- canvas -----------------------------------------------------------------

export function DesignCanvas() {
  const app = useEditor((s) => s.app);
  const currentScreenId = useEditor((s) => s.currentScreenId);
  const screen = app.screens.find((s) => s.id === currentScreenId) ?? app.screens[0];

  return (
    <div className="canvas-scroll" onClick={() => editorStore.getState().select(null)}>
      <div className="dz-frame">
        <div className="dz-frame-bar">{screen.name}</div>
        <div className="dz-frame-body">
          <NodeView node={screen.root} />
        </div>
      </div>
      <div className="preview-hint">Design view · drag from the left · click to select · Delete to remove</div>
    </div>
  );
}
