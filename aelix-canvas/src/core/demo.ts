/**
 * Canonical demo IR: a 2-screen counter + list + navigation app.
 * Exercises every IR feature so emitters can be validated against one fixture:
 *   - value types: int, bool, string, list
 *   - scopes: global (dark) + screen-local (count, draft, items)
 *   - actions: SetState, Toggle, AppendList, Navigate
 *   - bindings: Switch.value<-dark, TextField via controller, ListView.items<-items
 *   - templates: "Count: ${count}"
 *   - events: onTap, onChange
 *   - components: Container, Column, Row, Text, Button, TextField, Switch,
 *     ListView, Spacer, Image
 *   - navigation graph: Home <-> Details
 */
import type { App, Component, Screen } from './ir';
import { int, str, sval, ref, item, eventValue, bin, tmpl } from './ir';

const homeId = 's_home';
const detailsId = 's_details';

const home: Screen = {
  id: homeId,
  name: 'Home',
  state: [
    { name: 'count', type: 'int', initialValue: 0, scope: 'screen' },
    { name: 'draft', type: 'string', initialValue: '', scope: 'screen' },
    { name: 'items', type: 'list', initialValue: [], scope: 'screen' },
  ],
  root: {
    id: 'c_home_root', type: 'Column',
    style: { gap: 16, padding: 20, crossAxis: 'stretch' },
    children: [
      { id: 'c_title', type: 'Text', style: { fontSize: 24, fontWeight: 'bold', color: '#7C5CFF' },
        props: { text: sval('Aelix Canvas Demo') } },

      // counter row
      { id: 'c_count_row', type: 'Row', style: { gap: 12, mainAxis: 'spaceBetween', crossAxis: 'center' },
        children: [
          { id: 'c_count_text', type: 'Text', style: { fontSize: 18 },
            props: { text: { kind: 'expr', expr: tmpl('Count: ', ref('count')) } } },
          { id: 'c_inc_btn', type: 'Button',
            props: { label: sval('Increment') },
            events: { onTap: [{ kind: 'SetState', target: 'count', expr: bin('+', ref('count'), int(1)) }] } },
        ] },

      // dark mode switch (global state)
      { id: 'c_dark_row', type: 'Row', style: { gap: 12, crossAxis: 'center' },
        children: [
          { id: 'c_dark_switch', type: 'Switch',
            props: { value: { kind: 'bind', var: 'dark' } },
            events: { onChange: [{ kind: 'Toggle', target: 'dark' }] } },
          { id: 'c_dark_label', type: 'Text', props: { text: sval('Dark mode (global)') } },
        ] },

      // add-item row
      { id: 'c_add_row', type: 'Row', style: { gap: 8, crossAxis: 'center' },
        children: [
          { id: 'c_field', type: 'TextField', style: { flex: 1 },
            props: { placeholder: sval('New item'), value: { kind: 'bind', var: 'draft' } },
            events: { onChange: [{ kind: 'SetState', target: 'draft', expr: eventValue() }] } },
          { id: 'c_add_btn', type: 'Button', props: { label: sval('Add') },
            events: { onTap: [
              { kind: 'AppendList', target: 'items', expr: ref('draft') },
              { kind: 'SetState', target: 'draft', expr: str('') },
            ] } },
        ] },

      // the list
      { id: 'c_list', type: 'ListView',
        props: { items: { kind: 'bind', var: 'items' } },
        children: [
          { id: 'c_list_item', type: 'Text', style: { fontSize: 14 },
            props: { text: { kind: 'expr', expr: item() } } },
        ] },

      { id: 'c_spacer', type: 'Spacer', style: { height: 8 } },

      // navigation
      { id: 'c_go_btn', type: 'Button', props: { label: sval('Go to Details') },
        events: { onTap: [{ kind: 'Navigate', screenId: detailsId }] } },
    ],
  } as Component,
};

const details: Screen = {
  id: detailsId,
  name: 'Details',
  state: [],
  root: {
    id: 'c_det_root', type: 'Column',
    style: { gap: 16, padding: 20, crossAxis: 'center' },
    children: [
      { id: 'c_det_img', type: 'Image', style: { width: 120, height: 80, radius: 8 },
        props: { src: sval('https://placehold.co/120x80') } },
      { id: 'c_det_text', type: 'Text', style: { fontSize: 18, fontWeight: 'semibold' },
        props: { text: sval('This is the details screen.') } },
      { id: 'c_det_count', type: 'Text', style: { fontSize: 14 },
        props: { text: { kind: 'expr', expr: tmpl('Dark mode is ', ref('dark')) } } },
      { id: 'c_back_btn', type: 'Button', props: { label: sval('Back to Home') },
        events: { onTap: [{ kind: 'Navigate', screenId: homeId }] } },
    ],
  } as Component,
};

export const demoApp: App = {
  name: 'Counter Demo',
  globalState: [
    { name: 'dark', type: 'bool', initialValue: false, scope: 'global' },
  ],
  screens: [home, details],
  initialScreenId: homeId,
  nav: [
    { from: homeId, to: detailsId, label: 'Go to Details' },
    { from: detailsId, to: homeId, label: 'Back' },
  ],
};
