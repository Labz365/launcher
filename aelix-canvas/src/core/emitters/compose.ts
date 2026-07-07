/**
 * Jetpack Compose (Kotlin) emitter.
 *
 * Mapping:
 *   - screens            -> @Composable functions; navigation via navigation-compose
 *                           NavHost with one route per screen
 *   - screen-local state -> remember { mutableStateOf(...) } / mutableStateListOf
 *   - global state       -> object AppState with top-level mutableStateOf fields
 *   - bind               -> direct reads (Compose recomposes automatically)
 *   - events             -> onClick / onValueChange / onCheckedChange
 *
 * Output: MainActivity.kt plus a build.gradle.kts dependency note.
 */
import type { App, Component, Expr, Action, Screen, StateVar, PropValue, Style, EventHandler } from '../ir';
import type { Emitter, EmittedFile } from './types';
import { Code, pascalCase, camelCase, escapeStr, normHex } from './util';

function funcNameOf(s: Screen): string { return pascalCase(s.name) + 'Screen'; }
function routeOf(s: Screen): string { return camelCase(s.name); }

interface Ctx {
  app: App;
  screen: Screen;
  vars: Map<string, { accessor: string; scope: 'global' | 'screen'; type: StateVar['type'] }>;
  routeFor: (screenId: string) => string;
}

function makeCtx(app: App, screen: Screen, routeFor: (id: string) => string): Ctx {
  const vars = new Map<string, { accessor: string; scope: 'global' | 'screen'; type: StateVar['type'] }>();
  for (const g of app.globalState) vars.set(g.name, { accessor: `AppState.${camelCase(g.name)}`, scope: 'global', type: g.type });
  for (const s of screen.state) vars.set(s.name, { accessor: camelCase(s.name), scope: 'screen', type: s.type });
  return { app, screen, vars, routeFor };
}

// ---- expressions -> Kotlin ----------------------------------------------------

function ktLit(value: string | number | boolean, vt?: string): string {
  if (typeof value === 'string') return `"${escapeStr(value)}"`;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (vt === 'double' && Number.isInteger(value)) return value.toFixed(1);
  return String(value);
}

function printExpr(e: Expr, ctx: Ctx, loopVar = 'item', eventVar = 'value'): string {
  switch (e.kind) {
    case 'lit': return ktLit(e.value, e.valueType);
    case 'var': { const v = ctx.vars.get(e.name); return v ? v.accessor : camelCase(e.name); }
    case 'item': return loopVar;
    case 'eventValue': return eventVar;
    case 'unary': return `${e.op}(${printExpr(e.operand, ctx, loopVar, eventVar)})`;
    case 'binary': return `(${printExpr(e.left, ctx, loopVar, eventVar)} ${e.op} ${printExpr(e.right, ctx, loopVar, eventVar)})`;
    case 'template': {
      let out = '"';
      for (const p of e.parts) {
        if (typeof p === 'string') out += escapeStr(p).replace(/\$/g, '\\$');
        else out += '${' + printExpr(p, ctx, loopVar, eventVar) + '}';
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
    return `"\${${v ? v.accessor : camelCase(pv.var)}}"`;
  }
  if (pv.expr.kind === 'template' || (pv.expr.kind === 'lit' && pv.expr.valueType === 'string')) return printExpr(pv.expr, ctx, loopVar);
  return `"\${${printExpr(pv.expr, ctx, loopVar)}}"`;
}

function rawExpr(pv: PropValue | undefined, ctx: Ctx, fallback: string): string {
  if (!pv) return fallback;
  if (pv.kind === 'static') return ktLit(pv.value);
  if (pv.kind === 'bind') { const v = ctx.vars.get(pv.var); return v ? v.accessor : camelCase(pv.var); }
  return printExpr(pv.expr, ctx);
}

// ---- actions -> Kotlin --------------------------------------------------------

function printAction(a: Action, ctx: Ctx, eventVar = 'value'): string {
  switch (a.kind) {
    case 'SetState': {
      const v = ctx.vars.get(a.target);
      return `${v ? v.accessor : camelCase(a.target)} = ${printExpr(a.expr, ctx, 'item', eventVar)}`;
    }
    case 'Toggle': {
      const v = ctx.vars.get(a.target);
      const acc = v ? v.accessor : camelCase(a.target);
      return `${acc} = !${acc}`;
    }
    case 'AppendList': {
      const v = ctx.vars.get(a.target);
      return `${v ? v.accessor : camelCase(a.target)}.add(${printExpr(a.expr, ctx, 'item', eventVar)})`;
    }
    case 'Navigate':
      return `nav.navigate("${ctx.routeFor(a.screenId)}")`;
    case 'CallExpr':
      return printExpr(a.expr, ctx, 'item', eventVar);
  }
}

function printHandler(h: EventHandler, ctx: Ctx, eventVar = 'value'): string {
  return h.map((a) => printAction(a, ctx, eventVar)).join('; ');
}

// ---- styles -> Modifier chain -------------------------------------------------

function ktColor(hex?: string): string | null {
  const h = normHex(hex);
  return h ? `Color(0xFF${h})` : null;
}

function modifierChain(c: Component): string {
  const s = c.style;
  const bits: string[] = [];
  if (s) {
    if (s.margin !== undefined) {
      if (typeof s.margin === 'number') bits.push(`.padding(${s.margin}.dp)`);
      else bits.push(`.padding(start = ${s.margin.left ?? 0}.dp, top = ${s.margin.top ?? 0}.dp, end = ${s.margin.right ?? 0}.dp, bottom = ${s.margin.bottom ?? 0}.dp)`);
    }
    if (s.width === 'fill') bits.push('.fillMaxWidth()');
    else if (typeof s.width === 'number') bits.push(`.width(${s.width}.dp)`);
    if (s.height === 'fill') bits.push('.fillMaxHeight()');
    else if (typeof s.height === 'number') bits.push(`.height(${s.height}.dp)`);
    const bg = ktColor(s.background);
    if (bg) {
      if (s.radius) bits.push(`.background(${bg}, RoundedCornerShape(${s.radius}.dp))`);
      else bits.push(`.background(${bg})`);
    } else if (s.radius) {
      bits.push(`.clip(RoundedCornerShape(${s.radius}.dp))`);
    }
    if (s.padding !== undefined) {
      if (typeof s.padding === 'number') bits.push(`.padding(${s.padding}.dp)`);
      else bits.push(`.padding(start = ${s.padding.left ?? 0}.dp, top = ${s.padding.top ?? 0}.dp, end = ${s.padding.right ?? 0}.dp, bottom = ${s.padding.bottom ?? 0}.dp)`);
    }
  }
  return bits.length ? `, modifier = Modifier${bits.join('')}` : '';
}

function textStyleArgs(s?: Style): string {
  const bits: string[] = [];
  if (s?.fontSize) bits.push(`fontSize = ${s.fontSize}.sp`);
  if (s?.fontWeight) {
    const w = s.fontWeight === 'bold' ? 'FontWeight.Bold' : s.fontWeight === 'semibold' ? 'FontWeight.SemiBold' : s.fontWeight === 'medium' ? 'FontWeight.Medium' : 'FontWeight.Normal';
    bits.push(`fontWeight = ${w}`);
  }
  const fg = ktColor(s?.color);
  if (fg) bits.push(`color = ${fg}`);
  return bits.length ? ', ' + bits.join(', ') : '';
}

const MAIN: Record<string, string> = {
  start: 'Arrangement.Start', center: 'Arrangement.Center', end: 'Arrangement.End',
  spaceBetween: 'Arrangement.SpaceBetween', spaceAround: 'Arrangement.SpaceAround', spaceEvenly: 'Arrangement.SpaceEvenly',
};
const MAIN_V: Record<string, string> = {
  start: 'Arrangement.Top', center: 'Arrangement.Center', end: 'Arrangement.Bottom',
  spaceBetween: 'Arrangement.SpaceBetween', spaceAround: 'Arrangement.SpaceAround', spaceEvenly: 'Arrangement.SpaceEvenly',
};
const CROSS_H: Record<string, string> = { start: 'Alignment.Top', center: 'Alignment.CenterVertically', end: 'Alignment.Bottom', stretch: 'Alignment.CenterVertically' };
const CROSS_V: Record<string, string> = { start: 'Alignment.Start', center: 'Alignment.CenterHorizontally', end: 'Alignment.End', stretch: 'Alignment.Start' };

// ---- component printer --------------------------------------------------------

function emitComponent(c: Component, ctx: Ctx, code: Code, loopVar = 'item'): void {
  const p = c.props ?? {};
  const mod = modifierChain(c);

  switch (c.type) {
    case 'Text':
      code.line(`Text(${toStringExpr(p.text, ctx, loopVar)}${textStyleArgs(c.style)}${mod})`);
      break;

    case 'Button': {
      const tap = c.events?.onTap ? printHandler(c.events.onTap, ctx) : '';
      code.line(`Button(onClick = { ${tap} }${mod}) {`);
      code.block(() => code.line(`Text(${toStringExpr(p.label, ctx, loopVar)})`));
      code.line('}');
      break;
    }

    case 'TextField': {
      const ph = p.placeholder && p.placeholder.kind === 'static' ? escapeStr(String(p.placeholder.value)) : '';
      const bound = p.value && p.value.kind === 'bind' ? ctx.vars.get(p.value.var) : undefined;
      const valueExpr = bound ? bound.accessor : '""';
      const change = c.events?.onChange ? printHandler(c.events.onChange, ctx, 'value') : (bound ? `${bound.accessor} = value` : '');
      code.line(`OutlinedTextField(`);
      code.block(() => {
        code.line(`value = ${valueExpr},`);
        code.line(`onValueChange = { value -> ${change} },`);
        code.line(`placeholder = { Text("${ph}") }${mod ? mod.slice(2) + ',' : ''}`);
      });
      code.line(')');
      break;
    }

    case 'Switch': {
      const value = rawExpr(p.value, ctx, 'false');
      const change = c.events?.onChange ? printHandler(c.events.onChange, ctx, 'value') : '';
      code.line(`Switch(checked = ${value}, onCheckedChange = { value -> ${change} }${mod})`);
      break;
    }

    case 'Image': {
      const src = p.src && p.src.kind === 'static' ? escapeStr(String(p.src.value)) : '';
      code.line(`AsyncImage(model = "${src}", contentDescription = null${mod})`);
      break;
    }

    case 'Spacer': {
      const w = typeof c.style?.width === 'number' ? c.style.width : 8;
      const h = typeof c.style?.height === 'number' ? c.style.height : 8;
      code.line(`Spacer(modifier = Modifier.width(${w}.dp).height(${h}.dp))`);
      break;
    }

    case 'ListView': {
      const items = p.items && p.items.kind === 'bind'
        ? (ctx.vars.get(p.items.var)?.accessor ?? camelCase(p.items.var))
        : 'emptyList<String>()';
      code.line(`Column${mod ? '(' + mod.slice(2) + ')' : ''} {`);
      code.block(() => {
        code.line(`for (item in ${items}) {`);
        code.block(() => {
          if (c.children && c.children[0]) emitComponent(c.children[0], ctx, code, 'item');
          else code.line('Text("$item")');
        });
        code.line('}');
      });
      code.line('}');
      break;
    }

    case 'Container': {
      code.line(`Box${mod ? '(' + mod.slice(2) + ')' : ''} {`);
      code.block(() => { if (c.children && c.children[0]) emitComponent(c.children[0], ctx, code, loopVar); });
      code.line('}');
      break;
    }

    case 'Column': case 'Row': {
      const gap = c.style?.gap;
      const args: string[] = [];
      if (c.type === 'Column') {
        args.push(`verticalArrangement = ${gap ? `Arrangement.spacedBy(${gap}.dp)` : MAIN_V[c.style?.mainAxis ?? 'start']}`);
        args.push(`horizontalAlignment = ${CROSS_V[c.style?.crossAxis ?? 'start']}`);
      } else {
        args.push(`horizontalArrangement = ${gap ? `Arrangement.spacedBy(${gap}.dp)` : MAIN[c.style?.mainAxis ?? 'start']}`);
        args.push(`verticalAlignment = ${CROSS_H[c.style?.crossAxis ?? 'center']}`);
      }
      if (mod) args.push(mod.slice(2));
      code.line(`${c.type}(${args.join(', ')}) {`);
      code.block(() => { for (const k of c.children ?? []) emitComponent(k, ctx, code, loopVar); });
      code.line('}');
      break;
    }

    case 'Stack': {
      code.line(`Box${mod ? '(' + mod.slice(2) + ')' : ''} {`);
      code.block(() => { for (const k of c.children ?? []) emitComponent(k, ctx, code, loopVar); });
      code.line('}');
      break;
    }
  }
}

// ---- state + assembly ---------------------------------------------------------

function ktStateDecl(v: StateVar, local: boolean): string {
  const name = camelCase(v.name);
  const remember = local ? 'remember { ' : '';
  const endR = local ? ' }' : '';
  switch (v.type) {
    case 'int': return `var ${name} by ${remember}mutableStateOf(${Number(v.initialValue) || 0})${endR}`;
    case 'double': { const n = Number(v.initialValue) || 0; return `var ${name} by ${remember}mutableStateOf(${Number.isInteger(n) ? n.toFixed(1) : n})${endR}`; }
    case 'bool': return `var ${name} by ${remember}mutableStateOf(${v.initialValue ? 'true' : 'false'})${endR}`;
    case 'string': return `var ${name} by ${remember}mutableStateOf("${escapeStr(String(v.initialValue ?? ''))}")${endR}`;
    case 'list': {
      const init = (Array.isArray(v.initialValue) ? v.initialValue : []) as unknown[];
      const args = init.map((x) => (typeof x === 'string' ? `"${escapeStr(x)}"` : String(x))).join(', ');
      return local
        ? `val ${name} = remember { mutableStateListOf<String>(${args}) }`
        : `val ${name} = mutableStateListOf<String>(${args})`;
    }
  }
}

function emitMainKt(app: App): string {
  const routeFor = (() => {
    const m = new Map(app.screens.map((s) => [s.id, routeOf(s)]));
    return (id: string) => m.get(id) ?? 'home';
  })();

  const c = new Code();
  c.line('// GENERATED by Aelix Canvas — Jetpack Compose target.');
  c.line('package com.aelix.generated');
  c.line('');
  c.line('import android.os.Bundle');
  c.line('import androidx.activity.ComponentActivity');
  c.line('import androidx.activity.compose.setContent');
  c.line('import androidx.compose.foundation.background');
  c.line('import androidx.compose.foundation.layout.*');
  c.line('import androidx.compose.foundation.rememberScrollState');
  c.line('import androidx.compose.foundation.shape.RoundedCornerShape');
  c.line('import androidx.compose.foundation.verticalScroll');
  c.line('import androidx.compose.material3.*');
  c.line('import androidx.compose.runtime.*');
  c.line('import androidx.compose.ui.Alignment');
  c.line('import androidx.compose.ui.Modifier');
  c.line('import androidx.compose.ui.draw.clip');
  c.line('import androidx.compose.ui.graphics.Color');
  c.line('import androidx.compose.ui.text.font.FontWeight');
  c.line('import androidx.compose.ui.unit.dp');
  c.line('import androidx.compose.ui.unit.sp');
  c.line('import androidx.navigation.NavHostController');
  c.line('import androidx.navigation.compose.NavHost');
  c.line('import androidx.navigation.compose.composable');
  c.line('import androidx.navigation.compose.rememberNavController');
  c.line('import coil.compose.AsyncImage');
  c.line('');
  c.line('// MARK: Global state — any composable reading these recomposes on change.');
  c.line('object AppState {');
  c.block(() => {
    for (const g of app.globalState) c.line(ktStateDecl(g, false));
    if (app.globalState.length === 0) c.line('// (no global state)');
  });
  c.line('}');
  c.line('');
  c.line('class MainActivity : ComponentActivity() {');
  c.block(() => {
    c.line('override fun onCreate(savedInstanceState: Bundle?) {');
    c.block(() => {
      c.line('super.onCreate(savedInstanceState)');
      c.line('setContent { MaterialTheme { AppNav() } }');
    });
    c.line('}');
  });
  c.line('}');
  c.line('');
  c.line('@Composable');
  c.line('fun AppNav() {');
  c.block(() => {
    c.line('val nav = rememberNavController()');
    c.line(`NavHost(navController = nav, startDestination = "${routeFor(app.initialScreenId)}") {`);
    c.block(() => {
      for (const s of app.screens) c.line(`composable("${routeOf(s)}") { ${funcNameOf(s)}(nav) }`);
    });
    c.line('}');
  });
  c.line('}');
  c.line('');

  for (const screen of app.screens) {
    const ctx = makeCtx(app, screen, routeFor);
    c.line('@OptIn(ExperimentalMaterial3Api::class)');
    c.line('@Composable');
    c.line(`fun ${funcNameOf(screen)}(nav: NavHostController) {`);
    c.block(() => {
      for (const s of screen.state) c.line(ktStateDecl(s, true));
      c.line('Scaffold(topBar = { TopAppBar(title = { Text("' + escapeStr(screen.name) + '") }) }) { inner ->');
      c.block(() => {
        c.line('Column(modifier = Modifier.padding(inner).verticalScroll(rememberScrollState())) {');
        c.block(() => emitComponent(screen.root, ctx, c));
        c.line('}');
      });
      c.line('}');
    });
    c.line('}');
    c.line('');
  }
  return c.toString();
}

const GRADLE_NOTE = `// GENERATED by Aelix Canvas — add these to app/build.gradle.kts
dependencies {
    implementation("androidx.activity:activity-compose:1.9.0")
    implementation(platform("androidx.compose:compose-bom:2024.05.00"))
    implementation("androidx.compose.material3:material3")
    implementation("androidx.navigation:navigation-compose:2.7.7")
    implementation("io.coil-kt:coil-compose:2.6.0")
}
`;

export const composeEmitter: Emitter = {
  id: 'compose',
  label: 'Jetpack Compose (Kotlin)',
  monacoLanguage: 'kotlin',
  emit(app: App): EmittedFile[] {
    return [
      { path: 'app/src/main/java/com/aelix/generated/MainActivity.kt', contents: emitMainKt(app), language: 'kotlin' },
      { path: 'app/build.gradle.deps.kts', contents: GRADLE_NOTE, language: 'kotlin' },
    ];
  },
};
