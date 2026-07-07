/**
 * Python (Tkinter) emitter.
 *
 * Mapping:
 *   - screens            -> tk.Frame subclasses stacked in one container; a
 *                           controller raises the active one (classic pattern)
 *   - screen-local state -> instance attributes; mutations call self.refresh()
 *   - global state       -> AppState object with a listener list; mutations call
 *                           app_state.notify() which refreshes every screen
 *   - bind / expr        -> refresh() re-writes label texts / check states / lists
 *   - events             -> Button command=, StringVar trace, Checkbutton command=
 *   - navigate           -> self.controller.show("<ScreenClass>")
 *
 * Output: one runnable main.py (python3, stdlib only).
 */
import type { App, Component, Expr, Screen, StateVar, PropValue, Style, EventHandler } from '../ir';
import type { Emitter, EmittedFile } from './types';
import { Code, pascalCase, escapeStr } from './util';

function snake(s: string): string {
  return s
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/\s+/)
    .map((w) => w.toLowerCase())
    .join('_') || 'unnamed';
}

function classNameOf(s: Screen): string { return pascalCase(s.name) + 'Screen'; }

interface Ctx {
  app: App;
  screen: Screen;
  vars: Map<string, { accessor: string; scope: 'global' | 'screen'; type: StateVar['type'] }>;
  classOf: (screenId: string) => string;
  /** statements appended to refresh() */
  refresh: string[];
  /** widget counter for unique names */
  n: number;
}

function makeCtx(app: App, screen: Screen, classOf: (id: string) => string): Ctx {
  const vars = new Map<string, { accessor: string; scope: 'global' | 'screen'; type: StateVar['type'] }>();
  for (const g of app.globalState) vars.set(g.name, { accessor: `app_state.${snake(g.name)}`, scope: 'global', type: g.type });
  for (const s of screen.state) vars.set(s.name, { accessor: `self.${snake(s.name)}`, scope: 'screen', type: s.type });
  return { app, screen, vars, classOf, refresh: [], n: 0 };
}

// ---- expressions -> Python ----------------------------------------------------

function pyLit(value: string | number | boolean): string {
  if (typeof value === 'string') return `"${escapeStr(value)}"`;
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  return String(value);
}

function printExpr(e: Expr, ctx: Ctx, loopVar = 'item', eventVar = 'value'): string {
  switch (e.kind) {
    case 'lit': return pyLit(e.value);
    case 'var': { const v = ctx.vars.get(e.name); return v ? v.accessor : snake(e.name); }
    case 'item': return loopVar;
    case 'eventValue': return eventVar;
    case 'unary': return e.op === '!' ? `(not ${printExpr(e.operand, ctx, loopVar, eventVar)})` : `(-${printExpr(e.operand, ctx, loopVar, eventVar)})`;
    case 'binary': {
      const op = e.op === '&&' ? 'and' : e.op === '||' ? 'or' : e.op;
      return `(${printExpr(e.left, ctx, loopVar, eventVar)} ${op} ${printExpr(e.right, ctx, loopVar, eventVar)})`;
    }
    case 'template': {
      let out = 'f"';
      for (const p of e.parts) {
        if (typeof p === 'string') out += escapeStr(p).replace(/\{/g, '{{').replace(/\}/g, '}}');
        else out += '{' + printExpr(p, ctx, loopVar, eventVar) + '}';
      }
      return out + '"';
    }
  }
}

function toStringExpr(pv: PropValue | undefined, ctx: Ctx, loopVar = 'item'): string {
  if (!pv) return '""';
  if (pv.kind === 'static') return `"${escapeStr(String(pv.value))}"`;
  if (pv.kind === 'bind') { const v = ctx.vars.get(pv.var); return `str(${v ? v.accessor : snake(pv.var)})`; }
  return `str(${printExpr(pv.expr, ctx, loopVar)})`;
}

function rawExpr(pv: PropValue | undefined, ctx: Ctx, fallback: string): string {
  if (!pv) return fallback;
  if (pv.kind === 'static') return pyLit(pv.value);
  if (pv.kind === 'bind') { const v = ctx.vars.get(pv.var); return v ? v.accessor : snake(pv.var); }
  return printExpr(pv.expr, ctx);
}

// ---- actions -> Python --------------------------------------------------------

function invalidate(scope: 'global' | 'screen' | undefined): string {
  return scope === 'global' ? 'app_state.notify()' : 'self.refresh()';
}

function printActions(h: EventHandler, ctx: Ctx, eventVar = 'value'): string[] {
  const out: string[] = [];
  for (const a of h) {
    switch (a.kind) {
      case 'SetState': {
        const v = ctx.vars.get(a.target);
        out.push(`${v ? v.accessor : snake(a.target)} = ${printExpr(a.expr, ctx, 'item', eventVar)}`);
        out.push(invalidate(v?.scope));
        break;
      }
      case 'Toggle': {
        const v = ctx.vars.get(a.target);
        const acc = v ? v.accessor : snake(a.target);
        out.push(`${acc} = not ${acc}`);
        out.push(invalidate(v?.scope));
        break;
      }
      case 'AppendList': {
        const v = ctx.vars.get(a.target);
        out.push(`${v ? v.accessor : snake(a.target)}.append(${printExpr(a.expr, ctx, 'item', eventVar)})`);
        out.push(invalidate(v?.scope));
        break;
      }
      case 'Navigate':
        out.push(`self.controller.show("${ctx.classOf(a.screenId)}")`);
        break;
      case 'CallExpr':
        out.push(printExpr(a.expr, ctx, 'item', eventVar));
        break;
    }
  }
  return out;
}

// ---- styles ---------------------------------------------------------------------

function padOf(s?: Style): { padx: number; pady: number } {
  const p = s?.padding;
  if (p === undefined) return { padx: 0, pady: 0 };
  if (typeof p === 'number') return { padx: p, pady: p };
  return { padx: Math.max(p.left ?? 0, p.right ?? 0), pady: Math.max(p.top ?? 0, p.bottom ?? 0) };
}

function fontOf(s?: Style): string | null {
  if (!s || (!s.fontSize && !s.fontWeight)) return null;
  const size = s.fontSize ?? 12;
  const bold = s.fontWeight === 'bold' || s.fontWeight === 'semibold' ? ', "bold"' : '';
  return `("Segoe UI", ${Math.round(size * 0.85)}${bold})`;
}

/** kwargs for a widget constructor from style (fg/bg/font). */
function widgetKwargs(s?: Style): string {
  const bits: string[] = [];
  const f = fontOf(s);
  if (f) bits.push(`font=${f}`);
  if (s?.color) bits.push(`fg="${s.color}"`);
  if (s?.background) bits.push(`bg="${s.background}"`);
  return bits.length ? ', ' + bits.join(', ') : '';
}

/** pack() kwargs for a child inside a Row/Column parent. */
function packArgs(c: Component, parentType: string | null, gap?: number): string {
  const bits: string[] = [];
  const horizontal = parentType === 'Row';
  bits.push(`side=${horizontal ? '"left"' : '"top"'}`);
  if (c.style?.flex && c.style.flex > 0) bits.push('expand=True', 'fill="both"');
  else if (c.style?.width === 'fill' && !horizontal) bits.push('fill="x"');
  if (gap) bits.push(horizontal ? `padx=(0, ${gap})` : `pady=(0, ${gap})`);
  const m = c.style?.margin;
  if (m !== undefined) {
    const mm = typeof m === 'number' ? m : Math.max(m.top ?? 0, m.bottom ?? 0, m.left ?? 0, m.right ?? 0);
    bits.push(`padx=${mm}`, `pady=${mm}`);
  }
  return bits.join(', ');
}

// ---- component printer -----------------------------------------------------------

function emitComponent(c: Component, ctx: Ctx, code: Code, parentVar: string, parentType: string | null, gap?: number): void {
  const p = c.props ?? {};
  ctx.n += 1;
  const w = `self._w${ctx.n}`;
  const pk = packArgs(c, parentType, gap);

  switch (c.type) {
    case 'Text': {
      const isStatic = !p.text || p.text.kind === 'static';
      const init = isStatic && p.text && p.text.kind === 'static' ? `"${escapeStr(String(p.text.value))}"` : '""';
      code.line(`${w} = tk.Label(${parentVar}, text=${init}${widgetKwargs(c.style)})`);
      code.line(`${w}.pack(${pk})`);
      if (!isStatic) ctx.refresh.push(`${w}.config(text=${toStringExpr(p.text, ctx)})`);
      break;
    }
    case 'Button': {
      const label = p.label && p.label.kind === 'static' ? `"${escapeStr(String(p.label.value))}"` : '""';
      const handler = c.events?.onTap ? `_on_tap_${ctx.n}` : null;
      if (handler) {
        code.line(`def ${handler}():`);
        code.block(() => { for (const l of printActions(c.events!.onTap!, ctx)) code.line(l); });
        code.line(`${w} = tk.Button(${parentVar}, text=${label}, command=${handler}${widgetKwargs(c.style)})`);
      } else {
        code.line(`${w} = tk.Button(${parentVar}, text=${label}${widgetKwargs(c.style)})`);
      }
      code.line(`${w}.pack(${pk})`);
      break;
    }
    case 'TextField': {
      const sv = `self._sv${ctx.n}`;
      code.line(`${sv} = tk.StringVar()`);
      code.line(`${w} = tk.Entry(${parentVar}, textvariable=${sv}${widgetKwargs(c.style)})`);
      code.line(`${w}.pack(${pk})`);
      if (c.events?.onChange) {
        code.line(`def _on_change_${ctx.n}(*_):`);
        code.block(() => {
          code.line(`value = ${sv}.get()`);
          for (const l of printActions(c.events!.onChange!, ctx, 'value')) code.line(l);
        });
        code.line(`${sv}.trace_add("write", _on_change_${ctx.n})`);
      }
      if (c.events?.onSubmit) {
        code.line(`def _on_submit_${ctx.n}(_e):`);
        code.block(() => {
          code.line(`value = ${sv}.get()`);
          for (const l of printActions(c.events!.onSubmit!, ctx, 'value')) code.line(l);
        });
        code.line(`${w}.bind("<Return>", _on_submit_${ctx.n})`);
      }
      break;
    }
    case 'Switch': {
      const bv = `self._bv${ctx.n}`;
      code.line(`${bv} = tk.BooleanVar()`);
      if (c.events?.onChange) {
        code.line(`def _on_toggle_${ctx.n}():`);
        code.block(() => {
          code.line(`value = ${bv}.get()`);
          for (const l of printActions(c.events!.onChange!, ctx, 'value')) code.line(l);
        });
        code.line(`${w} = tk.Checkbutton(${parentVar}, variable=${bv}, command=_on_toggle_${ctx.n}${widgetKwargs(c.style)})`);
      } else {
        code.line(`${w} = tk.Checkbutton(${parentVar}, variable=${bv}${widgetKwargs(c.style)})`);
      }
      code.line(`${w}.pack(${pk})`);
      ctx.refresh.push(`${bv}.set(bool(${rawExpr(p.value, ctx, 'False')}))`);
      break;
    }
    case 'Image': {
      const src = p.src && p.src.kind === 'static' ? escapeStr(String(p.src.value)) : '';
      code.line(`${w} = tk.Label(${parentVar}, text="[image: ${src}]", relief="groove"${widgetKwargs(c.style)})`);
      code.line(`${w}.pack(${pk})`);
      break;
    }
    case 'Spacer': {
      const width = typeof c.style?.width === 'number' ? c.style.width : 8;
      const height = typeof c.style?.height === 'number' ? c.style.height : 8;
      code.line(`${w} = tk.Frame(${parentVar}, width=${width}, height=${height})`);
      code.line(`${w}.pack(${pk})`);
      break;
    }
    case 'ListView': {
      code.line(`${w} = tk.Frame(${parentVar})`);
      code.line(`${w}.pack(${pk})`);
      const items = p.items && p.items.kind === 'bind'
        ? (ctx.vars.get(p.items.var)?.accessor ?? snake(p.items.var))
        : '[]';
      // refresh: rebuild rows
      ctx.refresh.push(`[child.destroy() for child in ${w}.winfo_children()]`);
      const tpl = c.children && c.children[0] ? c.children[0] : null;
      const itemText = tpl && tpl.type === 'Text' ? toStringExpr(tpl.props?.text, ctx, 'item') : 'str(item)';
      ctx.refresh.push(`[tk.Label(${w}, text=${itemText}, anchor="w").pack(fill="x") for item in ${items}]`);
      break;
    }
    case 'Container': case 'Column': case 'Row': case 'Stack': {
      const { padx, pady } = padOf(c.style);
      const bg = c.style?.background ? `, bg="${c.style.background}"` : '';
      code.line(`${w} = tk.Frame(${parentVar}, padx=${padx}, pady=${pady}${bg})`);
      code.line(`${w}.pack(${pk})`);
      const childGap = c.style?.gap;
      const kids = c.children ?? [];
      kids.forEach((k, i) => {
        emitComponent(k, ctx, code, w, c.type === 'Row' ? 'Row' : 'Column', i < kids.length - 1 ? childGap : undefined);
      });
      break;
    }
  }
}

// ---- state + assembly -------------------------------------------------------------

function pyInit(v: StateVar): string {
  switch (v.type) {
    case 'int': case 'double': return String(Number(v.initialValue) || 0);
    case 'bool': return v.initialValue ? 'True' : 'False';
    case 'string': return `"${escapeStr(String(v.initialValue ?? ''))}"`;
    case 'list': return JSON.stringify(v.initialValue ?? []).replace(/true/g, 'True').replace(/false/g, 'False');
  }
}

function emitMain(app: App): string {
  const classOf = (() => {
    const m = new Map(app.screens.map((s) => [s.id, classNameOf(s)]));
    return (id: string) => m.get(id) ?? 'HomeScreen';
  })();

  const c = new Code('    ');
  c.line('# GENERATED by Aelix Canvas — Python (Tkinter) target.');
  c.line('# Run: python3 main.py');
  c.line('import tkinter as tk');
  c.line('');
  c.line('');
  c.line('class AppState:');
  c.block(() => {
    c.line('def __init__(self):');
    c.block(() => {
      if (app.globalState.length === 0) c.line('pass');
      for (const g of app.globalState) c.line(`self.${snake(g.name)} = ${pyInit(g)}`);
      c.line('self._listeners = []');
    });
    c.line('');
    c.line('def subscribe(self, fn):');
    c.block(() => c.line('self._listeners.append(fn)'));
    c.line('');
    c.line('def notify(self):');
    c.block(() => {
      c.line('for fn in self._listeners:');
      c.block(() => c.line('fn()'));
    });
  });
  c.line('');
  c.line('');
  c.line('app_state = AppState()');
  c.line('');

  for (const screen of app.screens) {
    const ctx = makeCtx(app, screen, classOf);
    const cls = classNameOf(screen);
    const body = new Code('    ');
    body.indent().indent();
    emitComponent(screen.root, ctx, body, 'self', null);

    c.line('');
    c.line(`class ${cls}(tk.Frame):`);
    c.block(() => {
      c.line('def __init__(self, parent, controller):');
      c.block(() => {
        c.line('super().__init__(parent)');
        c.line('self.controller = controller');
        for (const s of screen.state) c.line(`self.${snake(s.name)} = ${pyInit(s)}`);
        c.line('');
      });
      c.lines_(body.toString().split('\n').map((l) => l.replace(/^ {8}/, '')).join('\n')
        .split('\n').map((l) => (l ? '    ' + l : l)).join('\n'));
      c.block(() => {
        c.line('');
        c.line('app_state.subscribe(self.refresh)');
        c.line('self.refresh()');
      });
      c.line('');
      c.line('def refresh(self):');
      c.block(() => {
        if (ctx.refresh.length === 0) c.line('pass');
        for (const r of ctx.refresh) c.line(r);
      });
    });
    c.line('');
  }

  c.line('');
  c.line('class App(tk.Tk):');
  c.block(() => {
    c.line('def __init__(self):');
    c.block(() => {
      c.line('super().__init__()');
      c.line(`self.title("${escapeStr(app.name)}")`);
      c.line('self.geometry("420x640")');
      c.line('container = tk.Frame(self)');
      c.line('container.pack(fill="both", expand=True)');
      c.line('container.grid_rowconfigure(0, weight=1)');
      c.line('container.grid_columnconfigure(0, weight=1)');
      c.line('self.screens = {}');
      c.line(`for cls in (${app.screens.map(classNameOf).join(', ')}${app.screens.length === 1 ? ',' : ''}):`);
      c.block(() => {
        c.line('frame = cls(container, self)');
        c.line('self.screens[cls.__name__] = frame');
        c.line('frame.grid(row=0, column=0, sticky="nsew")');
      });
      c.line(`self.show("${classOf(app.initialScreenId)}")`);
    });
    c.line('');
    c.line('def show(self, name):');
    c.block(() => {
      c.line('frame = self.screens[name]');
      c.line('frame.tkraise()');
      c.line('frame.refresh()');
    });
  });
  c.line('');
  c.line('');
  c.line('if __name__ == "__main__":');
  c.block(() => c.line('App().mainloop()'));
  return c.toString();
}

export const tkinterEmitter: Emitter = {
  id: 'tkinter',
  label: 'Python (Tkinter)',
  monacoLanguage: 'python',
  emit(app: App): EmittedFile[] {
    return [{ path: 'main.py', contents: emitMain(app), language: 'python' }];
  },
};
