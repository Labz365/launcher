/** Canvas host — switches between block-tree (P2) and rendered preview (P4). */
import { BlockTree } from './BlockTree';
import { useUI } from '../state/ui';

export function Canvas() {
  const mode = useUI((s) => s.canvasMode);
  if (mode === 'preview') {
    return (
      <div className="canvas-scroll">
        <div className="preview-placeholder">
          <div className="pp-emoji">▦</div>
          <div>Rendered preview mode arrives in <b>P4</b>.</div>
          <div className="pp-sub">For now, use <b>Blocks</b> to compose the tree.</div>
        </div>
      </div>
    );
  }
  return <BlockTree />;
}
