/**
 * Dropdown-driven event editor (no free-text coding). For the selected component
 * it shows applicable events (onTap/onChange/onSubmit) and lets you compose an
 * ordered list of Actions via selects + minimal value inputs.
 */
import type { Action, Component, EventName, Expr, StateVar, ValueType } from '../core/ir';
import { editorStore, useEditor } from '../state/store';
import { Btn, Select, TextInput } from './ui';

const EVENTS_FOR: Record<string, EventName[]> = {
  Button: ['onTap'],
  TextField: ['onChange', 'onSubmit'],
  Switch: ['onChange'],
};

type ExprMode = 'literal' | 'var' | 'eventValue' | 'binary';

function exprMode(e: Expr): ExprMode {
  if (e.kind === 'lit') return 'literal';
  if (e.kind === 'var') return 'var';
  if (e.kind === 'eventValue') return 'eventValue';
  if (e.kind === 'binary') return 'binary';
  return 'literal';
}

function defaultExprFor(mode: ExprMode, vars: StateVar[]): Expr {
  switch (mode) {
    case 'literal': return { kind: 'lit', value: '', valueType: 'string' };
    case 'var': return { kind: 'var', name: vars[0]?.name ?? '' };
    case 'eventValue': return { kind: 'eventValue' };
    case 'binary': return { kind: 'binary', op: '+', left: { kind: 'var', name: vars[0]?.name ?? '' }, right: { kind: 'lit', value: 1, valueType: 'int' } };
  }
}

function ExprEditor({ expr, vars, allowEvent, onChange }: {
  expr: Expr; vars: StateVar[]; allowEvent: boolean; onChange: (e: Expr) => void;
}) {
  const mode = exprMode(expr);
  const modeOpts: Array<{ value: ExprMode; label: string }> = [
    { value: 'literal', label: 'value' },
    { value: 'var', label: 'state var' },
    { value: 'binary', label: 'var ∘ value' },
    ...(allowEvent ? [{ value: 'eventValue' as ExprMode, label: 'event value' }] : []),
  ];
  return (
    <div className="expr">
      <Select value={mode} options={modeOpts} onChange={(m) => onChange(defaultExprFor(m, vars))} />
      {expr.kind === 'lit' && (
        <>
          <Select value={expr.valueType}
            options={[{ value: 'string', label: 'str' }, { value: 'int', label: 'int' }, { value: 'double', label: 'num' }, { value: 'bool', label: 'bool' }]}
            onChange={(vt) => onChange({ kind: 'lit', value: vt === 'bool' ? false : vt === 'string' ? '' : 0, valueType: vt as ValueType })} />
          {expr.valueType === 'bool' ? (
            <Select value={String(expr.value) as 'true' | 'false'} options={[{ value: 'true', label: 'true' }, { value: 'false', label: 'false' }]}
              onChange={(v) => onChange({ kind: 'lit', value: v === 'true', valueType: 'bool' })} />
          ) : (
            <TextInput value={String(expr.value)} onChange={(v) => onChange({ kind: 'lit', value: expr.valueType === 'string' ? v : Number(v) || 0, valueType: expr.valueType })} />
          )}
        </>
      )}
      {expr.kind === 'var' && (
        <Select value={expr.name} options={vars.map((v) => ({ value: v.name, label: v.name }))} onChange={(n) => onChange({ kind: 'var', name: n })} />
      )}
      {expr.kind === 'binary' && (
        <>
          <Select value={expr.left.kind === 'var' ? expr.left.name : ''} options={vars.map((v) => ({ value: v.name, label: v.name }))}
            onChange={(n) => onChange({ ...expr, left: { kind: 'var', name: n } })} />
          <Select value={expr.op as '+' | '-' | '*' | '/'} options={(['+', '-', '*', '/'] as const).map((o) => ({ value: o, label: o }))}
            onChange={(o) => onChange({ ...expr, op: o })} />
          <TextInput value={expr.right.kind === 'lit' ? String(expr.right.value) : ''}
            onChange={(v) => onChange({ ...expr, right: { kind: 'lit', value: Number(v) || 0, valueType: 'int' } })} />
        </>
      )}
    </div>
  );
}

function ActionRow({ action, vars, screens, allowEvent, onChange, onRemove }: {
  action: Action; vars: StateVar[]; screens: Array<{ id: string; name: string }>; allowEvent: boolean;
  onChange: (a: Action) => void; onRemove: () => void;
}) {
  const kindOpts = [
    { value: 'SetState', label: 'Set state' },
    { value: 'Toggle', label: 'Toggle' },
    { value: 'AppendList', label: 'Append to list' },
    { value: 'Navigate', label: 'Navigate' },
    { value: 'CallExpr', label: 'Call expr' },
  ] as const;

  function changeKind(kind: Action['kind']) {
    const firstVar = vars[0]?.name ?? '';
    const listVar = vars.find((v) => v.type === 'list')?.name ?? firstVar;
    const boolVar = vars.find((v) => v.type === 'bool')?.name ?? firstVar;
    switch (kind) {
      case 'SetState': return onChange({ kind, target: firstVar, expr: { kind: 'lit', value: '', valueType: 'string' } });
      case 'Toggle': return onChange({ kind, target: boolVar });
      case 'AppendList': return onChange({ kind, target: listVar, expr: { kind: 'var', name: firstVar } });
      case 'Navigate': return onChange({ kind, screenId: screens[0]?.id ?? '' });
      case 'CallExpr': return onChange({ kind, expr: { kind: 'var', name: firstVar } });
    }
  }

  return (
    <div className="action-row">
      <div className="action-head">
        <Select value={action.kind} options={kindOpts.map((k) => ({ value: k.value, label: k.label }))} onChange={(k) => changeKind(k as Action['kind'])} />
        <Btn kind="danger" onClick={onRemove} title="Remove action">✕</Btn>
      </div>
      <div className="action-body">
        {action.kind === 'SetState' && (
          <>
            <Select value={action.target} options={vars.map((v) => ({ value: v.name, label: v.name }))} onChange={(t) => onChange({ ...action, target: t })} />
            <span className="eq">=</span>
            <ExprEditor expr={action.expr} vars={vars} allowEvent={allowEvent} onChange={(e) => onChange({ ...action, expr: e })} />
          </>
        )}
        {action.kind === 'Toggle' && (
          <Select value={action.target} options={vars.filter((v) => v.type === 'bool').map((v) => ({ value: v.name, label: v.name }))} onChange={(t) => onChange({ ...action, target: t })} />
        )}
        {action.kind === 'AppendList' && (
          <>
            <Select value={action.target} options={vars.filter((v) => v.type === 'list').map((v) => ({ value: v.name, label: v.name }))} onChange={(t) => onChange({ ...action, target: t })} />
            <span className="eq">+=</span>
            <ExprEditor expr={action.expr} vars={vars} allowEvent={allowEvent} onChange={(e) => onChange({ ...action, expr: e })} />
          </>
        )}
        {action.kind === 'Navigate' && (
          <Select value={action.screenId} options={screens.map((s) => ({ value: s.id, label: s.name }))} onChange={(id) => onChange({ ...action, screenId: id })} />
        )}
        {action.kind === 'CallExpr' && (
          <ExprEditor expr={action.expr} vars={vars} allowEvent={allowEvent} onChange={(e) => onChange({ ...action, expr: e })} />
        )}
      </div>
    </div>
  );
}

export function EventEditor({ node }: { node: Component }) {
  const app = useEditor((s) => s.app);
  const currentScreenId = useEditor((s) => s.currentScreenId);
  const screen = app.screens.find((s) => s.id === currentScreenId)!;
  const vars: StateVar[] = [...app.globalState, ...screen.state];
  const screens = app.screens.map((s) => ({ id: s.id, name: s.name }));
  const events = EVENTS_FOR[node.type] ?? [];

  if (events.length === 0) {
    return <div className="muted">No events for {node.type}.</div>;
  }

  function setHandler(ev: EventName, actions: Action[]) {
    editorStore.getState().setEvent(node.id, ev, actions.length ? actions : undefined);
  }

  return (
    <div className="events">
      {events.map((ev) => {
        const handler = node.events?.[ev] ?? [];
        const allowEvent = ev === 'onChange' || ev === 'onSubmit';
        return (
          <div key={ev} className="event-block">
            <div className="event-h">
              <span className="event-name">{ev}</span>
              <Btn onClick={() => setHandler(ev, [...handler, { kind: 'SetState', target: vars[0]?.name ?? '', expr: { kind: 'lit', value: '', valueType: 'string' } }])}>+ action</Btn>
            </div>
            {handler.length === 0 && <div className="muted sm">no actions</div>}
            {handler.map((a, i) => (
              <ActionRow
                key={i} action={a} vars={vars} screens={screens} allowEvent={allowEvent}
                onChange={(na) => { const next = handler.slice(); next[i] = na; setHandler(ev, next); }}
                onRemove={() => { const next = handler.slice(); next.splice(i, 1); setHandler(ev, next); }}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
