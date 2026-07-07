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
   