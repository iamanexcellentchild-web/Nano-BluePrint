import { useStore } from '../store';

export function IssuesPanel() {
  const issues = useStore((s) => s.issues);
  const nodes = useStore((s) => s.nodes);
  const select = useStore((s) => s.select);
  if (!issues.length) return <p className="hint">No problems found. The logic is complete enough to generate.</p>;
  const order = { error: 0, warning: 1, info: 2 } as const;
  const sorted = [...issues].sort((a, b) => order[a.level] - order[b.level]);
  return (
    <ul className="issues">
      {sorted.map((i, k) => {
        const target = i.node_id && nodes.find((n) => n.id === i.node_id);
        return (
          <li key={k} className={`issue issue--${i.level}`}>
            <button disabled={!target} onClick={() => i.node_id && select(i.node_id)}>
              <strong>{i.level}</strong> {i.message}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
