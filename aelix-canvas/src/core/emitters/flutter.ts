/**
 * Flutter (Dart) emitter.
 *
 * Mapping (see README "State/Event mapping"):
 *   - screen-local state -> fields in a StatefulWidget's State, mutated via setState
 *   - global state       -> fields on a top-level ChangeNotifier `appState`,
 *                           screens rebuild via AnimatedBuilder, mutated via
 *                           appState.update(() => ...)
 *   - bind               -> widget reads the field / appState.field
 *   - navigate           -> Navigator.pushNamed(context, route, arguments: {...})
 *   - events             -> onPressed / onChanged / onSubmitted callbacks
 *
 * Output: a runnable single-file `lib/main.dart` plus a `pubspec.yaml`.
 */
import type { App, Component, Expr, Action, Screen, StateVar, PropValue, Style, EventHandler } from '../ir';
import type { Emitter, EmittedFile } from './types';
import { Code, pascalCase, camelCase, escapeStr, parseHex } from './util';

// ---- name + scope resolution -------------------------------------------------

interface ScreenCtx {
  app: App;
  screen: Screen;
  /** original var name -> { field accessor, scope, type } */
  vars: Map<string, { accessor: string; scope: 'global' | 'screen'; type: StateVar['type']; field: string }>;
  routeOf: (screenId: string) => string;
  /** TextField id -> controller field name (only for fields with a value binding). */
  controllers: Map<string, string>;
}

function classNameOf(s: Screen): string {
  return pascalCase(s.name) + 'Screen';
}

function buildRouteMap(app: App): (screenId: string) => string {
  const map = new Map<string, string>();
  for (const s of app.screens) {
    map.set(s.id, s.id === app.initialScreenId ? '/' : '/' + camelCase(s.name));
  }
  return (id: string) => map.get(id) ?? '/';
}

function makeScreenCtx(app: App, screen: Screen, routeOf: (id: string) => string): ScreenCtx {
  const vars = new Map<string, { accessor: string; scope: 'global' | 'screen'; type: StateVar['type']; field: string }>();
  for (const g of app.globalState) {
    const field = camelCase(g.name);
    vars.set(g.name, { accessor: `appState.${field}`, scope: 'global', type: g.type, field });
  }
  for (const s of screen.state) {
    const field = camelCase(s.name);
    vars.set(s.name, { accessor: field, scope: 'screen', type: s.type, field });
  }
  const controllers = new Map<string, string>();
  collectControllers(screen.root, controllers);
  return { app, screen, vars, routeOf, controllers };
}

function collectControllers(c: Component, out: Map<string, string>): void {
  if (c.type === 'TextField') {
    out.set(c.id, `_tc_${camelCase((c.name || c.id).slice(0, 12))}_${out.size}`);
  }
  for (const k of c.children ?? []) collectControllers(k, out);
}

// ---- expression printer ------------------------------------------------------

function dartLit(value: string | number | boolean, vt?: string): string {
  if (typeof value === 'string') return `"${escapeStr(value)}"`;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (vt === 'double' && Number.isInteger(value)) return value.toFixed(1);
  return String(value);
}

function printExpr(e: Expr, ctx: ScreenCtx, loopVar = 'item', eventVar = 'value'): string {
  switch (e.kind) {
    case 'lit': return dartLit(e.value, e.valueType);
    case 'var': {
      const v = ctx.vars.get(e.name);
      return v ? v.accessor : camelCase(e.name);
    }
    case 'item': return loopVar;
    case 'eventValue': return eventVar;
    case 'unary': return `${e.op}(${printExpr(e.operand, ctx, loopVar, eventVar)})`;
    case 'binary':
      return `(${printExpr(e.left, ctx, loopVar, eventVar)} ${e.op} ${printExpr(e.right, ctx, loopVar, eventVar)})`;
    case 'template': {
      let out = '"';
      for (const p of e.parts) {
        if (typeof p === 'string') out += escapeStr(p);
        else out += '${' + printExpr(p, ctx, loopVar, eventVar) + '}';
      }
      return out + '"';
    }
  }
}

/** Produce a Dart String expression for a prop that feeds a Text/label. */
function toStringExpr(pv: PropValue | undefined, ctx: ScreenCtx, loopVar = 'item'): string {
  if (!pv) return '""';
  if (pv.kind === 'static') {
    if (typeof pv.value === 'string') return `"${escapeStr(pv.value)}"`;
    return `"${String(pv.value)}"`;
  }
  if (pv.kind === 'bind') {
    const v = ctx.vars.get(pv.var);
    if (v && v.type === 'string') return v.accessor;
    return '"${' + (v ? v.accessor : camelCase(pv.var)) + '}"';
  }
  // expr
  if (pv.expr.kind === 'template') return printExpr(pv.expr, ctx, loopVar);
  if (pv.expr.kind === 'lit' && pv.expr.valueType === 'string') return printExpr(pv.expr, ctx, loopVar);
  return '"${' + printExpr(pv.expr, ctx, loopVar) + '}"';
}

function rawExpr(pv: PropValue | undefined, ctx: ScreenCtx, fallback: string, loopVar = 'item'): string {
  if (!pv) return fallback;
  if (pv.kind === 'static') return dartLit(pv.value);
  if (pv.kind === 'bind') {
    const v = ctx.vars.get(pv.var);
    return v ? v.accessor : camelCase(pv.var);
  }
  return printExpr(pv.expr, ctx, loopVar);
}

// ---- action printer ----------------------------------------------------------

function printAction(a: Action, ctx: ScreenCtx, eventVar = 'value'): string {
  switch (a.kind) {
    case 'SetState': {
      const v = ctx.vars.get(a.target);
      const rhs = printExpr(a.expr, ctx, 'item', eventVar);
      if (v && v.scope === 'global') return `appState.update(() => ${v.accessor} = ${rhs});`;
      return `setState(() => ${v ? v.field : camelCase(a.target)} = ${rhs});`;
    }
    case 'Toggle': {
      const v = ctx.vars.get(a.target);
      if (v && v.scope === 'global') return `appState.update(() => ${v.accessor} = !${v.accessor});`;
      const f = v ? v.field : camelCase(a.target);
      return `setState(() => ${f} = !${f});`;
    }
    case 'AppendList': {
      const v = ctx.vars.get(a.target);
      const val = printExpr(a.expr, ctx, 'item', eventVar);
      if (v && v.scope === 'global') return `appState.update(() => ${v.accessor}.add(${val}));`;
      return `setState(() => ${v ? v.field : camelCase(a.target)}.add(${val}));`;
    }
    case 'Navigate': {
      const route = ctx.routeOf(a.screenId);
      const params = a.params ?? {};
      const keys = Object.keys(params);
      if (keys.length === 0) return `Navigator.pushNamed(context, "${route}");`;
      const args = keys.map((k) => `"${k}": ${printExpr(params[k], ctx, 'item', eventVar)}`).join(', ');
      return `Navigator.pushNamed(context, "${route}", arguments: {${args}});`;
    }
    case 'CallExpr':
      return `${printExpr(a.expr, ctx, 'item', eventVar)};`;
  }
}

function printHandler(handler: EventHandler, ctx: ScreenCtx, eventVar = 'value'): string {
  return handler.map((a) => printAction(a, ctx, eventVar)).join(' ');
}

// ---- style helpers -----------------------------------------------------------

function color(hex?: string): string | null {
  const c = parseHex(hex);
  if (!c) return null;
  const to2 = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
  return `Color(0xFF${to2(c.r)}${to2(c.g)}${to2(c.b)})`;
}

function edge(v: number | { top?: number; right?: number; bottom?: number; left?: number }): string {
  if (typeof v === 'number') return `EdgeInsets.all(${v.toFixed(1)})`;
  const t = (v.top ?? 0).toFixed(1), r = (v.right ?? 0).toFixed(1), b = (v.bottom ?? 0).toFixed(1), l = (v.left ?? 0).toFixed(1);
  return `EdgeInsets.fromLTRB(${l}, ${t}, ${r}, ${b})`;
}

function dim(d: Style['width']): string | null {
  if (d === undefined || d === 'hug') return null;
  if (d === 'fill') return 'double.infinity';
  return d.toFixed(1);
}

function mainAxis(v?: Style['mainAxis']): string {
  switch (v) {
    case 'center': return 'MainAxisAlignment.center';
    case 'end': return 'MainAxisAlignment.end';
    case 'spaceBetween': return 'MainAxisAlignment.spaceBetween';
    case 'spaceAround': return 'MainAxisAlignment.spaceAround';
    case 'spaceEvenly': return 'MainAxisAlignment.spaceEvenly';
    default: return 'MainAxisAlignment.start';
  }
}
function crossAxis(v?: Style['crossAxis']): string {
  switch (v) {
    case 'center': return 'CrossAxisAlignment.center';
    case 'end': return 'CrossAxisAlignment.end';
    case 'stretch': return 'CrossAxisAlignment.stretch';
    default: return 'CrossAxisAlignment.start';
  }
}
function fontWeight(v?: Style['fontWeight']): string | null {
  switch (v) {
    case 'medium': return 'FontWeight.w500';
    case 'semibold': return 'FontWeight.w600';
    case 'bold': return 'FontWeight.bold';
    case 'normal': return 'FontWeight.normal';
    default: return null;
  }
}

/** Wrap a built widget string with padding/size/background/margin layers. */
function wrapStyle(widget: string, style?: Style): string {
  if (!style) return widget;
  let w = widget;
  if (style.padding !== undefined) w = `Padding(padding: ${edge(style.padding)}, child: ${w})`;
  const bg = color(style.background);
  if (bg || style.radius) {
    const decoBits = [bg ? `color: ${bg}` : null, style.radius ? `borderRadius: BorderRadius.circular(${style.radius.toFixed(1)})` : null].filter(Boolean).join(', ');
    w = `Container(decoration: BoxDecoration(${decoBits}), child: ${w})`;
  }
  const ww = dim(style.width), hh = dim(style.height);
  if (ww || hh) {
    const bits = [ww ? `width: ${ww}` : null, hh ? `height: ${hh}` : null].filter(Boolean).join(', ');
    w = `SizedBox(${bits}, child: ${w})`;
  }
  if (style.margin !== undefined) w = `Padding(padding: ${edge(style.margin)}, child: ${w})`;
  return w;
}

// ---- component printer -------------------------------------------------------

function textStyleArg(style?: Style): string {
  if (!style) return '';
  const bits: string[] = [];
  if (style.fontSize) bits.push(`fontSize: ${style.fontSize.toFixed(1)}`);
  const fw = fontWeight(style.fontWeight);
  if (fw) bits.push(`fontWeight: ${fw}`);
  const c = color(style.color);
  if (c) bits.push(`color: ${c}`);
  return bits.length ? `, style: TextStyle(${bits.join(', ')})` : '';
}

function emitComponent(c: Component, ctx: ScreenCtx, loopVar = 'item'): string {
  const p = c.props ?? {};
  let widget: string;

  switch (c.type) {
    case 'Text':
      widget = `Text(${toStringExpr(p.text, ctx, loopVar)}${textStyleArg(c.style)})`;
      break;

    case 'Button': {
      const label = toStringExpr(p.label, ctx, loopVar);
      const tap = c.events?.onTap ? printHandler(c.events.onTap, ctx) : '';
      widget = `ElevatedButton(onPressed: () { ${tap} }, child: Text(${label}))`;
      break;
    }

    case 'TextField': {
      const controller = ctx.controllers.get(c.id);
      const hint = p.placeholder && p.placeholder.kind === 'static' ? escapeStr(String(p.placeholder.value)) : '';
      const change = c.events?.onChange ? `onChanged: (value) { ${printHandler(c.events.onChange, ctx, 'value')} }, ` : '';
      const submit = c.events?.onSubmit ? `onSubmitted: (value) { ${printHandler(c.events.onSubmit, ctx, 'value')} }, ` : '';
      const ctrl = controller ? `controller: ${controller}, ` : '';
      widget = `TextField(${ctrl}${change}${submit}decoration: InputDecoration(hintText: "${hint}"))`;
      break;
    }

    case 'Switch': {
      const value = rawExpr(p.value, ctx, 'false', loopVar);
      const change = c.events?.onChange ? printHandler(c.events.onChange, ctx, 'value') : '';
      widget = `Switch(value: ${value}, onChanged: (value) { ${change} })`;
      break;
    }

    case 'Image': {
      const src = p.src && p.src.kind === 'static' ? escapeStr(String(p.src.value)) : '';
      widget = `Image.network("${src}", errorBuilder: (c, e, s) => Icon(Icons.image))`;
      break;
    }

    case 'Spacer':
      widget = `SizedBox(width: ${dim(c.style?.width) ?? '8.0'}, height: ${dim(c.style?.height) ?? '8.0'})`;
      return widget; // spacer ignores wrap

    case 'ListView': {
      const itemsAccessor = p.items && p.items.kind === 'bind'
        ? (ctx.vars.get(p.items.var)?.accessor ?? camelCase(p.items.var))
        : '[]';
      const tmpl = c.children && c.children[0]
        ? emitComponent(c.children[0], ctx, 'item')
        : 'SizedBox.shrink()';
      widget = `ListView(shrinkWrap: true, physics: NeverScrollableScrollPhysics(), children: [for (final item in ${itemsAccessor}) ${tmpl}])`;
      break;
    }

    case 'Container': {
      const child = c.children && c.children[0] ? emitComponent(c.children[0], ctx, loopVar) : 'SizedBox.shrink()';
      widget = child; // styling wrapped below
      break;
    }

    case 'Column':
    case 'Row': {
      const kids = (c.children ?? []).map((k) => wrapFlexChild(k, ctx, loopVar));
      const gapped = interleaveGap(kids, c.type, c.style?.gap);
      widget = `${c.type}(mainAxisSize: MainAxisSize.min, mainAxisAlignment: ${mainAxis(c.style?.mainAxis)}, crossAxisAlignment: ${crossAxis(c.style?.crossAxis)}, children: [${gapped.join(', ')}])`;
      break;
    }

    case 'Stack': {
      const kids = (c.children ?? []).map((k) => emitComponent(k, ctx, loopVar));
      widget = `Stack(children: [${kids.join(', ')}])`;
      break;
    }

    default:
      widget = 'SizedBox.shrink()';
  }

  return wrapStyle(widget, c.style);
}

function wrapFlexChild(c: Component, ctx: ScreenCtx, loopVar: string): string {
  const w = emitComponent(c, ctx, loopVar);
  if (c.style?.flex && c.style.flex > 0) return `Expanded(flex: ${c.style.flex}, child: ${w})`;
  return w;
}

function interleaveGap(kids: string[], axis: 'Row' | 'Column', gap?: number): string[] {
  if (!gap || kids.length < 2) return kids;
  const sb = axis === 'Row' ? `SizedBox(width: ${gap.toFixed(1)})` : `SizedBox(height: ${gap.toFixed(1)})`;
  const out: string[] = [];
  kids.forEach((k, i) => { if (i > 0) out.push(sb); out.push(k); });
  return out;
}

// ---- screen + app assembly ---------------------------------------------------

function stateFieldInit(v: StateVar): string {
  const f = camelCase(v.name);
  switch (v.type) {
    case 'int': return `int ${f} = ${Number(v.initialValue) || 0};`;
    case 'double': { const n = Number(v.initialValue) || 0; return `double ${f} = ${Number.isInteger(n) ? n.toFixed(1) : n};`; }
    case 'bool': return `bool ${f} = ${v.initialValue ? 'true' : 'false'};`;
    case 'string': return `String ${f} = "${escapeStr(String(v.initialValue ?? ''))}";`;
    case 'list': return `List<dynamic> ${f} = ${JSON.stringify(v.initialValue ?? [])};`;
  }
}

function emitAppState(app: App): string {
  const c = new Code();
  c.line('class _AppState extends ChangeNotifier {');
  c.block(() => {
    for (const g of app.globalState) c.line(stateFieldInit(g));
    c.line('void update(void Function() fn) { fn(); notifyListeners(); }');
  });
  c.line('}');
  c.line('final appState = _AppState();');
  return c.toString();
}

function emitScreen(app: App, screen: Screen, routeOf: (id: string) => string): string {
  const ctx = makeScreenCtx(app, screen, routeOf);
  const cls = classNameOf(screen);
  const c = new Code();

  c.line(`class ${cls} extends StatefulWidget {`);
  c.block(() => {
    c.line(`const ${cls}({super.key});`);
    c.line(`@override`);
    c.line(`State<${cls}> createState() => _${cls}State();`);
  });
  c.line('}');
  c.line('');
  c.line(`class _${cls}State extends State<${cls}> {`);
  c.block(() => {
    for (const s of screen.state) c.line(stateFieldInit(s));
    // controllers
    for (const [, name] of ctx.controllers) c.line(`final ${name} = TextEditingController();`);
    if (ctx.controllers.size) {
      c.line('@override');
      c.line('void dispose() {');
      c.block(() => {
        for (const [, name] of ctx.controllers) c.line(`${name}.dispose();`);
        c.line('super.dispose();');
      });
      c.line('}');
    }
    c.line('@override');
    c.line('Widget build(BuildContext context) {');
    c.block(() => {
      const body = emitComponent(screen.root, ctx);
      c.line('return AnimatedBuilder(');
      c.block(() => {
        c.line('animation: appState,');
        c.line('builder: (context, _) => Scaffold(');
        c.block(() => {
          c.line(`appBar: AppBar(title: Text("${escapeStr(screen.name)}")),`);
          c.line(`body: SingleChildScrollView(child: Padding(padding: const EdgeInsets.all(16.0), child: ${body})),`);
        });
        c.line('),');
      });
      c.line(');');
    });
    c.line('}');
  });
  c.line('}');
  return c.toString();
}

function emitMain(app: App): string {
  const routeOf = buildRouteMap(app);
  const c = new Code();
  c.line('// GENERATED by Aelix Canvas — Flutter target. Do not edit by hand.');
  c.line("import 'package:flutter/material.dart';");
  c.line('');
  c.lines_(emitAppState(app));
  c.line('');
  c.line('void main() => runApp(const AelixApp());');
  c.line('');
  c.line('class AelixApp extends StatelessWidget {');
  c.block(() => {
    c.line('const AelixApp({super.key});');
    c.line('@override');
    c.line('Widget build(BuildContext context) {');
    c.block(() => {
      c.line('return MaterialApp(');
      c.block(() => {
        c.line(`title: "${escapeStr(app.name)}",`);
        c.line('theme: ThemeData(useMaterial3: true, colorSchemeSeed: const Color(0xFF7C5CFF)),');
        c.line("initialRoute: '/',");
        c.line('routes: {');
        c.block(() => {
          for (const s of app.screens) {
            c.line(`"${routeOf(s.id)}": (context) => const ${classNameOf(s)}(),`);
          }
        });
        c.line('},');
      });
      c.line(');');
    });
    c.line('}');
  });
  c.line('}');
  c.line('');
  for (const s of app.screens) {
    c.lines_(emitScreen(app, s, routeOf));
    c.line('');
  }
  return c.toString();
}

function emitPubspec(app: App): string {
  const pkg = camelCase(app.name).replace(/[^a-z0-9_]/g, '') || 'aelix_app';
  return [
    `name: ${pkg.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase())}`,
    'description: Generated by Aelix Canvas.',
    'publish_to: none',
    "version: 1.0.0+1",
    '',
    'environment:',
    "  sdk: '>=3.0.0 <4.0.0'",
    '',
    'dependencies:',
    '  flutter:',
    '    sdk: flutter',
    '',
    'flutter:',
    '  uses-material-design: true',
    '',
  ].join('\n');
}

export const flutterEmitter: Emitter = {
  id: 'flutter',
  label: 'Flutter (Dart)',
  monacoLanguage: 'dart',
  emit(app: App): EmittedFile[] {
    return [
      { path: 'lib/main.dart', contents: emitMain(app), language: 'dart' },
      { path: 'pubspec.yaml', contents: emitPubspec(app), language: 'yaml' },
    ];
  },
};
