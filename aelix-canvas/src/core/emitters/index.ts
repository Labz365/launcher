/**
 * Emitter registry. THE ONLY place targets are registered.
 *
 * To add a new language: implement `Emitter` in a new file, import it here, and
 * add it to `EMITTERS`. Nothing else in the app needs to change.
 */
import type { App } from '../ir';
import type { Emitter, EmittedFile, TargetLang } from './types';
import { flutterEmitter } from './flutter';
import { swiftuiEmitter } from './swiftui';
import { composeEmitter } from './compose';
import { htmlEmitter } from './html';
import { tkinterEmitter } from './tkinter';
import { wpfEmitter } from './wpf';
import { swingEmitter } from './swing';

export const EMITTERS: Record<TargetLang, Emitter> = {
  flutter: flutterEmitter,
  swiftui: swiftuiEmitter,
  compose: composeEmitter,
  html: htmlEmitter,
  tkinter: tkinterEmitter,
  wpf: wpfEmitter,
  swing: swingEmitter,
};

export const TARGET_ORDER: TargetLang[] = ['flutter', 'html', 'swiftui', 'compose', 'tkinter', 'wpf', 'swing'];

export function getEmitter(target: TargetLang): Emitter {
  return EMITTERS[targe