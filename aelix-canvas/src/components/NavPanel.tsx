/**
 * Screens + navigation wiring. Manage screens (add/rename/remove/set entry) and
 * visualize the navigation graph — edges are derived live from Navigate actions
 * in each screen's event handlers, so the wiring always matches the IR.
 */
import type { Component, Screen } from '../core/ir';
import { editorStore, useEditor } from '../state/store';
import { Btn, TextInput, PanelSection } from './ui';

function collectNavTargets(c: Component, acc: Array<{ to: string; label: string }>) {
  for (const ev of Object.values(c.events ?? {})) {
    for (const a of ev) if (a.kind === 'Navigate') acc.push({ to: a.screenId, label: c.name || c.type });
  }
  for (const k of c.children ?? []) collectNavTargets(k, acc);
}

function edgesFor(screen: Screen): Array<{ to: string; label: string }> {
  const acc: Array<{ to: string; label: string }> = [];
  collectNavTargets(screen.root, acc);
  return acc;
}

export function NavPanel() {
  const app = useEditor((s) => s.app);
  const currentScreenId = useEditor((s) => s.currentScreenId);
  const nameOf = (id: string) => app.screens.find((s) => s.id === id)?.name ?? '?';

  const addScreen = () => {
    let i = app.screens.length + 1; let name = `Screen${i}`;
    while (app.screens.some((s) => s.name === name)) name = `Screen${++i}`;
    const id = editorStore.getState().addScreen(name);
    editorStore.getState().setCurrentScreen(id);
  };

  return (
    <div className="nav-panel">
      <PanelSection title="Screens" right={<Btn onClick={addScreen}>+ screen</Btn>}>
        {app.screens.map((s) => (
          <div key={s.id} className={`screen-row ${s.id === currentScreenId ? 'on' : ''}`}>
            <button className="screen-pick" onClick={() => editorStore.getState().setCurrentScreen(s.id)} title="Edit this screen">
              {s.id === app.initialScreenId ? '★' : '○'}
            </button>
            <TextInput value={s.name} onChange={(n) => editorStore.getState().renameScreen(s.id, n)} />
            <Btn onClick={() => editorStore.getState().setInitialScreen(s.id)} title="Set as entry screen" disabled={s.id === app.initialScreenId}>entry</Btn>
            <Btn kind="danger" title="Delete screen" disabled={app.screens.length <= 1} onClick={() => editorStore.getState().removeScreen(s.id)}>✕</Btn>
          </div>
        ))}
      </PanelSection>

      <PanelSection title="Navigation graph">
        <div className="navgraph">
          {app.screens.map((s) => {
            const edges = edgesFor(s);
            return (
              <div key={s.id} className="navnode">
                <div className="navnode-h">{s.name}{s.id === app.initialScreenId ? ' ★' : ''}</div>
                {edges.length === 0 ? (
                  <div className="muted sm">no outgoing navigation</div>
                ) : edges.map((e, i) => (
                  <div key={i} className="navedge">→ <b>{nameOf(e.to)}</b> <span className="muted sm">via {e.label}</span></div>
                ))}
              </div>
            );
          })}
        </div>
        <div className="muted sm pad-t">Edges are derived from <b>Navigate</b> actions. Add one by giving a Button an onTap → Navigate.</div>
      </PanelSection>
    </div>
  );
}
