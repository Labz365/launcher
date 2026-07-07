/**
 * Live code panel. Recompiles the IR to the selected target on every store
 * mutation and shows the emitted files in Monaco.
 *
 * The code is EDITABLE: manual edits are kept as per-file overrides layered on
 * top of the generated output. The IR remains the source of truth — an edited
 * file stops tracking the designer until you press "Regenerate", which discards
 * the manual edit and resumes live generation for that file.
 */
import { useMemo, useState } from 'react';
import Editor from '@monaco-editor/react';
import { useEditor } from '../state/store';
import { useUI, overrideKey } from '../state/ui';
import { emit } from '../core/emitters/index';
import type { EmittedFile } from '../core/emitters/types';
import { exportProject } from '../core/export';
import { makeZip } from '../core/zip';

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function CodePanel() {
  const app = useEditor((s) => s.app);
  const target = useEditor((s) => s.target);
  const overrides = useUI((s) => s.codeOverrides);
  const setOverride = useUI((s) => s.setCodeOverride);
  const clearOverride = useUI((s) => s.clearCodeOverride);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const files: EmittedFile[] = useMemo(() => {
    try {
      return emit(app, target);
    } catch (e) {
      return [{ path: 'error.txt', contents: String(e), language: 'text' }];
    }
  }, [app, target]);

  const active = files.find((f) => f.path === activePath) ?? files[0];
  const key = active ? overrideKey(target, active.path) : '';
  const override = key ? overrides[key] : undefined;
  const shown = override ?? active?.contents ?? '';

  const onEdit = (value: string | undefined) => {
    if (!active || value === undefined) return;
    if (value === active.contents) {
      // Edited back to exactly the generated output — drop the override.
      if (override !== undefined) clearOverride(key);
      return;
    }
    setOverride(key, value);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* clipboard unavailable */ }
  };

  /** Zip a complete buildable project (emitted files + README/build scaffolding),
   * honoring any manual edits. */
  const exportZip = () => {
    const project = exportProject(app, target).map((f) => ({
      path: f.path,
      contents: overrides[overrideKey(target, f.path)] ?? f.contents,
    }));
    const name = (app.name || 'aelix-app').replace(/[^a-zA-Z0-9-_]+/g, '-');
    download(`${name}-${target}.zip`, new Blob([makeZip(project) as BlobPart], { type: 'application/zip' }));
  };

  return (
    <section className="code">
      <div className="code-tabs">
        {files.map((f) => {
          const edited = overrides[overrideKey(target, f.path)] !== undefined;
          return (
            <button
              key={f.path}
              className={`code-tab ${active?.path === f.path ? 'on' : ''}`}
              title={f.path + (edited ? ' (manually edited)' : '')}
              onClick={() => setActivePath(f.path)}
            >
              {f.path.split('/').pop()}{edited ? ' •' : ''}
            </button>
          );
        })}
        <span className="code-spacer" />
        <button className="code-act" onClick={copy} title="Copy current file">{copied ? 'copied ✓' : 'copy'}</button>
        <button className="code-act" onClick={exportZip} title="Download a complete buildable project (.zip) with build instructions">export project</button>
        <span className="code-lang">{active?.language}</span>
      </div>

      {override !== undefined && (
        <div className="code-banner">
          <b>Edited by hand</b> — this file no longer tracks the designer.
          <span className="code-banner-spacer" />
          <button className="code-act" onClick={() => clearOverride(key)} title="Discard manual edits and resume live generation">
            ⟲ Regenerate
          </button>
        </div>
      )}

      <div className="code-editor">
        <Editor
          height="100%"
          theme="vs-dark"
          path={`${target}/${active?.path ?? 'empty'}`}
          language={active?.language}
          value={shown}
          onChange={onEdit}
          options={{
            readOnly: false,
            minimap: { enabled: false },
            fontSize: 12,
            fontFamily: 'var(--font-mono)',
            scrollBeyondLastLine: false,
            renderWhitespace: 'none',
            wordWrap: 'off',
            automaticLayout: true,
          }}
        />
      </div>
    </section>
  );
}
