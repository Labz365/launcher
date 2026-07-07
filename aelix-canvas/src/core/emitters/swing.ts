/**
 * Java (Swing) emitter.
 *
 * Mapping:
 *   - screens            -> JPanel subclasses in a CardLayout; show("<Name>") flips cards
 *   - screen-local state -> instance fields; mutations call refresh()
 *   - global state       -> static AppState with a listener list; mutations call
 *                           AppState.notifyChanged() which refreshes every screen
 *   - bind / expr        -> refresh() rewrites label texts / checkbox state / lists
 *   - events             -> ActionListener / DocumentListener / Enter key
 *
 * Output: one runnable Main.java (javac Main.java && java Main).
 */
import type { App, Component, Expr, Screen, StateVar, PropValue, Style, EventHandler } from '../ir';
import type { Emitter, EmittedFile } from './types';
import { Code, pascalCase, camelCase, escapeStr, parseHex } from './util';

function classNameOf(s: Screen): string { return pascalCase(s.name) + 'Screen'; }

interface Ctx {
  app: App;
  screen: Screen;
  vars: Map<string, { accessor: string; scope: 'global' | 'screen'; type: StateVar['type'] }>;
  classOf: (screenId: string) => string;
  refresh: string[];
  fields: string[];
  n: number;
}

function makeCtx(app: App, screen: Screen, classOf: (id: string) => string): Ctx {
  const vars = new Map<string, { accessor: string; scope: 'global' | 'screen'; type: StateVar['type'] }>();
  for (const g of app.globalState) vars.set(g.name, { accessor: `AppState.${camelCase(g.name)}`, scope: 'global', type: g.type });
  for (const s of screen.state) vars.set(s.name, { accessor: camelCase(s.name), scope: 'screen', type: s.type });
  return { app, screen, vars, classOf, refresh: [], fields: [], n: 0 };
}

// ---- expressions -> Java --------------------------------------------------------

function jLit(value: string | number | boolean, vt?: string): string {
  if (typeof value === 'string') return `"${escapeStr(value)}"`;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (vt === 'double' && Number.isInteger(value)) return value.toFixed(1);
  return String(value);
}

function printExpr(e: Expr, ctx: Ctx, loopVar = 'item', eventVar = 'value'): string {
  switch (e.kind) {
    case 'lit': return jLit(e.value, e.valueType);
    case 'var': { const v = ctx.vars.get(e.name); return v ? v.accessor : camelCase(e.name); }
    case 'item': return loopVar;
    case 'eventValue': return eventVar;
    case 'unary': return `${e.op}(${printExpr(e.operand, ctx, loopVar, eventVar)})`;
    case 'binary': {
      // String equality in Java needs .equals — keep == for primitives; the IR
      // doesn't type expressions, so this covers the common numeric/bool case.
      return `(${printExpr(e.left, ctx, loopVar, eventVar)} ${e.op} ${printExpr(e.right, ctx, loopVar, eventVar)})`;
    }
    case 'template': {
      const parts: string[] = [];
      for (const p of e.parts) {
        if (typeof p === 'string') parts.push(`"${escapeStr(p)}"`);
        else parts.push(printExpr(p, ctx, loopVar, eventVar));
      }
      return parts.length ? parts.join(' + ') : '""';
    }
  }
}

function toStringExpr(pv: PropValue | undefined, ctx: Ctx, loopVar = 'item'): string {
  if (!pv) return '""';
  if (pv.kind === 'static') return `"${escapeStr(String(pv.value))}"`;
  if (pv.kind === 'bind') {
    const v = ctx.vars.get(pv.var);
    if (v && v.type === 'string') return v.accessor;
    return `String.valueOf(${v ? v.accessor : camelCase(pv.var)})`;
  }
  if (pv.expr.kind === 'template') return printExpr(pv.expr, ctx, loopVar);
  if (pv.expr.kind === 'lit' && pv.expr.valueType === 'string') return printExpr(pv.expr, ctx, loopVar);
  return `String.valueOf(${printExpr(pv.expr, ctx, loopVar)})`;
}

function rawExpr(pv: PropValue | undefined, ctx: Ctx, fallback: string): string {
  if (!pv) return fallback;
  if (pv.kind === 'static') return jLit(pv.value);
  if (pv.kind === 'bind') { const v = ctx.vars.get(pv.var); return v ? v.accessor : camelCase(pv.var); }
  return printExpr(pv.expr, ctx);
}

// ---- actions -> Java --------------------------------------------------------------

function printActions(h: EventHandler, ctx: Ctx, eventVar = 'value'): string[] {
  const out: string[] = [];
  let touchedGlobal = false, touchedLocal = false;
  for (const a of h) {
    switch (a.kind) {
      case 'SetState': {
        const v = ctx.vars.get(a.target);
        out.push(`${v ? v.accessor : camelCase(a.target)} = ${printExpr(a.expr, ctx, 'item', eventVar)};`);
        if (v?.scope === 'global') touchedGlobal = true; else touchedLocal = true;
        break;
      }
      case 'Toggle': {
        const v = ctx.vars.get(a.target);
        const acc = v ? v.accessor : camelCase(a.target);
        out.push(`${acc} = !${acc};`);
        if (v?.scope === 'global') touchedGlobal = true; else touchedLocal = true;
        break;
      }
      case 'AppendList': {
        const v = ctx.vars.get(a.target);
        out.push(`${v ? v.accessor : camelCase(a.target)}.add(${printExpr(a.expr, ctx, 'item', eventVar)});`);
        if (v?.scope === 'global') touchedGlobal = true; else touchedLocal = true;
        break;
      }
      case 'Navigate':
        out.push(`Main.show("${ctx.classOf(a.screenId)}");`);
        break;
      case 'CallExpr':
        out.push(`${printExpr(a.expr, ctx, 'item', eventVar)};`);
        break;
    }
  }
  if (touchedGlobal) out.push('AppState.notifyChanged();');
  else if (touchedLocal) out.push('refresh();');
  return out;
}

// ---- styles --------------------------------------------------------------------

function javaColor(hex?: string): string | null {
  const c = parseHex(hex);
  return c ? `new Color(${c.r}, ${c.g}, ${c.b})` : null;
}

function fontStatements(w: string, s?: Style): string[] {
  const out: string[] = [];
  if (s?.fontSize || s?.fontWeight) {
    const bold = s.fontWeight === 'bold' || s.fontWeight === 'semibold' ? 'Font.BOLD' : 'Font.PLAIN';
    const size = Math.round((s.fontSize ?? 13) * 0.9);
    out.push(`${w}.setFont(new Font("SansSerif", ${bold}, ${size}));`);
  }
  const fg = javaColor(s?.color);
  if (fg) out.push(`${w}.setForeground(${fg});`);
  return out;
}

// ---- component printer -------------------------------------------------------------

function emitComponent(c: Component, ctx: Ctx, code: Code, parentVar: string, parentAxis: 'x' | 'y' | null, gap?: number): void {
  const p = c.props ?? {};
  ctx.n += 1;
  const w = `w${ctx.n}`;
  const addGap = () => {
    if (gap && parentAxis) code.line(`${parentVar}.add(Box.createRigidArea(new Dimension(${parentAxis === 'x' ? gap : 0}, ${parentAxis === 'y' ? gap : 0})));`);
  };

  switch (c.type) {
    case 'Text': {
      const isStatic = !p.text || p.text.kind === 'static';
      const init = isStatic && p.text && p.text.kind === 'static' ? `"${escapeStr(String(p.text.value))}"` : '""';
      ctx.fields.push(`private final JLabel ${w} = new JLabel(${init});`);
      for (const f of fontStatements(w, c.style)) code.line(f);
      addGap();
      code.line(`${parentVar}.add(${w});`);
      if (!isStatic) ctx.refresh.push(`${w}.setText(${toStringExpr(p.text, ctx)});`);
      break;
    }
    case 'Button': {
      const label = p.label && p.label.kind === 'static' ? `"${escapeStr(String(p.label.value))}"` : '""';
      ctx.fields.push(`private final JButton ${w} = new JButton(${label});`);
      if (c.events?.onTap) {
        code.line(`${w}.addActionListener(e -> {`);
        code.block(() => { for (const l of printActions(c.events!.onTap!, ctx)) code.line(l); });
        code.line('});');
      }
      for (const f of fontStatements(w, c.style)) code.line(f);
      addGap();
      code.line(`${parentVar}.add(${w});`);
      break;
    }
    case 'TextField': {
      ctx.fields.push(`private final JTextField ${w} = new JTextField(14);`);
      code.line(`${w}.setMaximumSize(new Dimension(Integer.MAX_VALUE, ${w}.getPreferredSize().height));`);
      if (c.events?.onChange) {
        code.line(`${w}.getDocument().addDocumentListener(new javax.swing.event.DocumentListener() {`);
        code.block(() => {
          code.line('private void changed() {');
          code.block(() => {
            code.line(`String value = ${w}.getText();`);
            for (const l of printActions(c.events!.onChange!, ctx, 'value')) code.line(l);
          });
          code.line('}');
          code.line('public void insertUpdate(javax.swing.event.DocumentEvent e) { changed(); }');
          code.line('public void removeUpdate(javax.swing.event.DocumentEvent e) { changed(); }');
          code.line('public void changedUpdate(javax.swing.event.DocumentEvent e) { changed(); }');
        });
        code.line('});');
      }
      if (c.events?.onSubmit) {
        code.line(`${w}.addActionListener(e -> {`);
        code.block(() => {
          code.line(`String value = ${w}.getText();`);
          for (const l of printActions(c.events!.onSubmit!, ctx, 'value')) code.line(l);
        });
        code.line('});');
      }
      addGap();
      code.line(`${parentVar}.add(${w});`);
      break;
    }
    case 'Switch': {
      ctx.fields.push(`private final JCheckBox ${w} = new JCheckBox();`);
      if (c.events?.onChange) {
        code.line(`${w}.addActionListener(e -> {`);
        code.block(() => {
          code.line(`boolean value = ${w}.isSelected();`);
          for (const l of printActions(c.events!.onChange!, ctx, 'value')) code.line(l);
        });
        code.line('});');
      }
      addGap();
      code.line(`${parentVar}.add(${w});`);
      ctx.refresh.push(`${w}.setSelected(${rawExpr(p.value, ctx, 'false')});`);
      break;
    }
    case 'Image': {
      const src = p.src && p.src.kind === 'static' ? escapeStr(String(p.src.value)) : '';
      ctx.fields.push(`private final JLabel ${w} = new JLabel("[image: ${src}]");`);
      code.line(`${w}.setBorder(BorderFactory.createEtchedBorder());`);
      addGap();
      code.line(`${parentVar}.add(${w});`);
      break;
    }
    case 'Spacer': {
      const sw = typeof c.style?.width === 'number' ? c.style.width : 8;
      const sh = typeof c.style?.height === 'number' ? c.style.height : 8;
      addGap();
      code.line(`${parentVar}.add(Box.createRigidArea(new Dimension(${sw}, ${sh})));`);
      break;
    }
    case 'ListView': {
      ctx.fields.push(`private final JPanel ${w} = new JPanel();`);
      code.line(`${w}.setLayout(new BoxLayout(${w}, BoxLayout.Y_AXIS));`);
      addGap();
      code.line(`${parentVar}.add(${w});`);
      const items = p.items && p.items.kind === 'bind'
        ? (ctx.vars.get(p.items.var)?.accessor ?? camelCase(p.items.var))
        : 'java.util.Collections.emptyList()';
      const tpl = c.children && c.children[0];
      const itemExpr = tpl && tpl.type === 'Text' ? toStringExpr(tpl.props?.text, ctx, 'item') : 'String.valueOf(item)';
      ctx.refresh.push(`${w}.removeAll();`);
      ctx.refresh.push(`for (Object item : ${items}) { ${w}.add(new JLabel(${itemExpr})); }`);
      ctx.refresh.push(`${w}.revalidate(); ${w}.repaint();`);
      break;
    }
    case 'Container': case 'Column': case 'Row': case 'Stack': {
      const axis = c.type === 'Row' ? 'x' : 'y';
      ctx.fields.push(`private final JPanel ${w} = new JPanel();`);
      code.line(`${w}.setLayout(new BoxLayout(${w}, BoxLayout.${axis === 'x' ? 'X_AXIS' : 'Y_AXIS'}));`);
      code.line(`${w}.setOpaque(false);`);
      const bg = javaColor(c.style?.background);
      if (bg) { code.line(`${w}.setOpaque(true);`); code.line(`${w}.setBackground(${bg});`); }
      const pad = c.style?.padding;
      if (pad !== undefined) {
        const pp = typeof pad === 'number'
          ? { top: pad, left: pad, bottom: pad, right: pad }
          : { top: pad.top ?? 0, left: pad.left ?? 0, bottom: pad.bottom ?? 0, right: pad.right ?? 0 };
        code.line(`${w}.setBorder(BorderFactory.createEmptyBorder(${pp.top}, ${pp.left}, ${pp.bottom}, ${pp.right}));`);
      }
      addGap();
      code.line(`${parentVar}.add(${w});`);
      const kids = c.children ?? [];
      kids.forEach((k, i) => emitComponent(k, ctx, code, w, axis, i > 0 ? c.style?.gap : undefined));
      break;
    }
  }
}

// ---- state + assembly ------------------------------------------------------------

function jType(v: StateVar): string {
  switch (v.type) {
    case 'int': return 'int';
    case 'double': return 'double';
    case 'bool': return 'boolean';
    case 'string': return 'String';
    case 'list': return 'java.util.List<Object>';
  }
}

function jInit(v: StateVar): string {
  switch (v.type) {
    case 'int': return String(Number(v.initialValue) || 0);
    case 'double': { const n = Number(v.initialValue) || 0; return Number.isInteger(n) ? n.toFixed(1) : String(n); }
    case 'bool': return v.initialValue ? 'true' : 'false';
    case 'string': return `"${escapeStr(String(v.initialValue ?? ''))}"`;
    case 'list': {
      const init = (Array.isArray(v.initialValue) ? v.initialValue : []) as unknown[];
      const args = init.map((x) => (typeof x === 'string' ? `"${escapeStr(x)}"` : String(x))).join(', ');
      return `new java.util.ArrayList<>(java.util.List.of(${args}))`;
    }
  }
}

function emitMainJava(app: App): string {
  const classOf = (() => {
    const m = new Map(app.screens.map((s) => [s.id, classNameOf(s)]));
    return (id: string) => m.get(id) ?? 'HomeScreen';
  })();

  const c = new Code('    ');
  c.line('// GENERATED by Aelix Canvas — Java (Swing) target.');
  c.line('// Run: javac Main.java && java Main');
  c.line('import javax.swing.*;');
  c.line('import java.awt.*;');
  c.line('import java.util.ArrayList;');
  c.line('import java.util.List;');
  c.line('');
  c.line('class AppState {');
  c.block(() => {
    for (const g of app.globalState) c.line(`static ${jType(g)} ${camelCase(g.name)} = ${jInit(g)};`);
    c.line('static final List<Runnable> listeners = new ArrayList<>();');
    c.line('static void notifyChanged() { for (Runnable r : listeners) r.run(); }');
  });
  c.line('}');
  c.line('');
  c.line('abstract class ScreenPanel extends JPanel {');
  c.block(() => c.line('abstract void refresh();'));
  c.line('}');
  c.line('');

  for (const screen of app.screens) {
    const ctx = makeCtx(app, screen, classOf);
    const cls = classNameOf(screen);
    const body = new Code('    ');
    body.indent().indent();
    emitComponent(screen.root, ctx, body, 'this', 'y');

    c.line(`class ${cls} extends ScreenPanel {`);
    c.block(() => {
      for (const s of screen.state) c.line(`private ${jType(s)} ${camelCase(s.name)} = ${jInit(s)};`);
      for (const f of ctx.fields) c.line(f);
      c.line('');
      c.line(`${cls}() {`);
      c.block(() => {
        c.line('setLayout(new BoxLayout(this, BoxLayout.Y_AXIS));');
        c.line('setBorder(BorderFactory.createEmptyBorder(16, 16, 16, 16));');
        c.line(`JLabel title = new JLabel("${escapeStr(screen.name)}");`);
        c.line('title.setFont(new Font("SansSerif", Font.BOLD, 18));');
        c.line('add(title);');
        c.line('add(Box.createRigidArea(new Dimension(0, 12)));');
      });
      c.lines_(body.toString());
      c.block(() => {
        c.line('AppState.listeners.add(this::refresh);');
        c.line('refresh();');
      });
      c.line('}');
      c.line('');
      c.line('void refresh() {');
      c.block(() => { for (const r of ctx.refresh) c.line(r); });
      c.line('}');
    });
    c.line('}');
    c.line('');
  }

  c.line('public class Main {');
  c.block(() => {
    c.line('static final CardLayout cards = new CardLayout();');
    c.line('static final JPanel host = new JPanel(cards);');
    c.line('static final java.util.Map<String, ScreenPanel> screens = new java.util.HashMap<>();');
    c.line('');
    c.line('static void show(String name) {');
    c.block(() => {
      c.line('cards.show(host, name);');
      c.line('ScreenPanel p = screens.get(name);');
      c.line('if (p != null) p.refresh();');
    });
    c.line('}');
    c.line('');
    c.line('public static void main(String[] args) {');
    c.block(() => {
      c.line('SwingUtilities.invokeLater(() -> {');
      c.block(() => {
        c.line(`JFrame frame = new JFrame("${escapeStr(app.name)}");`);
        c.line('frame.setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);');
        for (const s of app.screens) {
          c.line(`{ ScreenPanel p = new ${classNameOf(s)}(); screens.put("${classNameOf(s)}", p); host.add(new JScrollPane(p), "${classNameOf(s)}"); }`);
        }
        c.line('frame.setContentPane(host);');
        c.line('frame.setSize(440, 700);');
        c.line('frame.setLocationRelativeTo(null);');
        c.line(`show("${classOf(app.initialScreenId)}");`);
        c.line('frame.setVisible(true);');
      });
      c.line('});');
    });
    c.line('}');
  });
  c.line('}');
  return c.toString();
}

export const swingEmitter: Emitter = {
  id: 'swing',
  label: 'Java (Swing)',
  monacoLanguage: 'java',
  emit(app: App): EmittedFile[] {
    return [{ path: 'Main.java', contents: emitMainJava(app), language: 'java' }];
  },
};
