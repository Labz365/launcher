/**
 * C# WPF (XAML) emitter.
 *
 * Mapping:
 *   - screens            -> UserControls hosted in MainWindow's ContentControl;
 *                           Nav.Show("<ScreenName>") swaps the active screen
 *   - screen-local state -> instance fields on the code-behind; mutations call Refresh()
 *   - global state       -> static AppState class with a Changed event; every
 *                           screen subscribes and refreshes
 *   - bind / expr        -> Refresh() writes .Text / .IsChecked / rebuilds ItemsControl
 *   - events             -> Click / TextChanged / KeyDown(Enter) handlers
 *
 * Output: a complete runnable .NET 8 WPF project (csproj, App, MainWindow, screens).
 */
import type { App, Component, Expr, Screen, StateVar, PropValue, EventHandler } from '../ir';
import type { Emitter, EmittedFile } from './types';
import { Code, pascalCase, camelCase, escapeStr } from './util';

function classNameOf(s: Screen): string { return pascalCase(s.name) + 'Screen'; }

interface Ctx {
  app: App;
  screen: Screen;
  vars: Map<string, { accessor: string; scope: 'global' | 'screen'; type: StateVar['type'] }>;
  classOf: (screenId: string) => string;
  refresh: string[];
  /** handler methods emitted into code-behind */
  methods: string[];
  n: number;
}

function makeCtx(app: App, screen: Screen, classOf: (id: string) => string): Ctx {
  const vars = new Map<string, { accessor: string; scope: 'global' | 'screen'; type: StateVar['type'] }>();
  for (const g of app.globalState) vars.set(g.name, { accessor: `AppState.${pascalCase(g.name)}`, scope: 'global', type: g.type });
  for (const s of screen.state) vars.set(s.name, { accessor: `_${camelCase(s.name)}`, scope: 'screen', type: s.type });
  return { app, screen, vars, classOf, refresh: [], methods: [], n: 0 };
}

// ---- expressions -> C# ----------------------------------------------------------

function csLit(value: string | number | boolean, vt?: string): string {
  if (typeof value === 'string') return `"${escapeStr(value)}"`;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (vt === 'double' && Number.isInteger(value)) return value.toFixed(1);
  return String(value);
}

function printExpr(e: Expr, ctx: Ctx, loopVar = 'item', eventVar = 'value'): string {
  switch (e.kind) {
    case 'lit': return csLit(e.value, e.valueType);
    case 'var': { const v = ctx.vars.get(e.name); return v ? v.accessor : `_${camelCase(e.name)}`; }
    case 'item': return loopVar;
    case 'eventValue': return eventVar;
    case 'unary': return `${e.op}(${printExpr(e.operand, ctx, loopVar, eventVar)})`;
    case 'binary': return `(${printExpr(e.left, ctx, loopVar, eventVar)} ${e.op} ${printExpr(e.right, ctx, loopVar, eventVar)})`;
    case 'template': {
      let out = '$"';
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
  if (pv.kind === 'bind') {
    const v = ctx.vars.get(pv.var);
    if (v && v.type === 'string') return v.accessor;
    return `${v ? v.accessor : `_${camelCase(pv.var)}`}.ToString()`;
  }
  if (pv.expr.kind === 'template' || (pv.expr.kind === 'lit' && pv.expr.valueType === 'string')) return printExpr(pv.expr, ctx, loopVar);
  return `(${printExpr(pv.expr, ctx, loopVar)}).ToString()`;
}

function rawExpr(pv: PropValue | undefined, ctx: Ctx, fallback: string): string {
  if (!pv) return fallback;
  if (pv.kind === 'static') return csLit(pv.value);
  if (pv.kind === 'bind') { const v = ctx.vars.get(pv.var); return v ? v.accessor : `_${camelCase(pv.var)}`; }
  return printExpr(pv.expr, ctx);
}

// ---- actions -> C# ----------------------------------------------------------------

function printActions(h: EventHandler, ctx: Ctx, eventVar = 'value'): string[] {
  const out: string[] = [];
  let touchedGlobal = false, touchedLocal = false;
  for (const a of h) {
    switch (a.kind) {
      case 'SetState': {
        const v = ctx.vars.get(a.target);
        out.push(`${v ? v.accessor : `_${camelCase(a.target)}`} = ${printExpr(a.expr, ctx, 'item', eventVar)};`);
        if (v?.scope === 'global') touchedGlobal = true; else touchedLocal = true;
        break;
      }
      case 'Toggle': {
        const v = ctx.vars.get(a.target);
        const acc = v ? v.accessor : `_${camelCase(a.target)}`;
        out.push(`${acc} = !${acc};`);
        if (v?.scope === 'global') touchedGlobal = true; else touchedLocal = true;
        break;
      }
      case 'AppendList': {
        const v = ctx.vars.get(a.target);
        out.push(`${v ? v.accessor : `_${camelCase(a.target)}`}.Add(${printExpr(a.expr, ctx, 'item', eventVar)});`);
        if (v?.scope === 'global') touchedGlobal = true; else touchedLocal = true;
        break;
      }
      case 'Navigate':
        out.push(`Nav.Show("${ctx.classOf(a.screenId)}");`);
        break;
      case 'CallExpr':
        out.push(`_ = ${printExpr(a.expr, ctx, 'item', eventVar)};`);
        break;
    }
  }
  if (touchedGlobal) out.push('AppState.Notify();');
  else if (touchedLocal) out.push('Refresh();');
  return out;
}

// ---- styles -> XAML attributes ------------------------------------------------

function thickness(v: number | { top?: number; right?: number; bottom?: number; left?: number }): string {
  if (typeof v === 'number') return String(v);
  return `${v.left ?? 0},${v.top ?? 0},${v.right ?? 0},${v.bottom ?? 0}`;
}

const WEIGHT: Record<string, string> = { normal: 'Normal', medium: 'Medium', semibold: 'SemiBold', bold: 'Bold' };

function styleAttrs(c: Component, forText = false): string {
  const s = c.style;
  if (!s) return '';
  const bits: string[] = [];
  if (s.margin !== undefined) bits.push(`Margin="${thickness(s.margin)}"`);
  if (typeof s.width === 'number') bits.push(`Width="${s.width}"`);
  if (typeof s.height === 'number') bits.push(`Height="${s.height}"`);
  if (s.width === 'fill') bits.push('HorizontalAlignment="Stretch"');
  if (forText) {
    if (s.fontSize) bits.push(`FontSize="${s.fontSize}"`);
    if (s.fontWeight) bits.push(`FontWeight="${WEIGHT[s.fontWeight]}"`);
    if (s.color) bits.push(`Foreground="${s.color}"`);
  }
  if (s.background && c.type !== 'Container') bits.push(`Background="${s.background}"`);
  return bits.length ? ' ' + bits.join(' ') : '';
}

// ---- component printer ----------------------------------------------------------

function xmlEsc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function emitComponent(c: Component, ctx: Ctx, x: Code, parentType: string | null, gap?: number): void {
  const p = c.props ?? {};
  ctx.n += 1;
  const name = `E${ctx.n}`;
  // gap between siblings: emulate with Margin on all but first child
  const gapAttr = gap ? (parentType === 'Row' ? ` Margin="${gap},0,0,0"` : ` Margin="0,${gap},0,0"`) : '';

  switch (c.type) {
    case 'Text': {
      const isStatic = !p.text || p.text.kind === 'static';
      const initial = isStatic && p.text && p.text.kind === 'static' ? xmlEsc(String(p.text.value)) : '';
      x.line(`<TextBlock x:Name="${name}" Text="${initial}"${styleAttrs(c, true)}${gapAttr} />`);
      if (!isStatic) ctx.refresh.push(`${name}.Text = ${toStringExpr(p.text, ctx)};`);
      break;
    }
    case 'Button': {
      const label = p.label && p.label.kind === 'static' ? xmlEsc(String(p.label.value)) : '';
      const click = c.events?.onTap ? ` Click="OnTap${ctx.n}"` : '';
      x.line(`<Button x:Name="${name}" Content="${label}" Padding="12,6"${click}${styleAttrs(c, true)}${gapAttr} />`);
      if (c.events?.onTap) {
        const m = new Code('    ');
        m.line(`private void OnTap${ctx.n}(object sender, RoutedEventArgs e)`);
        m.line('{');
        m.block(() => { for (const l of printActions(c.events!.onTap!, ctx)) m.line(l); });
        m.line('}');
        ctx.methods.push(m.toString());
      }
      break;
    }
    case 'TextField': {
      const ph = p.placeholder && p.placeholder.kind === 'static' ? xmlEsc(String(p.placeholder.value)) : '';
      const changed = c.events?.onChange ? ` TextChanged="OnChange${ctx.n}"` : '';
      const keydown = c.events?.onSubmit ? ` KeyDown="OnKey${ctx.n}"` : '';
      x.line(`<TextBox x:Name="${name}" Tag="${ph}" Padding="6"${changed}${keydown}${styleAttrs(c)}${gapAttr} />`);
      if (p.value && p.value.kind === 'bind') {
        const v = ctx.vars.get(p.value.var);
        if (v) ctx.refresh.push(`if (${name}.Text != ${v.accessor}.ToString()) ${name}.Text = ${v.accessor}.ToString();`);
      }
      if (c.events?.onChange) {
        const m = new Code('    ');
        m.line(`private void OnChange${ctx.n}(object sender, TextChangedEventArgs e)`);
        m.line('{');
        m.block(() => {
          m.line(`var value = ((TextBox)sender).Text;`);
          for (const l of printActions(c.events!.onChange!, ctx, 'value')) m.line(l);
        });
        m.line('}');
        ctx.methods.push(m.toString());
      }
      if (c.events?.onSubmit) {
        const m = new Code('    ');
        m.line(`private void OnKey${ctx.n}(object sender, KeyEventArgs e)`);
        m.line('{');
        m.block(() => {
          m.line('if (e.Key != Key.Enter) return;');
          m.line(`var value = ((TextBox)sender).Text;`);
          for (const l of printActions(c.events!.onSubmit!, ctx, 'value')) m.line(l);
        });
        m.line('}');
        ctx.methods.push(m.toString());
      }
      break;
    }
    case 'Switch': {
      const click = c.events?.onChange ? ` Click="OnToggle${ctx.n}"` : '';
      x.line(`<CheckBox x:Name="${name}"${click}${styleAttrs(c)}${gapAttr} />`);
      ctx.refresh.push(`${name}.IsChecked = ${rawExpr(p.value, ctx, 'false')};`);
      if (c.events?.onChange) {
        const m = new Code('    ');
        m.line(`private void OnToggle${ctx.n}(object sender, RoutedEventArgs e)`);
        m.line('{');
        m.block(() => {
          m.line(`var value = ((CheckBox)sender).IsChecked == true;`);
          for (const l of printActions(c.events!.onChange!, ctx, 'value')) m.line(l);
        });
        m.line('}');
        ctx.methods.push(m.toString());
      }
      break;
    }
    case 'Image': {
      const src = p.src && p.src.kind === 'static' ? xmlEsc(String(p.src.value)) : '';
      x.line(`<Image x:Name="${name}" Source="${src}" Stretch="Uniform"${styleAttrs(c)}${gapAttr} />`);
      break;
    }
    case 'Spacer': {
      const w = typeof c.style?.width === 'number' ? c.style.width : 8;
      const h = typeof c.style?.height === 'number' ? c.style.height : 8;
      x.line(`<Border Width="${w}" Height="${h}"${gapAttr} />`);
      break;
    }
    case 'ListView': {
      x.line(`<ItemsControl x:Name="${name}"${styleAttrs(c)}${gapAttr} />`);
      const items = p.items && p.items.kind === 'bind'
        ? (ctx.vars.get(p.items.var)?.accessor ?? `_${camelCase(p.items.var)}`)
        : 'new List<object>()';
      const tpl = c.children && c.children[0];
      const itemExpr = tpl && tpl.type === 'Text' ? toStringExpr(tpl.props?.text, ctx, 'item') : 'item.ToString()';
      ctx.refresh.push(`${name}.ItemsSource = ${items}.Select(item => ${itemExpr}).ToList();`);
      break;
    }
    case 'Container': {
      const s = c.style;
      const bits: string[] = [];
      if (s?.padding !== undefined) bits.push(`Padding="${thickness(s.padding)}"`);
      if (s?.background) bits.push(`Background="${s.background}"`);
      if (s?.radius) bits.push(`CornerRadius="${s.radius}"`);
      if (s?.margin !== undefined) bits.push(`Margin="${thickness(s.margin)}"`);
      x.line(`<Border ${bits.join(' ')}${gapAttr}>`);
      x.block(() => { if (c.children && c.children[0]) emitComponent(c.children[0], ctx, x, parentType); });
      x.line('</Border>');
      break;
    }
    case 'Column': case 'Row': {
      const orient = c.type === 'Row' ? 'Horizontal' : 'Vertical';
      const s = c.style;
      const bits: string[] = [`Orientation="${orient}"`];
      if (s?.margin !== undefined) bits.push(`Margin="${thickness(s.margin)}"`);
      if (s?.background) bits.push(`Background="${s.background}"`);
      if (s?.mainAxis === 'center') bits.push(c.type === 'Row' ? 'HorizontalAlignment="Center"' : 'VerticalAlignment="Center"');
      const pad = s?.padding !== undefined ? `Margin="${thickness(s.padding)}"` : null;
      x.line(`<StackPanel ${bits.join(' ')}${gapAttr}>`);
      x.block(() => {
        if (pad) x.line(`<!-- padding approximated on children -->`);
        const kids = c.children ?? [];
        kids.forEach((k, i) => emitComponent(k, ctx, x, c.type, i > 0 ? s?.gap : undefined));
      });
      x.line('</StackPanel>');
      break;
    }
    case 'Stack': {
      x.line(`<Grid${styleAttrs(c)}${gapAttr}>`);
      x.block(() => { for (const k of c.children ?? []) emitComponent(k, ctx, x, 'Stack'); });
      x.line('</Grid>');
      break;
    }
  }
}

// ---- state + assembly ------------------------------------------------------------

function csType(v: StateVar): string {
  switch (v.type) {
    case 'int': return 'int';
    case 'double': return 'double';
    case 'bool': return 'bool';
    case 'string': return 'string';
    case 'list': return 'List<object>';
  }
}

function csInit(v: StateVar): string {
  switch (v.type) {
    case 'int': return String(Number(v.initialValue) || 0);
    case 'double': { const n = Number(v.initialValue) || 0; return Number.isInteger(n) ? n.toFixed(1) : String(n); }
    case 'bool': return v.initialValue ? 'true' : 'false';
    case 'string': return `"${escapeStr(String(v.initialValue ?? ''))}"`;
    case 'list': {
      const init = (Array.isArray(v.initialValue) ? v.initialValue : []) as unknown[];
      const args = init.map((x) => (typeof x === 'string' ? `"${escapeStr(x)}"` : String(x))).join(', ');
      return `new List<object> { ${args} }`;
    }
  }
}

const NS = 'AelixGenerated';

function emitScreenXaml(screen: Screen, ctx: Ctx): string {
  const cls = classNameOf(screen);
  const x = new Code('    ');
  x.line(`<UserControl x:Class="${NS}.${cls}"`);
  x.line('             xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"');
  x.line('             xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml">');
  x.block(() => {
    x.line('<ScrollViewer VerticalScrollBarVisibility="Auto">');
    x.block(() => {
      x.line('<StackPanel Margin="16">');
      x.block(() => {
        x.line(`<TextBlock Text="${xmlEsc(screen.name)}" FontSize="20" FontWeight="SemiBold" Margin="0,0,0,12" />`);
        emitComponent(screen.root, ctx, x, null);
      });
      x.line('</StackPanel>');
    });
    x.line('</ScrollViewer>');
  });
  x.line('</UserControl>');
  return x.toString();
}

function emitScreenCs(screen: Screen, ctx: Ctx): string {
  const cls = classNameOf(screen);
  const c = new Code('    ');
  c.line('// GENERATED by Aelix Canvas — WPF target.');
  c.line('using System.Collections.Generic;');
  c.line('using System.Linq;');
  c.line('using System.Windows;');
  c.line('using System.Windows.Controls;');
  c.line('using System.Windows.Input;');
  c.line('');
  c.line(`namespace ${NS};`);
  c.line('');
  c.line(`public partial class ${cls} : UserControl`);
  c.line('{');
  c.block(() => {
    for (const s of screen.state) c.line(`private ${csType(s)} _${camelCase(s.name)} = ${csInit(s)};`);
    c.line('');
    c.line(`public ${cls}()`);
    c.line('{');
    c.block(() => {
      c.line('InitializeComponent();');
      c.line('AppState.Changed += Refresh;');
      c.line('Refresh();');
    });
    c.line('}');
    c.line('');
    c.line('public void Refresh()');
    c.line('{');
    c.block(() => { for (const r of ctx.refresh) c.line(r); });
    c.line('}');
    for (const m of ctx.methods) {
      c.line('');
      c.lines_(m);
    }
  });
  c.line('}');
  return c.toString();
}

function emitShared(app: App, classOf: (id: string) => string): EmittedFile[] {
  const appState = new Code('    ');
  appState.line('// GENERATED by Aelix Canvas — WPF target.');
  appState.line('using System;');
  appState.line('using System.Collections.Generic;');
  appState.line('');
  appState.line(`namespace ${NS};`);
  appState.line('');
  appState.line('public static class AppState');
  appState.line('{');
  appState.block(() => {
    for (const g of app.globalState) appState.line(`public static ${csType(g)} ${pascalCase(g.name)} = ${csInit(g)};`);
    appState.line('');
    appState.line('public static event Action? Changed;');
    appState.line('public static void Notify() => Changed?.Invoke();');
  });
  appState.line('}');
  appState.line('');
  appState.line('public static class Nav');
  appState.line('{');
  appState.block(() => {
    appState.line('public static Action<string>? Show_;');
    appState.line('public static void Show(string screen) => Show_?.Invoke(screen);');
  });
  appState.line('}');

  const mainXaml = new Code('    ');
  mainXaml.line(`<Window x:Class="${NS}.MainWindow"`);
  mainXaml.line('        xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"');
  mainXaml.line('        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"');
  mainXaml.line(`        Title="${xmlEsc(app.name)}" Width="440" Height="700">`);
  mainXaml.line('    <ContentControl x:Name="Host" />');
  mainXaml.line('</Window>');

  const mainCs = new Code('    ');
  mainCs.line('// GENERATED by Aelix Canvas — WPF target.');
  mainCs.line('using System.Collections.Generic;');
  mainCs.line('using System.Windows;');
  mainCs.line('using System.Windows.Controls;');
  mainCs.line('');
  mainCs.line(`namespace ${NS};`);
  mainCs.line('');
  mainCs.line('public partial class MainWindow : Window');
  mainCs.line('{');
  mainCs.block(() => {
    mainCs.line('private readonly Dictionary<string, UserControl> _screens = new();');
    mainCs.line('');
    mainCs.line('public MainWindow()');
    mainCs.line('{');
    mainCs.block(() => {
      mainCs.line('InitializeComponent();');
      for (const s of app.screens) mainCs.line(`_screens["${classNameOf(s)}"] = new ${classNameOf(s)}();`);
      mainCs.line('Nav.Show_ = Show;');
      mainCs.line(`Show("${classOf(app.initialScreenId)}");`);
    });
    mainCs.line('}');
    mainCs.line('');
    mainCs.line('private void Show(string name)');
    mainCs.line('{');
    mainCs.block(() => {
      mainCs.line('if (!_screens.TryGetValue(name, out var screen)) return;');
      mainCs.line('Host.Content = screen;');
      mainCs.line(`if (screen is ${NS}.IRefreshable r) r.Refresh();`);
    });
    mainCs.line('}');
  });
  mainCs.line('}');
  mainCs.line('');
  mainCs.line('public interface IRefreshable { void Refresh(); }');

  const appXaml = [
    `<Application x:Class="${NS}.App"`,
    '             xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"',
    '             xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"',
    '             StartupUri="MainWindow.xaml">',
    '    <Application.Resources />',
    '</Application>',
  ].join('\n');

  const appCs = [
    `namespace ${NS};`,
    '',
    'public partial class App : System.Windows.Application { }',
  ].join('\n');

  const csproj = [
    '<Project Sdk="Microsoft.NET.Sdk">',
    '  <PropertyGroup>',
    '    <OutputType>WinExe</OutputType>',
    '    <TargetFramework>net8.0-windows</TargetFramework>',
    '    <UseWPF>true</UseWPF>',
    '    <Nullable>enable</Nullable>',
    '  </PropertyGroup>',
    '</Project>',
  ].join('\n');

  return [
    { path: 'AelixApp.csproj', contents: csproj, language: 'xml' },
    { path: 'App.xaml', contents: appXaml, language: 'xml' },
    { path: 'App.xaml.cs', contents: appCs, language: 'csharp' },
    { path: 'MainWindow.xaml', contents: mainXaml.toString(), language: 'xml' },
    { path: 'MainWindow.xaml.cs', contents: mainCs.toString(), language: 'csharp' },
    { path: 'AppState.cs', contents: appState.toString(), language: 'csharp' },
  ];
}

export const wpfEmitter: Emitter = {
  id: 'wpf',
  label: 'C# WPF (XAML)',
  monacoLanguage: 'csharp',
  emit(app: App): EmittedFile[] {
    const classOf = (() => {
      const m = new Map(app.screens.map((s) => [s.id, classNameOf(s)]));
      return (id: string) => m.get(id) ?? 'HomeScreen';
    })();
    const files: EmittedFile[] = [];
    for (const screen of app.screens) {
      const ctx = makeCtx(app, screen, classOf);
      const xaml = emitScreenXaml(screen, ctx); // fills ctx.refresh/methods
      files.push({ path: `Screens/${classNameOf(screen)}.xaml.cs`, contents: emitScreenCs(screen, ctx), language: 'csharp' });
      files.push({ path: `Screens/${classNameOf(screen)}.xaml`, contents: xaml, language: 'xml' });
    }
    // primary file first: the initial screen's code-behind
    files.push(...emitShared(app, classOf));
    return files;
  },
};
               