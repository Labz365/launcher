/**
 * The IR store. Holds the entire App IR plus editor cursor state (selection,
 * current screen, target language) and exposes pure mutation actions.
 *
 * Uses `zustand/vanilla` so this module stays free of React — the React binding
 * (`useStore`) lives in the UI layer. All mutations are immutable: we clone the
 * App, edit the clone, and swap it in, so emitters/preview recompute reliably.
 */
import { createStore } from 'zustand/vanilla';
import type {
  App, Component, ComponentType, Id, PropValue, Screen, StateVar, Style, EventName, EventHandler, NavEdge, Scope,
} from './ir';
import { newId, findWithParent, acceptsChildren } from './ir';
import type { TargetLang } from './emitters/types';

// ---- default component factory ----------------------------------------------

const DEFAULT_STYLE: Partial<Record<ComponentType, Style>> = {
  Column: { gap: 8, crossAxis: 'start' },
  Row: { gap: 8, crossAxis: 'center' },
  Container: { padding: 12 },
  Text: { fontSize: 14 },
};

const DEFAULT_PROPS: Partial<Record<ComponentType, Record<string, PropValue>>> = {
  Text: { text: { kind: 'static', value: 'Text' } },
  Button: { label: { kind: 'static', value: 'Button' } },
  TextField: { placeholder: { kind: 'static', value: 'Enter text…' } },
  Image: { src: { kind: 'static', value: 'https://placehold.co/120x80' } },
};

export function makeComponent(type: ComponentType): Component {
  const c: Component = { id: newId('c'), type };
  if (DEFAULT_STYLE[type]) c.style = { ...DEFAULT_STYLE[type] };
  if (DEFAULT_PROPS[type]) c.props = structuredClone(DEFAULT_PROPS[type]);
  if (acceptsChildren(type) || type === 'ListView') c.children = [];
  if (type === 'ListView') {
    c.props = { items: { kind: 'bind', var: '' } };
    c.children = [{ id: newId('c'), type: 'Text', props: { text: { kind: 'expr', expr: { kind: 'item' } } } }];
  }
  return c;
}

// ---- empty project -----------------------------------------------------------

export function emptyApp(name = 'Untitled'): App {
  const home: Screen = {
    id: newId('s'),
    name: 'Home',
    state: [],
    root: { id: newId('c'), type: 'Column', style: { gap: 12, padding: 16, crossAxis: 'stretch' }, children: [] },
  };
  return { name, globalState: [], screens: [home], initialScreenId: home.id, nav: [] };
}

// ---- store shape -------------------------------------------------------------

export interface EditorState {
  app: App;
  currentScreenId: Id;
  selectedId: Id | null;
  target: TargetLang;
}

export interface EditorActions {
  loadApp(app: App): void;
  setAppName(name: string): void;
  setTarget(t: TargetLang): void;
  setCurrentScreen(id: Id): void;
  select(id: Id | null): void;

  addComponent(parentId: Id, type: ComponentType, index?: number): Id;
  moveComponent(id: Id, newParentId: Id, index: number): void;
  removeComponent(id: Id): void;
  updateStyle(id: Id, patch: Partial<Style>): void;
  setProp(id: Id, key: string, value: PropValue): void;
  setEvent(id: Id, event: EventName, handler: EventHandler | undefined): void;
  renameComponent(id: Id, name: string): void;

  addStateVar(scope: Scope, v: StateVar, screenId?: Id): void;
  updateStateVar(scope: Scope, name: string, patch: Partial<StateVar>, screenId?: Id): void;
  removeStateVar(scope: Scope, name: string, screenId?: Id): void;

  addScreen(name: string): Id;
  removeScreen(id: Id): void;
  renameScreen(id: Id, name: string): void;
  setInitialScreen(id: Id): void;
  addNavEdge(edge: NavEdge): void;
  removeNavEdge(from: Id, to: Id): void;
}

export type IRStore = EditorState & EditorActions;

// ---- helpers -----------------------------------------------------------------

function currentScreen(app: App, id: Id): Screen | undefined {
  return app.screens.find((s) => s.id === id);
}

// ---- store factory -----------------------------------------------------------

export function createIRStore(initial?: App) {
  const app0 = initial ?? emptyApp();
  return createStore<IRStore>((set, get) => {
    /** Immutable App update: clone, mutate clone, swap in. */
    const edit = (fn: (draft: App) => void) => {
      const draft = structuredClone(get().app);
      fn(draft);
      set({ app: draft });
    };

    return {
      app: app0,
      currentScreenId: app0.initialScreenId,
      selectedId: null,
      target: 'flutter',

      loadApp: (app) => set({ app, currentScreenId: app.initialScreenId, selectedId: null }),
      setAppName: (name) => edit((d) => { d.name = name; }),
      setTarget: (t) => set({ target: t }),
      setCurrentScreen: (id) => set({ currentScreenId: id, selectedId: null }),
      select: (id) => set({ selectedId: id }),

      addComponent: (parentId, type, index) => {
        const node = makeComponent(type);
        edit((d) => {
          for (const s of d.screens) {
            const hit = findWithParent(s.root, parentId);
            if (hit) {
              const parent = hit.node;
              if (!acceptsChildren(parent.type)) return;
              parent.children = parent.children ?? [];
              const i = index ?? parent.children.length;
              parent.children.splice(Math.max(0, Math.min(i, parent.children.length)), 0, node);
              return;
            }
          }
        });
        set({ selectedId: node.id });
        return node.id;
      },

      moveComponent: (id, newParentId, index) => {
        if (id === newParentId) return;
        edit((d) => {
          let moved: Component | null = null;
          for (const s of d.screens) {
            const hit = findWithParent(s.root, id);
            if (hit && hit.parent) {
              [moved] = hit.parent.children!.splice(hit.index, 1);
              break;
            }
          }
          if (!moved) return;
          for (const s of d.screens) {
            const target = findWithParent(s.root, newParentId);
            if (target) {
              if (!acceptsChildren(target.node.type)) { return; }
              target.node.children = target.node.children ?? [];
              const i = Math.max(0, Math.min(index, target.node.children.length));
              target.node.children.splice(i, 0, moved!);
              return;
            }
          }
        });
      },

      removeComponent: (id) => {
        edit((d) => {
          for (const s of d.screens) {
            if (s.root.id === id) return; // never remove a screen root
            const hit = findWithParent(s.root, id);
            if (hit && hit.parent) { hit.parent.children!.splice(hit.index, 1); return; }
          }
        });
        if (get().selectedId === id) set({ selectedId: null });
      },

      updateStyle: (id, patch) => edit((d) => {
        for (const s of d.screens) {
          const hit = findWithParent(s.root, id);
          if (hit) { hit.node.style = { ...hit.node.style, ...patch }; return; }
        }
      }),

      setProp: (id, key, value) => edit((d) => {
        for (const s of d.screens) {
          const hit = findWithParent(s.root, id);
          if (hit) { hit.node.props = { ...hit.node.props, [key]: value }; return; }
        }
      }),

      setEvent: (id, event, handler) => edit((d) => {
        for (const s of d.screens) {
          const hit = findWithParent(s.root, id);
          if (hit) {
            const events = { ...hit.node.events };
            if (handler && handler.length) events[event] = handler;
            else delete events[event];
            hit.node.events = events;
            return;
          }
        }
      }),

      renameComponent: (id, name) => edit((d) => {
        for (const s of d.screens) {
          const hit = findWithParent(s.root, id);
          if (hit) { hit.node.name = name; return; }
        }
      }),

      addStateVar: (scope, v, screenId) => edit((d) => {
        if (scope === 'global') d.globalState.push({ ...v, scope: 'global' });
        else {
          const s = currentScreen(d, screenId ?? get().currentScreenId);
          s?.state.push({ ...v, scope: 'screen' });
        }
      }),

      updateStateVar: (scope, name, patch, screenId) => edit((d) => {
        const list = scope === 'global'
          ? d.globalState
          : currentScreen(d, screenId ?? get().currentScreenId)?.state ?? [];
        const i = list.findIndex((x) => x.name === name);
        if (i >= 0) list[i] = { ...list[i], ...patch };
      }),

      removeStateVar: (scope, name, screenId) => edit((d) => {
        if (scope === 'global') d.globalState = d.globalState.filter((x) => x.name !== name);
        else {
          const s = currentScreen(d, screenId ?? get().currentScreenId);
          if (s) s.state = s.state.filter((x) => x.name !== name);
        }
      }),

      addScreen: (name) => {
        const screen: Screen = {
          id: newId('s'), name, state: [],
          root: { id: newId('c'), type: 'Column', style: { gap: 12, padding: 16, crossAxis: 'stretch' }, children: [] },
        };
        edit((d) => { d.screens.push(screen); });
        return screen.id;
      },

      removeScreen: (id) => edit((d) => {
        if (d.screens.length <= 1) return;
        d.screens = d.screens.filter((s) => s.id !== id);
        d.nav = d.nav.filter((e) => e.from !== id && e.to !== id);
        if (d.initialScreenId === id) d.initialScreenId = d.screens[0].id;
      }),

      renameScreen: (id, name) => edit((d) => {
        const s = currentScreen(d, id);
        if (s) s.name = name;
      }),

      setInitialScreen: (id) => edit((d) => {
        if (d.screens.some((s) => s.id === id)) d.initialScreenId = id;
      }),

      addNavEdge: (edge) => edit((d) => {
        if (!d.nav.some((e) => e.from === edge.from && e.to === edge.to)) d.nav.push(edge);
      }),

      removeNavEdge: (from, to) => edit((d) => {
        d.nav = d.nav.filter((e) => !(e.from === from && e.to === to));
      }),
    };
  });
}
