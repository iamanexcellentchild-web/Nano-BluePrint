import type { Diagram } from './types';

/**
 * Compute a human-readable change summary between two diagrams.
 * Used to preview exactly what an AI proposal will change before the user applies it.
 */
export function diffDiagrams(a: Diagram, b: Diagram): string[] {
  const changes: string[] = [];
  const aNodes = new Map(a.nodes.map((n) => [n.id, n]));
  const bNodes = new Map(b.nodes.map((n) => [n.id, n]));
  const aEdges = new Map(a.edges.map((e) => [e.id, e]));
  const bEdges = new Map(b.edges.map((e) => [e.id, e]));

  for (const [id, node] of bNodes) {
    if (!aNodes.has(id)) {
      changes.push(`+ Added ${node.type} "${node.label}"`);
    } else {
      const old = aNodes.get(id)!;
      if (JSON.stringify(old.config) !== JSON.stringify(node.config)) {
        changes.push(`~ Updated ${node.type} "${node.label}" config`);
      }
      if (old.position.x !== node.position.x || old.position.y !== node.position.y) {
        changes.push(`~ Moved "${node.label}"`);
      }
    }
  }
  for (const [id] of aNodes) {
    if (!bNodes.has(id)) {
      const n = aNodes.get(id)!;
      changes.push(`- Removed ${n.type} "${n.label}"`);
    }
  }
  for (const [id, edge] of bEdges) {
    if (!aEdges.has(id)) {
      const src = bNodes.get(edge.source)?.label ?? edge.source;
      const tgt = bNodes.get(edge.target)?.label ?? edge.target;
      changes.push(`+ Connected "${src}" → "${tgt}"${edge.source_handle ? ` (${edge.source_handle})` : ''}`);
    } else {
      const old = aEdges.get(id)!;
      if (old.source !== edge.source || old.target !== edge.target || old.source_handle !== edge.source_handle) {
        const src = bNodes.get(edge.source)?.label ?? edge.source;
        const tgt = bNodes.get(edge.target)?.label ?? edge.target;
        changes.push(`~ Changed connection "${src}" → "${tgt}"`);
      }
    }
  }
  for (const [id] of aEdges) {
    if (!bEdges.has(id)) {
      const old = aEdges.get(id)!;
      const src = aNodes.get(old.source)?.label ?? old.source;
      const tgt = aNodes.get(old.target)?.label ?? old.target;
      changes.push(`- Removed connection "${src}" → "${tgt}"`);
    }
  }
  return changes;
}
