import type { CSSProperties } from 'react';
import { useStore } from '../store';

export function Palette() {
  const library = useStore((s) => s.library);
  const addBlock = useStore((s) => s.addBlock);
  if (!library) return <aside className="palette">Loading…</aside>;
  return (
    <aside className="palette">
      <h2>Blocks</h2>
      <p className="hint">Drag onto the canvas, or click to add.</p>
      {Object.entries(library.categories).map(([cat, meta]) => (
        <section key={cat}>
          <h3 style={{ color: meta.color }}>{meta.label}</h3>
          {library.blocks.filter((b) => b.category === cat).map((b) => (
            <button key={b.type} className="palette__item" style={{ '--accent': meta.color } as CSSProperties}
                    draggable title={b.description}
                    onDragStart={(e) => { e.dataTransfer.setData('application/blueprint-block', b.type); e.dataTransfer.effectAllowed = 'move'; }}
                    onClick={() => addBlock(b.type)}>
              {b.label}
            </button>
          ))}
        </section>
      ))}
    </aside>
  );
}
