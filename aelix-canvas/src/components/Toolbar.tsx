/** Top bar: brand, screen tabs, canvas-mode toggle, target selector. */
import { useEditor, editorStore } from '../state/store';
import { useUI } from '../state/ui';
import { TARGET_ORDER, getEmitter } from '../core/emitters/index';
import type { TargetLang } from '../core/emitters/types';

// All targets are live.

export function Toolbar() {
  const app = useEditor((s) => s.app);
  const currentScreenId = useEditor((s) => s.currentScreenId);
  const target = useEditor((s) => s.target);
  const canvasMode = useUI((s) => s.canvasMode);
  const setCanvasMode = useUI((s) => s.setCanvasMode);
  const showCode = useUI((s) => s.showCode);
  const toggleCode = useUI((s) => s.toggleCode);
  const openTemplates = useUI((s) => s.openTemplatePicker);

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-dot" />
        Aelix <b>Canvas</b>
      </div>

      <button className="seg-btn solo new-btn" onClick={openTemplates} title="Start from a template">＋ New</button>

      <div className="screen-tabs">
        {app.screens.map((s) => (
          <button
            key={s.id}
            className={`screen-tab ${s.id === currentScreenId ? 'on' : ''}`}
            onClick={() => editorStore.getState().setCurrentScreen(s.id)}
          >
            {s.name}{app.initialScreenId === s.id ? ' ★' : ''}
          </button>
        ))}
      </div>

      <span className="topbar-spacer" />

      <div className="seg">
        <button className={`seg-btn ${canvasMode === 'design' ? 'on' : ''}`} onClick={() => setCanvasMode('design')}>Design</button>
        <button className={`seg-btn ${canvasMode === 'blocks' ? 'on' : ''}`} onClick={() => setCanvasMode('blocks')}>Blocks</button>
        <button className={`seg-btn ${canvasMode === 'preview' ? 'on' : ''}`} onClick={() => setCanvasMode('preview')}>Preview</button>
      </div>

      <select
        className="target-select"
        value={target}
        title="Target language"
        onChange={(e) => editorStore.getState().setTarget(e.target.value as TargetLang)}
      >
        {TARGET_ORDER.map((t) => (
          <option key={t} value={t}>{getEmitter(t).label}</option>
        ))}
      </select>

      <button className={`seg-btn solo ${showCode ? 'on' : ''}`} onClick={toggleCode} title="Toggle code panel">{'</>'}</button>
    </header>
  );
}
