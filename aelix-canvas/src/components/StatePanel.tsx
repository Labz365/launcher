/**
 * State panel: declare / edit / remove state variables for the app (global) and
 * the current screen (screen-local). Feeds the binding & event dropdowns.
 */
import type { Scope, StateVar, ValueType } from '../core/ir';
import { editorStore, useEditor } from '../state/store';
import { Btn, Select, TextInput, NumberInput, PanelSection } from './ui';

const TYPE_OPTS: Array<{ value: ValueType; label: string }> = [
  { value: 'int', label: 'int' }, { value: 'double', label: 'double' },
  { value: 'string', label: 'string' }, { value: 'bool', label: 'bool' }, { value: 'list', label: 'list' },
];

function defaultInitial(t: ValueType): StateVar['initialValue'] {
  switch (t) { case 'int': case 'double': return 0; case 'bool': return false; case 'list': return []; default: return ''; }
}

function VarRow({ scope, v }: { scope: Scope; v: StateVar }) {
  const upd = (patch: Partial<StateVar>) => editorStore.getState().updateStateVar(scope, v.name, patch);
  return (
    <div className="var-row">
      <TextInput value={v.name} onChange={(n) => upd({ name: n })} mono />
      <Select value={v.type} options={TYPE_OPTS} onChange={(t) => upd({ type: t, initialValue: defaultInitial(t) })} />
      <div className="var-init">
        {v.type === 'bool' ? (
          <Select value={String(!!v.initialValue) as 'true' | 'false'} options={[{ value: 'true', label: 'true' }, { value: 'false', label: 'false' }]}
            onChange={(b) => upd({ initialValue: b === 'true' })} />
        ) : v.type === 'list' ? (
          <span className="muted sm">[ ] empty</span>
        ) : v.type === 'string' ? (
          <TextInput value={String(v.initialValue ?? '')} onChange={(val) => upd({ initialValue: val })} />
        ) : (
          <NumberInput value={Number(v.initialValue) || 0} onChange={(n) => upd({ initialValue: n ?? 0 })} />
        )}
      </div>
      <Btn kind="danger" title="Delete" onClick={() => editorStore.getState().removeStateVar(scope, v.name)}>✕</Btn>
    </div>
  );
}

function Section({ scope, title, vars }: { scope: Scope; title: string; vars: StateVar[] }) {
  const add = () => {
    const base = scope === 'global' ? 'gVar' : 'var';
    let i = 1; let name = `${base}${i}`;
    while (vars.some((v) => v.name === name)) name = `${base}${++i}`;
    editorStore.getState().addStateVar(scope, { name, type: 'int', initialValue: 0, scope });
  };
  return (
    <PanelSection title={title} right={<Btn onClick={add}>+ var</Btn>}>
      {vars.length === 0 && <div className="muted sm">no variables</div>}
      {vars.length > 0 && (
        <div className="var-head"><span>name</span><span>type</span><span>initial</span><span /></div>
      )}
      {vars.map((v) => <VarRow key={v.name} scope={scope} v={v} />)}
    </PanelSection>
  );
}

export function StatePanel() {
  const app = useEditor((s) => s.app);
  const currentScreenId = useEditor((s) => s.currentScreenId);
  const screen = app.screens.find((s) => s.id === currentScreenId)!;
  return (
    <div className="state-panel">
      <Section scope="global" title="Global state" vars={app.globalState} />
      <Section scope="screen" title={`Screen state — ${screen.name}`} vars={screen.state} />
    </div>
  );
}
