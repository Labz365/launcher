/** Canvas host — switches between the WYSIWYG design view, the block tree, and
 * the live HTML preview. */
import { BlockTree } from './BlockTree';
import { DesignCanvas } from './DesignCanvas';
import { Preview } from './Preview';
import { useUI } from '../state/ui';

export function Canvas() {
  const mode = useUI((s) => s.canvasMode);
  if (mode === 'preview') return <Preview />;
  if (mode === 'blocks') return <BlockTree />;
  return <DesignCanvas />;
}
