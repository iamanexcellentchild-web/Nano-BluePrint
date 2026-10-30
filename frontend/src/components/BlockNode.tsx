import type { CSSProperties } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store';
import type { BlockDef, BlockNodeT, Library } from '../types';

function summary(def: BlockDef, config: Record<string, unknown>): string {
  if (def.type === 'entity') return `${((config.fields as unknown[]) ?? []).length} fields`;
  if (def.type === 'actor') return ((config.permissions as string[]) ?? []).join(', ');
  return def.config_fields
    .filter((f) => ['text', 'textarea', 'select'].includes(f.kind))
    .map((f) => config[f.key])
    .filter((v) => typeof v === 'string' && v)
    .slice(0, 3)
    .join(' · ');
}

export const colorFor = (lib: Library | null, category: string) => lib?.categories[category]?.color ?? '#666';

export function BlockNode({ id, data, selected }: NodeProps<BlockNodeT>) {
  const library = useStore((s) => s.library);
  const issues = useStore(useShallow((s) => s.issues.filter((i) => i.node_id === id)));
  const step = useStore((s) => s.trace[id]);
  const def = library?.blocks.find((b) => b.type === data.blockType);
  if (!def) return <div className="block block--unknown">Unknown block: {data.blockType}</div>;

  const worst = issues.some((i) => i.level === 'error') ? 'error' : issues.some((i) => i.level === 'warning') ? 'warning' : issues.length ? 'info' : null;
  const branching = def.outputs.length > 1;
  return (
    <div className={`block${selected ? ' block--selected' : ''}${step ? ' block--traced' : ''}`}
         style={{ '--accent': colorFor(library, def.category) } as CSSProperties}>
      {def.inputs && <Handle type="target" position={Position.Left} />}
      <div className="block__kind">{def.label}</div>
      <div className="block__title">{data.label || def.label}</div>
      <div className="block__summary">{summary(def, data.config)}</div>
      {worst && <span className={`badge badge--${worst}`} title={issues.map((i) => i.message).join('\n')}>{issues.length}</span>}
      {step && <span className="badge badge--step" title="Order this block ran in the simulation">{step}</span>}
      {branching ? (
        def.outputs.map((o, i) => (
          <Handle key={o} id={o} type="source" position={Position.Right} style={{ top: `${35 + i * 35}%` }}>
            <span className="handle-label">{o === 'true' ? 'yes' : 'no'}</span>
          </Handle>
        ))
      ) : (
        <Handle type="source" position={Position.Right} />
      )}
    </div>
  );
}
