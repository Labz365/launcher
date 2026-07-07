/**
 * Starter templates — ready-made wireframes so a new project isn't a blank page.
 * Each returns a fresh App IR (unique ids per call) built only from the standard
 * component set, so every emitter can compile them and the design canvas can
 * render them immediately.
 */
import type { App, Component, Screen, Style } from './ir';
import { newId, sval, bind, ref, item, eventValue, bin, int, str, tmpl } from './ir';

// ---- tiny builders ------------------------------------------------------------

const node = (type: Component['type'], extra: Partial<Component> = {}): Component => ({ id: newId('c'), type, ...extra });

const text = (t: string, style?: Style): Component => node('Text', { style, props: { text: sval(t) } });
const button = (label: string, style?: Style): Component => node('Button', { style, props: { label: sval(label) } });
const field = (placeholder: string, style?: Style): Component =>
  node('TextField', { style: { width: 'fill', ...style }, props: { placeholder: sval(placeholder) } });
const image = (src: string, style?: Style): Component => node('Image', { style, props: { src: sval(src) } });
const spacer = (px: number): Component => node('Spacer', { style: { height: px } });
const col = (children: Component[], style?: Style): Component => node('Column', { style: { gap: 12, ...style }, children });
const row = (children: Component[], style?: Style): Component => node('Row', { style: { gap: 12, crossAxis: 'center', ...style }, children });
const container = (children: Component[], style?: Style): Component => node('Container', { style, children });

function screen(name: string, root: Component, state: Screen['state'] = []): Screen {
  return { id: newId('s'), name, state, root };
}

function appOf(name: string, screens: Screen[]): App {
  return { name, globalState: [], screens, initialScreenId: screens[0].id, nav: [] };
}

const ROOT: Style = { gap: 16, padding: 20, crossAxis: 'stretch' };
const TITLE: Style = { fontSize: 24, fontWeight: 'bold' };
const SUB: Style = { fontSize: 14, color: '#8a8a8f' };
const CARD: Style = { padding: 16, radius: 12, background: '#ffffff' };

// ---- templates ----------------------------------------------------------------

export interface TemplateDef {
  id: string;
  name: string;
  blurb: string;
  glyph: string;
  build(): App;
}

function blank(): App {
  return appOf('Untitled', [screen('Home', col([], ROOT))]);
}

function login(): App {
  const root = col([
    spacer(24),
    text('Welcome back', { ...TITLE, crossAxis: 'center' }),
    text('Sign in to continue', SUB),
    spacer(8),
    field('Email'),
    field('Password'),
    button('Sign in', { width: 'fill' }),
    row([text('Forgot password?', { fontSize: 13, color: '#7C5CFF' })], { mainAxis: 'center' }),
  ], ROOT);
  return appOf('Login', [screen('Login', root)]);
}

function form(): App {
  const root = col([
    text('Create account', TITLE),
    text('It only takes a minute', SUB),
    spacer(8),
    field('Full name'),
    field('Email'),
    field('Password'),
    row([node('Switch', { props: { value: sval(false) } }), text('I agree to the terms', { fontSize: 13 })],
      { gap: 8, crossAxis: 'center' }),
    button('Create account', { width: 'fill' }),
  ], ROOT);
  return appOf('Sign up', [screen('Sign up', root)]);
}

function list(): App {
  const root = col([
    text('My Tasks', TITLE),
    row([
      field('Add a task…', { flex: 1 }),
      button('Add', { /* wired: append draft to items */ }),
    ], { gap: 8, crossAxis: 'center' }),
    node('ListView', {
      props: { items: bind('items') },
      children: [text('', { fontSize: 15 })].map((t) => ({ ...t, props: { text: { kind: 'expr', expr: item() } } })),
    }),
  ], ROOT);
  const s = screen('Tasks', root, [
    { name: 'draft', type: 'string', initialValue: '', scope: 'screen' },
    { name: 'items', type: 'list', initialValue: ['Buy milk', 'Ship build', 'Call Ellis'], scope: 'screen' },
  ]);
  // wire the input + button so the template is live in preview
  const [addRow] = [root.children![1]];
  const inputEl = addRow.children![0];
  const addBtn = addRow.children![1];
  inputEl.events = { onChange: [{ kind: 'SetState', target: 'draft', expr: eventValue() }] };
  inputEl.props = { ...inputEl.props, value: bind('draft') };
  addBtn.events = { onTap: [
    { kind: 'AppendList', target: 'items', expr: ref('draft') },
    { kind: 'SetState', target: 'draft', expr: str('') },
  ] };
  return appOf('Task list', [s]);
}

function dashboard(): App {
  const stat = (label: string, value: string) => container([
    text(value, { fontSize: 22, fontWeight: 'bold' }),
    text(label, SUB),
  ], { ...CARD, flex: 1 });
  const root = col([
    row([text('Dashboard', TITLE), text('Today', SUB)],
      { mainAxis: 'spaceBetween', crossAxis: 'center' }),
    row([stat('Revenue', '$12.4k'), stat('Users', '1,208')], { gap: 12 }),
    row([stat('Orders', '324'), stat('Refunds', '12')], { gap: 12 }),
    container([
      text('Recent activity', { fontSize: 15, fontWeight: 'semibold' }),
      node('ListView', {
        props: { items: bind('activity') },
        children: [{ ...text(''), props: { text: { kind: 'expr', expr: item() } } }],
      }),
    ], { ...CARD }),
  ], ROOT);
  const s = screen('Dashboard', root, [
    { name: 'activity', type: 'list', initialValue: ['Order #1024 shipped', 'New signup: Ada', 'Refund processed'], scope: 'screen' },
  ]);
  return appOf('Dashboard', [s]);
}

function profile(): App {
  const root = col([
    col([
      image('https://placehold.co/96x96', { width: 96, height: 96, radius: 48 }),
      text('Ayo O.', { fontSize: 20, fontWeight: 'bold' }),
      text('Building Aelix', SUB),
    ], { gap: 8, crossAxis: 'center' }),
    spacer(8),
    row([button('Follow', { flex: 1 }), button('Message', { flex: 1 })], { gap: 12 }),
    container([
      row([text('Posts', { fontWeight: 'semibold' }), text('128', { flex: 1, crossAxis: 'end' })], { mainAxis: 'spaceBetween' }),
      row([text('Followers', { fontWeight: 'semibold' }), text('4.2k', { flex: 1, crossAxis: 'end' })], { mainAxis: 'spaceBetween' }),
      row([text('Following', { fontWeight: 'semibold' }), text('310', { flex: 1, crossAxis: 'end' })], { mainAxis: 'spaceBetween' }),
    ], { ...CARD, gap: 10 }),
  ], ROOT);
  return appOf('Profile', [screen('Profile', root)]);
}

function counter(): App {
  const root = col([
    text('Counter', TITLE),
    text('Count: 0', { fontSize: 18 }),
    button('Increment'),
  ], { ...ROOT, crossAxis: 'center' });
  const s = screen('Home', root, [{ name: 'count', type: 'int', initialValue: 0, scope: 'screen' }]);
  const countText = root.children![1];
  const incBtn = root.children![2];
  countText.props = { text: { kind: 'expr', expr: tmpl('Count: ', ref('count')) } };
  incBtn.events = { onTap: [{ kind: 'SetState', target: 'count', expr: bin('+', ref('count'), int(1)) }] };
  return appOf('Counter', [s]);
}

export const TEMPLATES: TemplateDef[] = [
  { id: 'blank', name: 'Blank', blurb: 'Start from an empty screen', glyph: '▢', build: blank },
  { id: 'login', name: 'Login', blurb: 'Email + password sign-in', glyph: '⌸', build: login },
  { id: 'form', name: 'Sign-up form', blurb: 'Fields, toggle, submit', glyph: '⌶', build: form },
  { id: 'list', name: 'Task list', blurb: 'Add-and-list, fully wired', glyph: '☰', build: list },
  { id: 'dashboard', name: 'Dashboard', blurb: 'Stat cards + activity feed', glyph: '▦', build: dashboard },
  { id: 'profile', name: 'Profile', blurb: 'Avatar, actions, stats', glyph: '◉', build: profile },
  { id: 'counter', name: 'Counter', blurb: 'Classic stateful demo', glyph: '＋', build: counter },
];
