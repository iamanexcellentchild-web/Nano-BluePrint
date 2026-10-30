import { useStore } from '../store';
import type { ConfigField } from '../types';

type FieldRow = {
  name: string;
  type: string;
  required: boolean;
  target?: string;
  on_delete?: string;
};

export function Inspector() {
  const { library, nodes, selectedId, updateNode, removeNode } = useStore();
  const node = nodes.find((n) => n.id === selectedId);
  const def = node && library?.blocks.find((b) => b.type === node.data.blockType);
  if (!node || !def || !library) return <p className="hint">Select a block to edit it.</p>;

  const cfg = node.data.config;
  const set = (key: string, value: unknown) => updateNode(node.id, { config: { ...cfg, [key]: value } });

  const renderField = (f: ConfigField) => {
    const v = cfg[f.key];
    switch (f.kind) {
      case 'textarea':
        return <textarea value={(v as string) ?? ''} rows={3} onChange={(e) => set(f.key, e.target.value)} />;
      case 'select':
        return (
          <select value={(v as string) ?? ''} onChange={(e) => set(f.key, e.target.value)}>
            {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        );
      case 'tags':
        return <input value={((v as string[]) ?? []).join(', ')}
                      onChange={(e) => set(f.key, e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} />;
      case 'fields': {
        const rows = (v as FieldRow[]) ?? [];
        const patch = (i: number, p: Partial<FieldRow>) => set(f.key, rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
        return (
          <div className="fields">
            {rows.map((r, i) => (
              <div className="fields__row" key={i}>
                <input value={r.name} placeholder="field name" onChange={(e) => patch(i, { name: e.target.value })} />
                <select value={r.type} onChange={(e) => patch(i, {
                  type: e.target.value,
                  required: e.target.value === 'many_to_many' || e.target.value === 'foreign_key' ? false : r.required,
                  target: undefined,
                  on_delete: e.target.value === 'foreign_key' ? 'cascade' : undefined,
                })}>
                  {[...library.field_types, ...library.relation_types].map((t) => <option key={t}>{t}</option>)}
                </select>
                {library.relation_types.includes(r.type) && (
                  <select value={r.target ?? ''} aria-label={`Related table for ${r.name || 'field'}`}
                          onChange={(e) => patch(i, { target: e.target.value })}>
                    <option value="">Select table</option>
                    {nodes.filter((candidate) => candidate.data.blockType === 'entity' && candidate.id !== node.id)
                      .map((candidate) => {
                        const name = String(candidate.data.config.name ?? '');
                        return <option key={candidate.id} value={name}>{name || candidate.data.label}</option>;
                      })}
                  </select>
                )}
                {r.type === 'foreign_key' && (
                  <select value={r.on_delete ?? 'cascade'} aria-label={`Delete behavior for ${r.name || 'field'}`}
                          onChange={(e) => patch(i, {
                            on_delete: e.target.value,
                            ...(e.target.value === 'set_null' ? { required: false } : {}),
                          })}>
                    {library.delete_behaviors.map((behavior) => <option key={behavior}>{behavior}</option>)}
                  </select>
                )}
                {r.type !== 'many_to_many' && (
                  <label title="Required"><input type="checkbox" checked={!!r.required} onChange={(e) => patch(i, { required: e.target.checked })} />req</label>
                )}
                <button className="icon" title="Remove field" onClick={() => set(f.key, rows.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
            <button className="link" onClick={() => set(f.key, [...rows, { name: '', type: 'string', required: false }])}>+ add field</button>
          </div>
        );
      }
      default:
        return <input value={(v as string) ?? ''} onChange={(e) => set(f.key, e.target.value)} />;
    }
  };

  return (
    <div className="inspector">
      <h3>{def.label}</h3>
      <p className="hint">{def.description}</p>
      <label>Label on canvas<input value={node.data.label} onChange={(e) => updateNode(node.id, { label: e.target.value })} /></label>
      {def.config_fields.map((f) => (
        <label key={f.key}>{f.label}{f.required && ' *'}{renderField(f)}</label>
      ))}
      <button className="danger" onClick={() => removeNode(node.id)}>Delete block</button>
    </div>
  );
}
