/** Tabbed right sidebar: Inspector | State | Navigation. */
import { useState } from 'react';
import { Inspector } from './Inspector';
import { StatePanel } from './StatePanel';
import { NavPanel } from './NavPanel';

type Tab = 'inspector' | 'state' | 'nav';

export function RightPanel() {
  const [tab, setTab] = useState<Tab>('inspector');
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'inspector', label: 'Inspector' },
    { id: 'state', label: 'State' },
    { id: 'nav', label: 'Navigation' },
  ];
  return (
    <aside className="rpanel">
      <div className="rpanel-tabs">
        {tabs.map((t) => (
          <button key={t.id} className={`rtab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>
      <div className="rpanel-body">
        {tab === 'inspector' && <Inspector />}
        {tab === 'state' && <StatePanel />}
        {tab === 'nav' && <NavPanel />}
      </div>
    </aside>
  );
}
