/**
 * Inspector: edits the selected component's name, style props, type-specific
 * props (with static|binding modes), and events (via EventEditor).
 */
import type { Component, PropValue, Style, StateVar, FontWeight, MainAxisAlign, CrossAxisAlign } from '../core/ir';
import { findComponent } from '../core/ir';
import { editorStore, useEditor } from '../state/store';
import { Field, NumberInput, Select, TextInput, PanelSection } from './ui';
import { EventEditor } from './EventEditor';

function useSelectedNode(): Component | null {
  const app = useEditor((s) => s.app);
  const selectedId = useEditor((s) => s.selectedId);
  if (!selectedId) return null;
  for (const s of app.screens) {
    const hit = findComponent(s.root, selectedId);
    if (hit) return hit;
  }
  return null;
}

// ---- prop editor (static | bind) -------------------------------------------

function PropEditor({ node, propKey, label, vars, varFilter }: {
  node: Component; propKey: string; label: string; vars: StateVar[]; varFilter?: (v: StateVar) => boolean;
}) {
  const pv: PropValue | undefined = node.props?.[propKey];
  const candidates = varFilter ? vars.filter(varFilter) : vars;
  const mode = pv?.kind === 'bind' ? 'bind' : 'static';
  const set = (v: PropValue) => editorStore.getState().setProp(node.id, propKey, v);

  return (
    <Field label={label}>
      <div className="prop-row">
        <Select value={mode} options={[{ value: 'static', label: 'static' }, { value: 'bind', label: 'bind' }]}
          onChange={(m) => set(m === 'bind' ? { kind: 'bind', var: candidates[0]?.name ?? '' } : { kind: 'static', value: '' })} />
        {mode === 'static' ? (
          <TextInput value={pv?.kind === 'static' ? String(pv.value) : ''} onChange={(v) => set({ kind: 'static', value: v })} />
        ) : (
          <Select value={pv?.kind === 'bind' ? pv.var : ''} options={candidates.map((v) => ({ value: v.name, label: `${v.name}: ${v.type}` }))}
            onChange={(n) => set({ kind: 'bind', var: n })} />
        )}
      </div>
    </Field>
  );
}

function ColorInput({ value, onChange }: { value?: string; onChange: (v: string | undefined) => void }) {
  return (
    <div className="color-row">
      <input type="color" className="color-swatch" value={value || '#000000'} onChange={(e) => onChange(e.target.value)} />
      <TextInput value={value ?? ''} mono onChange={(v) => onChange(v || undefined)} />
      {value && <button className="x" onClick={() => onChange(undefined)}>✕</button>}
    </div>
  );
}

// ---- style controls ---------------------------------------------------------

function StyleControls({ node }: { node: Component }) {
  const style: Style = node.style ?? {};
  const up = (patch: Partial<Style>) => editorStore.getState().updateStyle(node.id, patch);
  const isFlex = node.type === 'Row' || node.type === 'Column';
  const isText = node.type === 'Text';
  const num = (k: keyof Style) => (style[k] as number | undefined);

  return (
    <>
      <div className="grid2">
        <Field label="Width">
          <DimInput value={style.width} onChange={(v) => up({ width: v })} />
        </Field>
        <Field label="Height">
          <DimInput value={style.height} onChange={(v) => up({ height: v })} />
        </Field>
        <Field label="Padding"><NumberInput value={num('padding') as number} onChange={(v) => up({ padding: v })} /></Field>
        <Field label="Margin"><NumberInput value={num('margin') as number} onChange={(v) => up({ margin: v })} /></Field>
        <Field label="Radius"><NumberInput value={style.radius} onChange={(v) => up({ radius: v })} /></Field>
        {isFlex && <Field label="Gap"><NumberInput value={style.gap} onChange={(v) => up({ gap: v })} /></Field>}
        <Field label="Flex"><NumberInput value={style.flex} onChange={(v) => up({ flex: v })} /></Field>
      </div>

      <Field label="Foreground"><ColorInput value={style.color} onChange={(v) => up({ color: v })} /></Field>
      <Field label="Background"><ColorInput value={style.background} onChange={(v) => up({ background: v })} /></Field>

      {isText && (
        <div className="grid2">
          <Field label="Font size"><NumberInput value={style.fontSize} onChange={(v) => up({ fontSize: v })} /></Field>
          <Field label="Weight">
            <Select value={(style.fontWeight ?? 'normal')} options={[
              { value: 'normal', label: 'normal' }, { value: 'medium', label: 'medium' },
              { value: 'semibold', label: 'semibold' }, { value: 'bold', label: 'bold' }]}
              onChange={(v) => up({ fontWeight: v as FontWeight })} />
          </Field>
        </div>
      )}

      {isFlex && (
        <div className="grid2">
          <Field label="Main axis">
            <Select value={(style.mainAxis ?? 'start')} options={['start', 'center', 'end', 'spaceBetween', 'spaceAround', 'spaceEvenly'].map((v) => ({ value: v, label: v }))}
              onChange={(v) => up({ mainAxis: v as MainAxisAlign })} />
          </Field>
          <Field label="Cross axis">
            <Select value={(style.crossAxis ?? 'start')} options={['start', 'center', 'end', 'stretch'].map((v) => ({ value: v, label: v }))}
              onChange={(v) => up({ crossAxis: v as CrossAxisAlign })} />
          </Field>
        </div>
      )}
    </>
  );
}

function DimInput({ value, onChange }: { value: Style['width']; onChange: (v: Style['width']) => void }) {
  const mode = value === 'fill' ? 'fill' : value === 'hug' || value === undefined ? 'hug' : 'fixed';
  return (
    <div className="prop-row">
      <Select value={mode} options={[{ value: 'hug', label: 'hug' }, { value: 'fill', label: 'fill' }, { value: 'fixed', label: 'fixed' }]}
        onChange={(m) => onChange(m === 'fill' ? 'fill' : m === 'hug' ? 'hug' : 100)} />
      {mode === 'fixed' && <NumberInput value={typeof value === 'number' ? value : undefined} onChange={(v) => onChange(v ?? 0)} />}
    </div>
  );
}

// ---- main inspector ---------------------------------------------------------

export function Inspector() {
  const node = useSelectedNode();
  const app = useEditor((s) => s.app);
  const currentScreenId = useEditor((s) => s.currentScreenId);
  const screen = app.screens.find((s) => s.id === currentScreenId)!;
  const vars: StateVar[] = [...app.globalState, ...screen.state];

  if (!node) {
    return <div className="muted pad">Select a component to edit its properties.</div>;
  }

  return (
    <div className="inspector">
      <PanelSection title={node.type}>
        <Field label="Name (optional)">
          <TextInput value={node.name ?? ''} placeholder={node.type} onChange={(v) => editorStore.getState().renameComponent(node.id, v)} />
        </Field>
      </PanelSection>

      {/* type-specific props */}
      {(node.type === 'Text') && <PanelSection title="Content"><PropEditor node={node} propKey="text" label="Text" vars={vars} /></PanelSection>}
      {(node.type === 'Button') && <PanelSection title="Content"><PropEditor node={node} propKey="label" label="Label" vars={vars} /></PanelSection>}
      {(node.type === 'TextField') && (
        <PanelSection title="Content">
          <PropEditor node={node} propKey="placeholder" label="Placeholder" vars={vars} />
          <PropEditor node={node} propKey="value" label="Value" vars={vars} varFilter={(v) => v.type === 'string'} />
        </PanelSection>
      )}
      {(node.type === 'Image') && <PanelSection title="Content"><PropEditor node={node} propKey="src" label="Source URL" vars={vars} /></PanelSection>}
      {(node.type === 'Switch') && <PanelSection title="Content"><PropEditor node={node} propKey="value" label="Bound to" vars={vars} varFilter={(v) => v.type === 'bool'} /></PanelSection>}
      {(node.type === 'ListView') && <PanelSection title="Content"><PropEditor node={node} propKey="items" label="Items (list var)" vars={vars} varFilter={(v) => v.type === 'list'} /></PanelSection>}

      <PanelSection title="Style"><StyleControls node={node} /></PanelSection>

      <PanelSection title="Events"><EventEditor node={node} /></PanelSection>
    </div>
  );
}
