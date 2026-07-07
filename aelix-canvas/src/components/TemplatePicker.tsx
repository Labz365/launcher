/** Template picker overlay — pick a starter wireframe to begin from. Selecting
 * one loads a fresh App IR into the editor. */
import { useUI } from '../state/ui';
import { editorStore } from '../state/store';
import { TEMPLATES } from '../core/templates';

export function TemplatePicker() {
  const open = useUI((s) => s.templatePickerOpen);
  const close = useUI((s) => s.closeTemplatePicker);
  const setMode = useUI((s) => s.setCanvasMode);
  if (!open) return null;

  const pick = (build: () => ReturnType<(typeof TEMPLATES)[number]['build']>) => {
    editorStore.getState().loadApp(build());
    setMode('design');
    close();
  };

  return (
    <div className="tp-overlay" onClick={close}>
      <div className="tp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tp-head">
          <div>
            <div className="tp-title">Start a new design</div>
            <div className="tp-sub">Pick a wireframe to begin — you can change everything after.</div>
          </div>
          <button className="tp-x" onClick={close} aria-label="Close">✕</button>
        </div>
        <div className="tp-grid">
          {TEMPLATES.map((t) => (
            <button key={t.id} className="tp-card" onClick={() => pick(t.build)}>
              <span className="tp-glyph">{t.glyph}</span>
              <span className="tp-name">{t.name}</span>
              <span className="tp-blurb">{t.blurb}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
