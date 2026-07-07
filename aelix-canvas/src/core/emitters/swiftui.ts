/**
 * SwiftUI (Swift) emitter.
 *
 * Mapping:
 *   - screens            -> View structs; navigation via a shared Router
 *                           (NavigationStack + path of screen cases)
 *   - screen-local state -> @State properties
 *   - global state       -> AppState: ObservableObject with @Published fields,
 *                           injected as @EnvironmentObject
 *   - bind               -> direct property reads; Switch/TextField use Bindings
 *   - events             -> closures on Button / onChange / onSubmit
 *
 * Output: Sources/App.swift (single runnable file for an iOS/macOS SwiftUI app).
 */
import type { App, Component, Expr, Action, Screen, StateVar, PropValue, Style, EventHandler } from '../ir';
import type { Emitter, EmittedFile } from './types';
import { Code, pascalCase, camelCase, escapeStr, parseHex } from './util';

function viewNameOf(s: Screen): string { return pascalCase(s.name) + 'View'; }
function caseNameOf(s: Screen): string { return camelCase(s.name); }

interface Ctx {
  app: App;
  screen: Screen;
  vars: Map<string, { accessor: string; scope: 'global' | 'screen'; type: StateVar['type'] }>;
  caseOf: (screenId: string) => string;
}

function makeCtx(app: App, screen: Screen, caseOf: (id: string) => string): Ctx {
  const vars = new Map<string, { accessor: string; scope: 'global' | 'screen'; type: StateVar['type'] }>();
  for (const g of app.globalState) vars.set(g.name, { accessor: `appState.${camelCase(g.name)}`, scope: 'global', type: g.type });
  for (const s of screen.state) vars.set(s.name, { accessor: camelCase(s.name), scope: 'screen', type: s.type });
  return { app, screen, vars, caseOf };
}

// ---- expressions -> Swift -----------------------------------------------------

function swiftLit(value: string | number | boolean, vt?: string): string {
  if (typeof value === 'string') return `"${escapeStr(value)}"`;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (vt === 'double' && Number.isInteger(value)) return value.toFixed(1);
  return String(value);
}

function printExpr(e: Expr, ctx: Ctx, loopVar = 'item', eventVar = 'value'): string {
  switch (e.kind) {
    case 'lit': return swiftLit(e.value, e.valueType);
    case 'var': { const v = ctx.vars.get(e.name); return v ? v.accessor : camelCase(e.name); }
    case 'item': return loopVar;
    case 'eventValue': return eventVar;
    case 'unary': return `${e.op}(${printExpr(e.operand, ctx, loopVar, eventVar)})`;
    case 'binary': return `(${printExpr(e.left, ctx, loopVar, eventVar)} ${e.op} ${printExpr(e.right, ctx, loopVar, eventVar)})`;
    case 'template': {
      let out = '"';
      for (const p of e.parts) {
        if (typeof p === 'string') out += escapeStr(p);
        else out += '\\(' + printExpr(p, ctx, loopVar, eventVar) + ')';
      }
      return out + '"';
    }
  }
}

function toStringExpr(pv: PropValue | undefined, ctx: Ctx, loopVar = 'item'): string {
  if (!pv) return '""';
  if (pv.kind === 'static') return `"${escapeStr(String(pv.value))}"`;
  if (pv.kind === 'bind') {
    const v = ctx.vars.get(pv.var);
    if (v && v.type === 'string') return v.accessor;
    return `"\\(${v ? v.accessor : camelCase(pv.var)})"`;
  }
  if (pv.expr.kind === 'template' || (pv.expr.kind === 'lit' && pv.expr.valueType === 'string')) return printExpr(pv.expr, ctx, loopVar);
  return `"\\(${printExpr(pv.expr, ctx, loopVar)})"`;
}

// ---- actions -> Swift ---------------------------------------------------------

function printAction(a: Action, ctx: Ctx, eventVar = 'value'): string {
  switch (a.kind) {
    case 'SetState': {
      const v = ctx.vars.get(a.target);
      return `${v ? v.accessor : camelCase(a.target)} = ${printExpr(a.expr, ctx, 'item', eventVar)}`;
    }
    case 'Toggle': {
      const v = ctx.vars.get(a.target);
      const acc = v ? v.accessor : camelCase(a.target);
      return `${acc}.toggle()`;
    }
    case 'AppendList': {
      const v = ctx.vars.get(a.target);
      return `${v ? v.accessor : camelCase(a.target)}.append(${printExpr(a.expr, ctx, 'item', eventVar)})`;
    }
    case 'Navigate':
      return `router.push(.${ctx.caseOf(a.screenId)})`;
    case 'CallExpr':
      return `_ = ${printExpr(a.expr, ctx, 'item', eventVar)}`;
  }
}

function printHandler(h: EventHandler, ctx: Ctx, eventVar = 'value'): string {
  return h.map((a) => printAction(a, ctx, eventVar)).join('; ');
}

// ---- styles -> modifiers ------------------------------------------------------

function swiftColor(hex?: string): string | null {
  const c = parseHex(hex);
  if (!c) return null;
  const f = (n: number) => (n / 255).toFixed(3);
  return `Color(red: ${f(c.r)}, green: ${f(c.g)}, blue: ${f(c.b)})`;
}

function fontMod(s?: Style): string[] {
  const out: string[] = [];
  if (s?.fontSize) {
    const weight = s.fontWeight === 'bold' ? ', weight: .bold' : s.fontWeight === 'semibold' ? ', weight: .semibold' : s.fontWeight === 'medium' ? ', weight: .medium' : '';
    out.push(`.font(.system(size: ${s.fontSize}${weight}))`);
  } else if (s?.fontWeight) {
    const w = s.fontWeight === 'bold' ? '.bold' : s.fontWeight === 'semibold' ? '.semibold' : s.fontWeight === 'medium' ? '.medium' : '.regular';
    out.push(`.fontWeight(${w})`);
  }
  return out;
}

function styleMods(c: Component): string[] {
  const s = c.style;
  if (!s) return [];
  const mods: string[] = [];
  if (c.type === 'Text') mods.push(...fontMod(s));
  const fg = swiftColor(s.color);
  if (fg && c.type !== 'Button') mods.push(`.foregroundColor(${fg})`);
  if (s.padding !== undefined) {
    if (typeof s.padding === 'number') mods.push(`.padding(${s.padding})`);
    else {
      const p = s.padding;
      mods.push(`.padding(EdgeInsets(top: ${p.top ?? 0}, leading: ${p.left ?? 0}, bottom: ${p.bottom ?? 0}, trailing: ${p.right ?? 0}))`);
    }
  }
  const bg = swiftColor(s.background);
  if (bg) mods.push(`.background(${bg})`);
  if (s.radius) mods.push(`.cornerRadius(${s.radius})`);
  const w = s.width === 'fill' ? 'maxWidth: .infinity' : typeof s.width === 'number' ? `width: ${s.width}` : null;
  const h = s.height === 'fill' ? 'maxHeight: .infinity' : typeof s.height === 'number' ? `height: ${s.height}` : null;
  if (w || h) mods.push(`.frame(${[w, h].filter(Boolean).join(', ')})`);
  if (s.margin !== undefined) {
    if (typeof s.margin === 'number') mods.push(`.padding(${s.margin})`);
    else {
      const m = s.margin;
      mods.push(`.padding(EdgeInsets(top: ${m.top ?? 0}, leading: ${m.left ?? 0}, bottom: ${m.bottom ?? 0}, trailing: ${m.right ?? 0}))`);
    }
  }
  return mods;
}

const H_ALIGN: Record<string, string> = { start: '.leading', center: '.center', end: '.trailing', stretch: '.leading' };
const V_ALIGN: Record<string, string> = { start: '.top', center: '.center', end: '.bottom', stretch: '.center' };

// ---- component printer --------------------------------------------------------

function applyMods(code: Code, mods: string[]): void {
  if (mods.length) code.block(() => { for (const m of mods) code.line(m); });
}

function bindingFor(pv: PropValue | undefined, ctx: Ctx): string | null {
  if (!pv || pv.kind !== 'bind') return null;
  const v = ctx.vars.get(pv.var);
  if (!v) return null;
  return v.scope === 'global' ? `$appState.${camelCase(pv.var)}` : `$${v.accessor}`;
}

function emitComponent(c: Component, ctx: Ctx, code: Code, loopVar = 'item'): void {
  const p = c.props ?? {};
  const mods = styleMods(c);

  switch (c.type) {
    case 'Text':
      code.line(`Text(${toStringExpr(p.text, ctx, loopVar)})`);
      applyMods(code, mods);
      break;

    case 'Button': {
      const tap = c.events?.onTap ? printHandler(c.events.onTap, ctx) : '';
      code.line(`Button(action: { ${tap} }) {`);
      code.block(() => code.line(`Text(${toStringExpr(p.label, ctx, loopVar)})`));
      code.line('}');
      code.block(() => {
        code.line('.buttonStyle(.borderedProminent)');
        for (const m of mods) code.line(m);
      });
      break;
    }

    case 'TextField': {
      const ph = p.placeholder && p.placeholder.kind === 'static' ? escapeStr(String(p.placeholder.value)) : '';
      const binding = bindingFor(p.value, ctx);
      if (binding) {
        code.line(`TextField("${ph}", text: ${binding})`);
        code.block(() => {
          code.line('.textFieldStyle(.roundedBorder)');
          if (c.events?.onChange) code.line(`.onChange(of: ${binding.slice(1)}) { value in ${printHandler(c.events.onChange, ctx, 'value')} }`);
          if (c.events?.onSubmit) code.line(`.onSubmit { let value = ${binding.slice(1)}; ${printHandler(c.events.onSubmit, ctx, 'value')} }`);
          for (const m of mods) code.line(m);
        });
      } else {
        // No value binding: drive events through a write-only proxy binding.
        const change = c.events?.onChange ? printHandler(c.events.onChange, ctx, 'value') : '';
        code.line(`TextField("${ph}", text: Binding(get: { "" }, set: { value in ${change} }))`);
        code.block(() => {
          code.line('.textFieldStyle(.roundedBorder)');
          for (const m of mods) code.line(m);
        });
      }
      break;
    }

    case 'Switch': {
      const binding = bindingFor(p.value, ctx) ?? 'Binding(get: { false }, set: { _ in })';
      code.line(`Toggle("", isOn: ${binding})`);
      code.block(() => {
        code.line('.labelsHidden()');
        if (c.events?.onChange && p.value && p.value.kind === 'bind' && binding.startsWith('$')) {
          // The binding itself flips the var; only emit actions beyond that flip.
          const boundVar = p.value.var;
          const extra = c.events.onChange.filter((a) => !(a.kind === 'Toggle' && a.target === boundVar));
          if (extra.length) code.line(`.onChange(of: ${binding.slice(1)}) { value in ${printHandler(extra, ctx, 'value')} }`);
        }
        for (const m of mods) code.line(m);
      });
      break;
    }

    case 'Image': {
      const src = p.src && p.src.kind === 'static' ? escapeStr(String(p.src.value)) : '';
      code.line(`AsyncImage(url: URL(string: "${src}")) { image in image.resizable().scaledToFit() } placeholder: { ProgressView() }`);
      applyMods(code, mods);
      break;
    }

    case 'Spacer': {
      const w = typeof c.style?.width === 'number' ? c.style.width : null;
      const h = typeof c.style?.height === 'number' ? c.style.height : null;
      if (w || h) code.line(`Spacer().frame(${[w ? `width: ${w}` : null, h ? `height: ${h}` : null].filter(Boolean).join(', ')})`);
      else code.line('Spacer()');
      break;
    }

    case 'ListView': {
      const items = p.items && p.items.kind === 'bind'
        ? (ctx.vars.get(p.items.var)?.accessor ?? camelCase(p.items.var))
        : '[String]()';
      code.line(`ForEach(Array(${items}.enumerated()), id: \\.offset) { _, item in`);
      code.block(() => {
        if (c.children && c.children[0]) emitComponent(c.children[0], ctx, code, 'item');
        else code.line('EmptyView()');
      });
      code.line('}');
      applyMods(code, mods);
      break;
    }

    case 'Container': {
      const kid = c.children && c.children[0];
      if (kid) {
        emitComponent(kid, ctx, code, loopVar);
        applyMods(code, mods);
      } else {
        code.line('EmptyView()');
        applyMods(code, mods);
      }
      break;
    }

    case 'Column': case 'Row': {
      const gap = c.style?.gap ?? 8;
      const align = c.type === 'Column' ? H_ALIGN[c.style?.crossAxis ?? 'start'] : V_ALIGN[c.style?.crossAxis ?? 'center'];
      const stack = c.type === 'Column' ? 'VStack' : 'HStack';
      code.line(`${stack}(alignment: ${align}, spacing: ${gap}) {`);
      code.block(() => { for (const k of c.children ?? []) emitComponent(k, ctx, code, loopVar); });
      code.line('}');
      applyMods(code, mods);
      break;
    }

    case 'Stack': {
      code.line('ZStack {');
      code.block(() => { for (const k of c.children ?? []) emitComponent(k, ctx, code, loopVar); });
      code.line('}');
      applyMods(code, mods);
      break;
    }
  }
}

// ---- state + assembly ---------------------------------------------------------

function swiftType(v: StateVar): string {
  switch (v.type) {
    case 'int': return 'Int';
    case 'double': return 'Double';
    case 'bool': return 'Bool';
    case 'string': return 'String';
    case 'list': return '[String]';
  }
}

function swiftInit(v: StateVar): string {
  switch (v.type) {
    case 'int': return String(Number(v.initialValue) || 0);
    case 'double': { const n = Number(v.initialValue) || 0; return Number.isInteger(n) ? n.toFixed(1) : String(n); }
    case 'bool': return v.initialValue ? 'true' : 'false';
    case 'string': return `"${escapeStr(String(v.initialValue ?? ''))}"`;
    case 'list': return JSON.stringify(v.initialValue ?? []);
  }
}

function emitApp(app: App): string {
  const caseOf = (() => {
    const m = new Map(app.screens.map((s) => [s.id, caseNameOf(s)]));
    return (id: string) => m.get(id) ?? 'home';
  })();

  const c = new Code();
  c.line('// GENERATED by Aelix Canvas — SwiftUI target.');
  c.line('import SwiftUI');
  c.line('');
  c.line('// MARK: - Global state');
  c.line('final class AppState: ObservableObject {');
  c.block(() => {
    for (const g of app.globalState) c.line(`@Published var ${camelCase(g.name)}: ${swiftType(g)} = ${swiftInit(g)}`);
    if (app.globalState.length === 0) c.line('// (no global state)');
  });
  c.line('}');
  c.line('');
  c.line('// MARK: - Router');
  c.line('enum AppScreen: Hashable {');
  c.block(() => { for (const s of app.screens) c.line(`case ${caseNameOf(s)}`); });
  c.line('}');
  c.line('');
  c.line('final class Router: ObservableObject {');
  c.block(() => {
    c.line('@Published var path: [AppScreen] = []');
    c.line('func push(_ s: AppScreen) { path.append(s) }');
  });
  c.line('}');
  c.line('');
  c.line('@main');
  c.line('struct AelixApp: App {');
  c.block(() => {
    c.line('@StateObject private var appState = AppState()');
    c.line('@StateObject private var router = Router()');
    c.line('var body: some Scene {');
    c.block(() => {
      c.line('WindowGroup {');
      c.block(() => {
        c.line('NavigationStack(path: $router.path) {');
        c.block(() => {
          c.line(`${viewNameOf(app.screens.find((s) => s.id === app.initialScreenId) ?? app.screens[0])}()`);
          c.block(() => {
            c.line('.navigationDestination(for: AppScreen.self) { screen in');
            c.block(() => {
              c.line('switch screen {');
              for (const s of app.screens) c.line(`case .${caseNameOf(s)}: ${viewNameOf(s)}()`);
              c.line('}');
            });
            c.line('}');
          });
        });
        c.line('}');
        c.line('.environmentObject(appState)');
        c.line('.environmentObject(router)');
      });
      c.line('}');
    });
    c.line('}');
  });
  c.line('}');
  c.line('');

  for (const screen of app.screens) {
    const ctx = makeCtx(app, screen, caseOf);
    c.line(`// MARK: - ${screen.name}`);
    c.line(`struct ${viewNameOf(screen)}: View {`);
    c.block(() => {
      c.line('@EnvironmentObject var appState: AppState');
      c.line('@EnvironmentObject var router: Router');
      for (const s of screen.state) c.line(`@State private var ${camelCase(s.name)}: ${swiftType(s)} = ${swiftInit(s)}`);
      c.line('');
      c.line('var body: some View {');
      c.block(() => {
        c.line('ScrollView {');
        c.block(() => emitComponent(screen.root, ctx, c));
        c.line('}');
        c.line(`.navigationTitle("${escapeStr(screen.name)}")`);
      });
      c.line('}');
    });
    c.line('}');
    c.line('');
  }
  return c.toString();
}

export const swiftuiEmitter: Emitter = {
  id: 'swiftui',
  label: 'SwiftUI (Swift)',
  monacoLanguage: 'swift',
  emit(app: App): EmittedFile[] {
    return [{ path: 'Sources/App.swift', contents: emitApp(app), language: 'swift' }];
  },
};
