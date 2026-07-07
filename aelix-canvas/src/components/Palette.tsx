/** Component palette — grouped, draggable source items (dnd-kit). */
import { useDraggable } from '@dnd-kit/core';
import { PALETTE, GROUP_ORDER, GROUP_HUE, GROUP_LABEL, type PaletteItem, type PaletteGroup } from '../catalog';

function PaletteCard({ item }: { item: PaletteItem }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette:${item.type}`,
    data: { source: 'palette', type: item.type },
  });
  return (
    <button
      ref={setNodeRef}
      className="pal-card"
      style={{ opacity: isDragging ? 0.4 : 1, borderColor: GROUP_HUE[item.group] + '55' }}
      {...listeners}
      {...attributes}
      title={item.hint}
    >
      <span className="pal-glyph" style={{ color: GROUP_HUE[item.group] }}>{item.glyph}</span>
      <span className="pal-label">{item.label}</span>
    </button>
  );
}

export function Palette() {
  return (
    <aside className="rail">
      <div className="rail-title">Drag onto the canvas</div>
      {GROUP_ORDER.map((group: PaletteGroup) => {
        const items = PALETTE.filter((p) => p.group === group);
        return (
          <div key={group} className="pal-group">
            <div className="pal-group-h" style={{ color: GROUP_HUE[group] }}>{GROUP_LABEL[group]}</div>
            {items.length ? (
              <div className="pal-grid">
                {items.map((it) => <PaletteCard key={it.type} item={it} />)}
              </div>
            ) : (
              <div className="pal-empty">Declare state &amp; wire events in the State panel</div>
            )}
          </div>
        );
      })}
    </aside>
  );
}
