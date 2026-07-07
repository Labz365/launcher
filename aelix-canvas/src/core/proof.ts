/**
 * P1 proof harness — no UI, no Tauri.
 * Emits the demo IR to Flutter, prints the Dart, and runs structural assertions
 * (balanced delimiters + presence of every mapped construct). Exit code != 0 on
 * failure so CI / `npm run proof` is meaningful.
 *
 *   npx tsx src/core/proof.ts
 */
import { demoApp } from './demo';
import { emit } from './emitters/index';

function balanced(src: string): { ok: boolean; detail: string } {
  // crude but useful: ignores string contents
  const stack: string[] = [];
  const open: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  let inStr: string | null = null;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      if (ch === '\\') { i++; continue; }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'") { inStr = ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') stack.push(ch);
    else if (ch === ')' || ch === ']' || ch === '}') {
      if (stack.pop() !== open[ch]) return { ok: false, detail: `unbalanced near index ${i} ('${ch}')` };
    }
  }
  return { ok: stack.length === 0, detail: stack.length ? `unclosed: ${stack.join('')}` : 'ok' };
}

const files = emit(demoApp, 'flutter');
const main = files.find((f) => f.path.endsWith('main.dart'))!;

console.log('═'.repeat(70));
console.log('AELIX CANVAS — P1 PROOF :: Flutter emit of demo IR');
console.log('═'.repeat(70));
console.log(main.contents);
console.log('═'.repeat(70));

const checks: Array<[string, boolean]> = [
  ['emits lib/main.dart', files.some((f) => f.path === 'lib/main.dart')],
  ['emits pubspec.yaml', files.some((f) => f.path === 'pubspec.yaml')],
  ['MaterialApp with routes', /MaterialApp\(/.test(main.contents) && /routes:/.test(main.contents)],
  ['HomeScreen StatefulWidget', /class HomeScreen extends StatefulWidget/.test(main.contents)],
  ['DetailsScreen StatefulWidget', /class DetailsScreen extends StatefulWidget/.test(main.contents)],
  ['screen-local int count', /int count = 0;/.test(main.contents)],
  ['screen-local string draft', /String draft = "";/.test(main.contents)],
  ['screen-local list items', /List<dynamic> items = \[\];/.test(main.contents)],
  ['global ChangeNotifier appState', /class _AppState extends ChangeNotifier/.test(main.contents) && /final appState = _AppState\(\);/.test(main.contents)],
  ['global bool dark', /bool dark = false;/.test(main.contents)],
  ['SetState via setState()', /setState\(\(\) => count = \(count \+ 1\)\);/.test(main.contents)],
  ['Toggle global via appState.update', /appState\.update\(\(\) => appState\.dark = !appState\.dark\);/.test(main.contents)],
  ['AppendList', /setState\(\(\) => items\.add\(draft\)\);/.test(main.contents)],
  ['Navigate pushNamed', /Navigator\.pushNamed\(context, "\/details"\);/.test(main.contents)],
  ['template interpolation', /Text\("Count: \$\{count\}"/.test(main.contents)],
  ['Switch bound to global', /Switch\(value: appState\.dark/.test(main.contents)],
  ['ListView for-in items', /for \(final item in items\)/.test(main.contents)],
  ['TextField onChanged', /onChanged: \(value\) \{ setState\(\(\) => draft = value\);/.test(main.contents)],
  ['balanced delimiters (main.dart)', balanced(main.contents).ok],
];

// ---- all-target sweep: every emitter must produce non-trivial, balanced output.
import { TARGET_ORDER } from './emitters/index';

const MUST_CONTAIN: Record<string, RegExp[]> = {
  flutter: [/MaterialApp\(/],
  html: [/<!DOCTYPE html>/, /addEventListener/, /function updateAll\(\)/],
  swiftui: [/struct AelixApp: App/, /NavigationStack/, /@State /],
  compose: [/class MainActivity/, /NavHost\(/, /mutableStateOf/],
  tkinter: [/import tkinter as tk/, /class App\(tk\.Tk\)/, /def refresh\(self\)/],
  wpf: [/<UserControl /, /public static class AppState/, /InitializeComponent\(\);/],
  swing: [/public class Main/, /CardLayout/, /void refresh\(\)/],
};

for (const target of TARGET_ORDER) {
  const out = emit(demoApp, target);
  const primary = out[0];
  checks.push([`[${target}] emits ${out.length} file(s), primary non-trivial`, out.length > 0 && primary.contents.length > 200]);
  // Balanced-delimiter check only for brace/paren languages (skip raw HTML/XML files).
  for (const f of out) {
    if (f.language === 'html' || f.language === 'xml' || f.language === 'yaml' || f.language === 'text') continue;
    checks.push([`[${target}] balanced delimiters: ${f.path}`, balanced(f.contents).ok]);
  }
  for (const re of MUST_CONTAIN[target] ?? []) {
    checks.push([`[${target}] matches ${re}`, out.some((f) => re.test(f.contents))]);
  }
}

let failed = 0;
console.log('\nCHECKS');
for (const [name, ok] of checks) {
  console.log(`  ${ok ? '✓' : '✗'} ${name}`);
  if (!ok) failed++;
}
console.log('─'.repeat(70));
if (failed) {
  console.log(`FAIL — ${failed}/${checks.length} checks failed.`);
  process.exit(1);
} else {
  console.log(`PASS — all ${checks.length} checks passed. Balanced: ${balanced(main.contents).detail}`);
}
