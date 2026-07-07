/**
 * Emitter contract. Every target language implements exactly this interface and
 * touches nothing else in the codebase. The set of targets is the only place new
 * languages are registered (see ./index.ts).
 *
 * An emitter is a pure function family: IR in, source files out. No filesystem,
 * no side effects — the Rust export layer is responsible for writing files.
 */
import type { App } from '../ir';

export type TargetLang = 'flutter' | 'swiftui' | 'compose' | 'html' | 'tkinter' | 'wpf' | 'swing';

/** One generated source file. `path` is relative to the export root. */
export interface EmittedFile {
  path: string;
  contents: string;
  /** Loose language tag for the Monaco panel's syntax highlighting. */
  language: 'dart' | 'swift' | 'kotlin' | 'html' | 'css' | 'javascript' | 'json' | 'text' | 'xml' | 'yaml' | 'python' | 'csharp' | 'java';
}

export interface Emitter {
  id: TargetLang;
  /** Human label for the language selector. */
  label: string;
  /** Monaco language id for the *primary* file (used by the single-file code panel). */
  monacoLanguage: string;
  /**
   * Compile an entire app IR into a runnable set of files.
   * The first file in the array is treated as the "primary" file shown in the
   * live code panel.
   */
  emit(app: App): EmittedFile[];
}
