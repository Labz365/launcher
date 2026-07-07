/**
 * HTML / CSS / JS emitter.
 *
 * Mapping:
 *   - screens            -> <section class="screen"> toggled by a tiny hash-free router
 *   - screen-local state -> plain JS object per screen (S_<screen>)
 *   - global state       -> shared object G; any mutation calls updateAll()
 *   - bind / expr        -> per-screen update_<screen>() writes textContent /
 *                           checked / value / rebuilds lists
 *   - events             -> addEventListener wiring in init()
 *   - navigate           -> show("<screenKey>")
 *
 * Output: one self-contained runnable index.html (CSS + JS inlined).
 */
import type { App, Component, Expr, Action, Screen, StateVar, PropValue, Style, EventHandler } from '../ir';
import type { Emitter, EmittedFile } from './types';
import { Code, camelCase, escapeStr } from './util';

interface Ctx {
  app: App;
  screen: Screen;
  key: string; // camelCase screen key
  /** var name -> js accessor */
  vars: Map<string, { accessor: string; scope: 'global' | 'screen'; type: StateVar['type'] }>;
  keyOf: (screenId: string) => string;
  /** collected dynamic-update statements for this screen */
  updates: string[];
  /** collected event-wiring statements for this screen */
  wires: string[];
}

function screenKey(s: Screen): string { return camelCase(s.name); }

function makeCtx(app: App, screen: Screen, keyOf: (id: string) => string): Ctx {
  const vars = new Map<string, { accessor: string; scope: 'global' | 'screen'; type: StateVar['type'] }>();
  for (const g of app.globalState) vars.set(g.name, { accessor: `G.${camelCase(g.name)}`, scope: 'global', type: g.type });
  const key = screenKey(screen);
  for (const s of screen.state) vars.set(s.name, { accessor: `S_${key}.${camelCase(s.name)}`, scope: 'screen', type: s.type });
  return { app, screen, key, vars, keyOf, updates: [], wires: [] };
}

// ---- expressions -> JS --------------------------------------------------------

function jsLit(value: string | number | boolean): string {
  if (typeof value === 'string') return `"${escapeStr(value)}"`;
  return String(value);
}

function printExpr(e: Expr, ctx: Ctx, loopVar = 'item', eventVar = 'value'): string {
  switch (e.kind) {
    case 'lit': return jsLit(e.value);
    case 'var': { const v = ctx.vars.get(e.name); return v ? v.accessor : camelCase(e.name); }
    case 'item': return loopVar;
    case 'eventValue': return eventVar;
    case 'unary': return `${e.op}(${printExpr(e.operand, ctx, loopVar, eventVar)})`;
    case 'binary': return `(${printExpr(e.left, ctx, loopVar, eventVar)} ${e.op === '==' ? '===' : e.op === '!=' ? '!==' : e.op} ${printExpr(e.right, ctx, loopVar, eventVar)})`;
    case 'template': {
      let out = '`';
      for (const p of e.parts) {
        if (typeof p === 'string') out += p.replace(/`/g, '\\`').replace(/\$/g, '\\$');
        else out += '${' + printExpr(p, ctx, loopVar, eventVar) + '}';
      }
      return out + '`';
    }
  }
}

/** JS expression yielding a display string for a prop. */
function toStringExpr(pv: PropValue | undefined, ctx: Ctx, loopVar = 'item'): string {
  if (!pv) return '""';
  if (pv.kind === 'static') return jsLit(String(pv.value));
  if (pv.kind === 'bind') { const v = ctx.vars.get(pv.var); return `String(${v ? v.accessor : camelCase(pv.var)})`; }
  return `String(${printExpr(pv.expr, ctx, loopVar)})`;
}

function rawExpr(pv: PropValue | undefined, ctx: Ctx, fallback: string): string {
  if (!pv) return fallback;
  if (pv.kind === 'static') return jsLit(pv.value);
  if (pv.kind === 'bind') { const v = ctx.vars.get(pv.var); return v ? v.accessor : camelCase(pv.var); }
  return printExpr(pv.expr, ctx);
}

// ---- actions -> JS ------------------------------------------------------------

function printAction(a: Action, ctx: Ctx, eventVar = 'value'): string {
  switch (a.kind) {
    case 'SetState': {
      const v = ctx.vars.get(a.target);
      const acc = v ? v.accessor : camelCase(a.target);
      const inval = v && v.scope === 'global' ? 'updateAll();' : `update_${ctx.key}();`;
      return `${acc} = ${printExpr(a.expr, ctx, 'item', eventVar)}; ${inval}`;
    }
    case 'Toggle': {
      const v = ctx.vars.get(a.target);
      const acc = v ? v.accessor : camelCase(a.target);
      const inval = v && v.scope === 'global' ? 'updateAll();' : `update_${ctx.key}();`;
      return `${acc} = !${acc}; ${inval}`;
    }
    case 'AppendList': {
      const v = ctx.vars.get(a.target);
      const acc = v ? v.accessor : camelCase(a.target);
      const inval = v && v.scope === 'global' ? 'updateAll();' : `update_${ctx.key}();`;
      return `${acc}.push(${printExpr(a.expr, ctx, 'item', eventVar)}); ${inval}`;
    }
    case 'Navigate':
      return `show("${ctx.keyOf(a.screenId)}");`;
    case 'CallExpr':
      return `${printExpr(a.expr, ctx, 'item', eventVar)};`;
  }
}

function printHandler(h: EventHandler, ctx: Ctx, eventVar = 'value'): string {
  return h.map((a) => printAction(a, ctx, eventVar)).join(' ');
}

// ---- styles -> inline CSS -----------------------------------------------------

function edgeCss(v: number | { top?: number; right?: number; bottom?: number; left?: number }): string {
  if (typeof v === 'number') return `${v}px`;
  return `${v.top ?? 0}px ${v.right ?? 0}px ${v.bottom ?? 0}px ${v.left ?? 0}px`;
}

function dimCss(d: Style['width']): string | null {
  if (d === undefined || d === 'hug') return null;
  if (d === 'fill') return '100%';
  return `${d}px`;
}

const MAIN: Record<string, string> = { start: 'flex-start', center: 'center', end: 'flex-end', spaceBetween: 'space-between', spaceAround: 'space-around', spaceEvenly: 'space-evenly' };
const CROSS: Record<string, string> = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' };
const WEIGHT: Record<string, string> = { normal: '400', medium: '500', semibold: '600', bold: '700' };

function styleAttr(c: Component): string {
  const s = c.style;
  const bits: string[] = [];
  if (s) {
    if (s.padding !== undefined) bits.push(`padding:${edgeCss(s.padding)}`);
    if (s.margin !== undefined) bits.push(`margin:${edgeCss(s.margin)}`);
    const w = dimCss(s.width); if (w) bits.push(`width:${w}`);
    const h = dimCss(s.height); if (h) bits.push(`height:${h}`);
    if (s.color) bits.push(`color:${s.color}`);
    if (s.background) bits.push(`background:${s.background}`);
    if (s.fontSize) bits.push(`font-size:${s.fontSize}px`);
    if (s.fontWeight) bits.push(`font-weight:${WEIGHT[s.fontWeight]}`);
    if (s.radius) bits.push(`border-radius:${s.radius}px`);
    if (s.flex) bits.push(`flex:${s.flex}`);
    if (c.type === 'Row' || c.type === 'Column') {
      bits.push('display:flex', `flex-direction:${c.type === 'Row' ? 'row' : 'column'}`);
      if (s.gap) bits.push(`gap:${s.gap}px`);
      bits.push(`justify-content:${MAIN[s.mainAxis ?? 'start']}`);
      bits.push(`align-items:${CROSS[s.crossAxis ?? (c.type === 'Row' ? 'center' : 'start')]}`);
    }
  } else if (c.type === 'Row' || c.type === 'Column') {
    bits.push('display:flex', `flex-direction:${c.type === 'Row' ? 'row' : 'column'}`);
  }
  if (c.type === 'Stack') bits.push('display:grid');
  return bits.length ? ` style="${bits.join(';')}"` : '';
}

// ---- static HTML + collected dynamic updates ----------------------------------

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function eid(c: Component): string { return `e_${c.id}`; }

/** Render an item-template subtree to a JS expression producing an HTML string. */
function itemTemplateJs(c: Component, ctx: Ctx): string {
  const style = styleAttr(c).replace(/"/g, "'");
  switch (c.type) {
    case 'Text': {
      const txt = toStringExpr(c.props?.text, ctx, 'item');
      return `\`<div${style.replace(/`/g, '')}>\${esc(${txt})}</div>\``;
    }
    case 'Row': case 'Column': case 'Container': case 'Stack': {
      const kids = (c.children ?? []).map((k) => itemTemplateJs(k, ctx)).join(' + ');
      return `\`<div${style.replace(/`/g, '')}>\` + ${kids || '""'} + \`</div>\``;
    }
    default:
      return '"<span></span>"';
  }
}

function emitComponent(c: Component, ctx: Ctx, h: Code): void {
  const p = c.props ?? {};
  const style = styleAttr(c);
  switch (c.type) {
    case 'Text': {
      const isStatic = !p.text || p.text.kind === 'static';
      const initial = isStatic && p.text && p.text.kind === 'static' ? escHtml(String(p.text.value)) : '';
      h.line(`<span id="${eid(c)}"${style}>${initial}</span>`);
      if (!isStatic) ctx.updates.push(`byId("${eid(c)}").textContent = ${toStringExpr(p.text, ctx)};`);
      break;
    }
    case 'Button': {
      const label = p.label && p.label.kind === 'static' ? escHtml(String(p.label.value)) : '';
      h.line(`<button id="${eid(c)}" class="btn"${style}>${label}</button>`);
      if (p.label && p.label.kind !== 'static') ctx.updates.push(`byId("${eid(c)}").textContent = ${toStringExpr(p.label, ctx)};`);
      if (c.events?.onTap) ctx.wires.push(`byId("${eid(c)}").addEventListener("click", () => { ${printHandler(c.events.onTap, ctx)} });`);
      break;
    }
    case 'TextField': {
      const ph = p.placeholder && p.placeholder.kind === 'static' ? escHtml(String(p.placeholder.value)) : '';
      h.line(`<input id="${eid(c)}" class="input" placeholder="${ph}"${style} />`);
      if (p.value && p.value.kind === 'bind') {
        const v = ctx.vars.get(p.value.var);
        if (v) ctx.updates.push(`{ const el = byId("${eid(c)}"); if (el.value !== String(${v.accessor})) el.value = String(${v.accessor}); }`);
      }
      if (c.events?.onChange) ctx.wires.push(`byId("${eid(c)}").addEventListener("input", (e) => { const value = e.target.value; ${printHandler(c.events.onChange, ctx, 'value')} });`);
      if (c.events?.onSubmit) ctx.wires.push(`byId("${eid(c)}").addEventListener("keydown", (e) => { if (e.key === "Enter") { const value = e.target.value; ${printHandler(c.events.onSubmit, ctx, 'value')} } });`);
      break;
    }
    case 'Switch': {
      h.line(`<input type="checkbox" id="${eid(c)}" class="switch"${style} />`);
      ctx.updates.push(`byId("${eid(c)}").checked = !!(${rawExpr(p.value, ctx, 'false')});`);
      if (c.events?.onChange) ctx.wires.push(`byId("${eid(c)}").addEventListener("change", (e) => { const value = e.target.checked; ${printHandler(c.events.onChange, ctx, 'value')} });`);
      break;
    }
    case 'Image': {
      const src = p.src && p.src.kind === 'static' ? escHtml(String(p.src.value)) : '';
      h.line(`<img id="${eid(c)}" src="${src}" alt=""${style} />`);
      break;
    }
    case 'Spacer': {
      const w = dimCss(c.style?.width) ?? '8px';
      const hh = dimCss(c.style?.height) ?? '8px';
      h.line(`<div style="width:${w};height:${hh};flex-shrink:0"></div>`);
      break;
    }
    case 'ListView': {
      h.line(`<div id="${eid(c)}" class="list"${style}></div>`);
      const items = p.items && p.items.kind === 'bind'
        ? (ctx.vars.get(p.items.var)?.accessor ?? camelCase(p.items.var))
        : '[]';
      const tpl = c.children && c.children[0] ? itemTemplateJs(c.children[0], ctx) : '"<span></span>"';
      ctx.updates.push(`byId("${eid(c)}").innerHTML = (${items}).map((item) => ${tpl}).join("");`);
      break;
    }
    case 'Container': case 'Column': case 'Row': case 'Stack': {
      h.line(`<div id="${eid(c)}"${style}>`);
      h.block(() => { for (const k of c.children ?? []) emitComponent(k, ctx, h); });
      h.line('</div>');
      break;
    }
  }
}

// ---- state --------------------------------------------------------------------

function jsInit(v: StateVar): string {
  switch (v.type) {
    case 'int': case 'double': return String(Number(v.initialValue) || 0);
    case 'bool': return v.initialValue ? 'true' : 'false';
    case 'string': return `"${escapeStr(String(v.initialValue ?? ''))}"`;
    case 'list': return JSON.stringify(v.initialValue ?? []);
  }
}

function stateObj(vars: StateVar[]): string {
  return '{ ' + vars.map((v) => `${camelCase(v.name)}: ${jsInit(v)}`).join(', ') + ' }';
}

// ---- document assembly ----------------------------------------------------------

const BASE_CSS = `  * { box-sizing: border-box; margin: 0; }
  body { font-family: system-ui, -apple-system, sans-serif; background: #f5f5f7; color: #1c1c1e; }
  .screen { display: none; max-width: 480px; margin: 0 auto; min-height: 100vh; background: #fff; }
  .screen.active { display: block; }
  .appbar { padding: 14px 16px; font-weight: 600; border-bottom: 1px solid #e5e5ea; }
  .btn { padding: 8px 16px; border: 0; border-radius: 8px; background: #7C5CFF; color: #fff; font-size: 14px; cursor: pointer; }
  .btn:active { opacity: .8; }
  .input { padding: 8px 10px; border: 1px solid #d1d1d6; border-radius: 8px; font-size: 14px; }
  .switch { width: 20px; height: 20px; accent-color: #7C5CFF; }
  .list > div { padding: 6px 0; border-bottom: 1px solid #f0f0f2; }`;

function emitIndex(app: App): string {
  const keyOf = (() => {
    const m = new Map(app.screens.map((s) => [s.id, screenKey(s)]));
    return (id: string) => m.get(id) ?? 'home';
  })();

  const ctxs = app.screens.map((s) => {
    const ctx = makeCtx(app, s, keyOf);
    const h = new Code();
    h.indent().indent().indent();
    emitComponent(s.root, ctx, h);
    return { ctx, html: h.toString() };
  });

  const c = new Code();
  c.line('<!DOCTYPE html>');
  c.line('<!-- GENERATED by Aelix Canvas — HTML target. -->');
  c.line('<html lang="en">');
  c.line('<head>');
  c.block(() => {
    c.line('<meta charset="utf-8" />');
    c.line('<meta name="viewport" content="width=device-width, initial-scale=1" />');
    c.line(`<title>${escHtml(app.name)}</title>`);
    c.line('<style>');
    c.lines_(BASE_CSS);
    c.line('</style>');
  });
  c.line('</head>');
  c.line('<body>');
  for (const { ctx, html } of ctxs) {
    c.line(`  <section class="screen" id="screen-${ctx.key}">`);
    c.line(`    <div class="appbar">${escHtml(ctx.screen.name)}</div>`);
    c.lines_(html);
    c.line('  </section>');
  }
  c.line('<script>');
  c.line('"use strict";');
  c.line('const byId = (id) => document.getElementById(id);');
  c.line('const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");');
  c.line(`const G = ${stateObj(app.globalState)};`);
  for (const { ctx } of ctxs) c.line(`const S_${ctx.key} = ${stateObj(ctx.screen.state)};`);
  c.line('');
  for (const { ctx } of ctxs) {
    c.line(`function update_${ctx.key}() {`);
    c.block(() => { for (const u of ctx.updates) c.line(u); });
    c.line('}');
  }
  c.line('function updateAll() {');
  c.block(() => { for (const { ctx } of ctxs) c.line(`update_${ctx.key}();`); });
  c.line('}');
  c.line('function show(key) {');
  c.block(() => {
    c.line('document.querySelectorAll(".screen").forEach((el) => el.classList.remove("active"));');
    c.line('const el = byId("screen-" + key);');
    c.line('if (el) el.classList.add("active");');
    c.line('updateAll();');
  });
  c.line('}');
  c.line('');
  for (const { ctx } of ctxs) {
    for (const w of ctx.wires) c.line(w);
  }
  c.line('');
  c.line(`show("${keyOf(app.initialScreenId)}");`);
  c.line('</script>');
  c.line('</body>');
  c.line('</html>');
  return c.toString();
}

export const htmlEmitter: Emitter = {
  id: 'html',
  label: 'HTML / CSS / JS',
  monacoLanguage: 'html',
  emit(app: App): EmittedFile[] {
    return [{ path: 'index.html', contents: emitIndex(app), language: 'html' }];
  },
};
