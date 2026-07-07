/**
 * Aelix Canvas — language-agnostic Intermediate Representation (IR).
 *
 * This module is the single source of truth for what a designed app *is*.
 * It has ZERO dependencies on React, Tauri, or any UI/runtime library — it is
 * pure data + a few pure constructors. Every emitter (Flutter, SwiftUI, Compose,
 * HTML) consumes this IR and nothing else. Adding a language = adding one emitter.
 *
 * Design rule: nothing in here may reference target syntax. "fontWeight: 'bold'"
 * is fine (abstract); "FontWeight.bold" is not (Dart). Targets are produced only
 * inside emitters.
 */

// ---------------------------------------------------------------------------
// Identifiers & primitives
// ---------------------------------------------------------------------------

export type Id = string;

/** Scalar value types a state variable can hold. */
export type ValueType = 'int' | 'double' | 'string' | 'bool' | 'list';

// ---------------------------------------------------------------------------
// Expressions
// ---------------------------------------------------------------------------
// Expressions are language-agnostic. Each emitter has an expression printer that
// turns these into target syntax. They are intentionally small but complete
// enough for the documented Actions (SetState/Toggle/AppendList/CallExpr/Navigate).

export type BinaryOp =
  | '+' | '-' | '*' | '/' | '%'
  | '==' | '!=' | '<' | '>' | '<=' | '>='
  | '&&' | '||';

export type UnaryOp = '!' | '-';

export type Expr =
  /** Literal constant. `valueType` disambiguates int vs double, etc. */
  | { kind: 'lit'; value: string | number | boolean; valueType: ValueType }
  /** Reference to a state variable (global or screen-local), by name. */
  | { kind: 'var'; name: string }
  /** The current item inside a ListView item template. */
  | { kind: 'item' }
  /** The payload of the triggering event (e.g. new text of a TextField onChange). */
  | { kind: 'eventValue' }
  | { kind: 'binary'; op: BinaryOp; left: Expr; right: Expr }
  | { kind: 'unary'; op: UnaryOp; operand: Expr }
  /** String interpolation: ['Count: ', {var count}, '!'] -> "Count: 3!". */
  | { kind: 'template'; parts: Array<string | Expr> };

// Expression constructors (ergonomic, optional to use).
export const lit = (value: string | number | boolean, valueType: ValueType): Expr => ({ kind: 'lit', value, valueType });
export const int = (value: number): Expr => ({ kind: 'lit', value, valueType: 'int' });
export const str = (value: string): Expr => ({ kind: 'lit', value, valueType: 'string' });
export const bool = (value: boolean): Expr => ({ kind: 'lit', value, valueType: 'bool' });
export const ref = (name: string): Expr => ({ kind: 'var', name });
export const item = (): Expr => ({ kind: 'item' });
export const eventValue = (): Expr => ({ kind: 'eventValue' });
export const bin = (op: BinaryOp, left: Expr, right: Expr): Expr => ({ kind: 'binary', op, left, right });
export const una = (op: UnaryOp, operand: Expr): Expr => ({ kind: 'unary', op, operand });
export const tmpl = (...parts: Array<string | Expr>): Expr => ({ kind: 'template', parts });

// ---------------------------------------------------------------------------
// Actions & event handlers
// ---------------------------------------------------------------------------

export type EventName = 'onTap' | 'onChange' | 'onSubmit';

export type Action =
  /** Assign `expr` to state variable `target`. */
  | { kind: 'SetState'; target: string; expr: Expr }
  /** Boolean flip of `target`. */
  | { kind: 'Toggle'; target: string }
  /** Append `expr` to list variable `target`. */
  | { kind: 'AppendList'; target: string; expr: Expr }
  /** Navigate to a screen, optionally passing params (name -> expr). */
  | { kind: 'Navigate'; screenId: Id; params?: Record<string, Expr> }
  /** Evaluate an expression for its side effect (escape hatch). */
  | { kind: 'CallExpr'; expr: Expr };

/** An ordered list of actions bound to a component event. */
export type EventHandler = Action[];

// ---------------------------------------------------------------------------
// Styling (abstract — emitters map to target style systems)
// ---------------------------------------------------------------------------

export interface EdgeInsets {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export type Dimension = number | 'fill' | 'hug';
export type MainAxisAlign = 'start' | 'center' | 'end' | 'spaceBetween' | 'spaceAround' | 'spaceEvenly';
export type CrossAxisAlign = 'start' | 'center' | 'end' | 'stretch';
export type FontWeight = 'normal' | 'medium' | 'semibold' | 'bold';

export interface Style {
  padding?: number | EdgeInsets;
  margin?: number | EdgeInsets;
  width?: Dimension;
  height?: Dimension;
  /** Foreground / text / tint color. Hex string, e.g. "#7C5CFF". */
  color?: string;
  /** Background / fill color. */
  background?: string;
  fontSize?: number;
  fontWeight?: FontWeight;
  /** Main-axis alignment for flex containers (Row/Column). */
  mainAxis?: MainAxisAlign;
  /** Cross-axis alignment for flex containers, or self-alignment otherwise. */
  crossAxis?: CrossAxisAlign;
  /** Flex grow factor when this node is a child of a Row/Column. */
  flex?: number;
  /** Corner radius (Container/Image/Button). */
  radius?: number;
  /** Gap between children (Row/Column). */
  gap?: number;
}

// ---------------------------------------------------------------------------
// Property values (static, bound, or computed)
// ---------------------------------------------------------------------------
// Component-specific props (Text.text, Button.label, TextField.value, Image.src,
// Switch.value, ListView.items) all live in `props` as PropValue. A `bind` is the
// IR's "Binding: component prop <- state var".

export type PropValue =
  | { kind: 'static'; value: string | number | boolean }
  | { kind: 'bind'; var: string }
  | { kind: 'expr'; expr: Expr };

export const sval = (value: string | number | boolean): PropValue => ({ kind: 'static', value });
export const bind = (varName: string): PropValue => ({ kind: 'bind', var: varName });
export const pexpr = (expr: Expr): PropValue => ({ kind: 'expr', expr });

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export type ComponentType =
  // Layout
  | 'Container' | 'Column' | 'Row' | 'Stack'
  // Display
  | 'Text' | 'Image' | 'Spacer' | 'ListView'
  // Input
  | 'Button' | 'TextField' | 'Switch';

export const LAYOUT_TYPES: ComponentType[] = ['Container', 'Column', 'Row', 'Stack'];
export const CONTAINER_TYPES: ComponentType[] = ['Container', 'Column', 'Row', 'Stack', 'ListView'];

/** Components that accept arbitrary children dropped into them on the canvas. */
export function acceptsChildren(type: ComponentType): boolean {
  return type === 'Container' || type === 'Column' || type === 'Row' || type === 'Stack';
}

/**
 * A node in the UI tree.
 *
 * Known prop keys by type:
 *  - Text:      text   (string)
 *  - Button:    label  (string)
 *  - TextField: value  (string, usually bound), placeholder (string)
 *  - Image:     src    (string)
 *  - Switch:    value  (bool, usually bound)
 *  - ListView:  items  (bound list var); renders `children[0]` as the item template
 *               where Expr {kind:'item'} resolves to the current element.
 */
export interface Component {
  id: Id;
  type: ComponentType;
  name?: string;
  style?: Style;
  props?: Record<string, PropValue>;
  events?: Partial<Record<EventName, EventHandler>>;
  children?: Component[];
}

// ---------------------------------------------------------------------------
// State, screens, app
// ---------------------------------------------------------------------------

export type Scope = 'global' | 'screen';

export interface StateVar {
  name: string;
  type: ValueType;
  initialValue: string | number | boolean | unknown[];
  scope: Scope;
}

export interface Screen {
  id: Id;
  name: string;
  /** Screen-local state. */
  state: StateVar[];
  /** Root component subtree. Conventionally a single layout root. */
  root: Component;
}

export interface NavEdge {
  from: Id; // screen id
  to: Id;   // screen id
  /** Optional label for the wiring (e.g. the action that triggers it). */
  label?: string;
}

export interface App {
  name: string;
  /** App-wide state. */
  globalState: StateVar[];
  screens: Screen[];
  /** Entry screen id. */
  initialScreenId: Id;
  /** Declared navigation graph (informational + drives generated route tables). */
  nav: NavEdge[];
}

// ---------------------------------------------------------------------------
// Small pure helpers (used by store + emitters; no side effects)
// ---------------------------------------------------------------------------

let _counter = 0;
/** Deterministic-ish id generator. Prefix groups ids by kind for readability. */
export function newId(prefix = 'n'): Id {
  _counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${_counter.toString(36)}`;
}

/** Depth-first search for a component by id within a subtree. */
export function findComponent(root: Component, id: Id): Component | undefined {
  if (root.id === id) return root;
  for (const c of root.children ?? []) {
    const hit = findComponent(c, id);
    if (hit) return hit;
  }
  return undefined;
}

/** Find a component plus its parent + index. Returns undefined if not found. */
export function findWithParent(
  root: Component,
  id: Id,
  parent: Component | null = null,
): { node: Component; parent: Component | null; index: number } | undefined {
  if (root.id === id) return { node: root, parent, index: -1 };
  const kids = root.children ?? [];
  for (let i = 0; i < kids.length; i++) {
    if (kids[i].id === id) return { node: kids[i], parent: root, index: i };
    const deep = findWithParent(kids[i], id, root);
    if (deep) return deep;
  }
  return undefined;
}

/** Collect all state vars visible inside a screen (screen-local + global). */
export function visibleState(app: App, screen: Screen): StateVar[] {
  return [...app.globalState, ...screen.state];
}

export function getScreen(app: App, id: Id): Screen | undefined {
  return app.screens.find((s) => s.id === id);
}
