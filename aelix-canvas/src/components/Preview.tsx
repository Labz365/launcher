/**
 * Live preview. Compiles the IR to the HTML target on every change and renders
 * the result inside a sandboxed iframe, so the design runs for real — buttons
 * click, state updates, navigation works — exactly as the exported HTML would.
 *
 * The HTML emitter always boots at the app's initial screen; we inject a tiny
 * trailing script so the preview shows whichever screen you're currently editing.
 */
import { useMemo } from 'react';
import { useEditor } from '../state/store';
import { emit } from '../core/emitters/index';
import { camelCase } from '../core/emitters/util';

export function Preview() {
  const app = useEditor((s) => s.app);
  const currentScreenId = useEditor((s) => s.currentScreenId);

  const srcDoc = useMemo(() => {
    let html: string;
    try {
      const files = emit(app, 'html');
      html = files.find((f) => f.path === 'index.html')?.contents ?? '<!doctype html><body></body>';
    } catch (e) {
      return `<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;padding:24px;color:#c0392b">
        <b>Preview error</b><pre style="white-space:pre-wrap">${String(e)}</pre></body>`;
    }
    const screen = app.screens.find((s) => s.id === currentScreenId);
    if (screen) {
      const key = camelCase(screen.name);
      html = html.replace(
        '</body>',
        `<script>try{show(${JSON.stringify(key)})}catch(e){}</script></body>`,
      );
    }
    return html;
  }, [app, currentScreenId]);

  const screen = app.screens.find((s) => s.id === currentScreenId);

  return (
    <div className="canvas-scroll preview-host">
      <div className="device" role="group" aria-label="App preview">
        <div className="device-bar">
          <span className="device-dot" /><span className="device-dot" /><span className="device-dot" />
          <span className="device-title">{screen?.name ?? app.name}</span>
        </div>
        <iframe
          className="device-screen"
          title="Live preview"
          sandbox="allow-scripts"
          srcDoc={srcDoc}
        />
      </div>
      <div className="preview-hint">Live · interactive · updates as you build</div>
    </div>
  );
}
