import type { Edge } from "@xyflow/react";
import { pascal } from "./names";
import type {
  BlockNodeT,
  Diagram,
  DiagramEdge,
  DiagramNode,
  Issue,
  Library,
  SimResult,
} from "./types";

export const BLOCK_DRAG_MIME = "application/blueprint-block";

// ---------------------------------------------------------------------------
// API <-> React Flow
// ---------------------------------------------------------------------------

export const toNode = (n: DiagramNode): BlockNodeT => ({
  id: n.id,
  type: "block",
  position: n.position,
  data: { blockType: n.type, label: n.label, config: n.config },
});

export const toEdge = (e: DiagramEdge): Edge => ({
  id: e.id,
  source: e.source,
  target: e.target,
  sourceHandle: e.source_handle,
  type: "smoothstep",
});

export const buildDiagram = (name: string, nodes: BlockNodeT[], edges: Edge[]): Diagram => ({
  schema_version: "1",
  name,
  nodes: nodes.map((n) => ({
    id: n.id,
    type: n.data.blockType,
    label: n.data.label,
    config: n.data.config,
    position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
  })),
  edges: edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    source_handle: e.sourceHandle ?? null,
  })),
});

/** Changes when the diagram's logic changes, not when a block is merely dragged. */
export const logicSignature = (nodes: BlockNodeT[], edges: Edge[]): string =>
  JSON.stringify([
    nodes.map((n) => [n.id, n.data.blockType, n.data.config]),
    edges.map((e) => [e.source, e.target, e.sourceHandle ?? null]),
  ]);

let counter = 0;
export const newId = (type: string): string =>
  `${type}_${Date.now().toString(36)}${(counter++).toString(36)}`;

export const countIssues = (issues: Issue[], level: Issue["level"]): number =>
  issues.filter((i) => i.level === level).length;

// ---------------------------------------------------------------------------
// Typed connections: the same category rules the backend validator enforces.
// ---------------------------------------------------------------------------

export interface ConnectionLike {
  source: string;
  target: string;
  sourceHandle?: string | null | undefined;
}

export function canConnect(
  library: Library | null,
  nodes: BlockNodeT[],
  edges: Edge[],
  c: ConnectionLike,
): boolean {
  if (!library || c.source === c.target) return false;
  const source = nodes.find((n) => n.id === c.source);
  const target = nodes.find((n) => n.id === c.target);
  if (!source || !target) return false;

  const blockOf = (type: string) => library.blocks.find((b) => b.type === type);
  const from = blockOf(source.data.blockType);
  const to = blockOf(target.data.blockType);
  if (!from || !to || !to.inputs) return false;
  if (!library.allowed_connections.some(([a, b]) => a === from.category && b === to.category)) {
    return false;
  }
  const handle = c.sourceHandle ?? null;
  return !edges.some(
    (e) => e.source === c.source && e.target === c.target && (e.sourceHandle ?? null) === handle,
  );
}

// ---------------------------------------------------------------------------
// Auto-layout ("Arrange"): left-to-right layers, ordered to limit crossings.
// ---------------------------------------------------------------------------

const COLUMN_WIDTH = 290;
const ROW_HEIGHT = 104;

export function layoutPositions(
  nodes: BlockNodeT[],
  edges: Edge[],
): Map<string, { x: number; y: number }> {
  const ids = new Set(nodes.map((n) => n.id));
  const links = edges.filter((e) => e.source !== e.target && ids.has(e.source) && ids.has(e.target));

  const predecessors = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const e of links) predecessors.get(e.target)?.push(e.source);

  // Layer = longest path from a source. The cap keeps cycles from looping forever.
  const layer = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  for (let pass = 0; pass < nodes.length; pass++) {
    let changed = false;
    for (const e of links) {
      const next = (layer.get(e.source) ?? 0) + 1;
      if (next < nodes.length && next > (layer.get(e.target) ?? 0)) {
        layer.set(e.target, next);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const byLayer: BlockNodeT[][] = [];
  for (const n of nodes) {
    const l = layer.get(n.id) ?? 0;
    (byLayer[l] ??= []).push(n);
  }
  const columns = byLayer.filter((col): col is BlockNodeT[] => Array.isArray(col));
  const tallest = Math.max(1, ...columns.map((col) => col.length));

  const row = new Map<string, number>();
  const positions = new Map<string, { x: number; y: number }>();
  columns.forEach((column, columnIndex) => {
    // Barycenter ordering: sit near the average row of your predecessors.
    const score = (n: BlockNodeT): number => {
      const rows = (predecessors.get(n.id) ?? [])
        .map((id) => row.get(id))
        .filter((r): r is number => r !== undefined);
      return rows.length ? rows.reduce((a, b) => a + b, 0) / rows.length : n.position.y / ROW_HEIGHT;
    };
    const ordered = [...column].sort(
      (a, b) => score(a) - score(b) || a.position.y - b.position.y || a.id.localeCompare(b.id),
    );
    const offset = (tallest - ordered.length) / 2;
    ordered.forEach((n, i) => {
      row.set(n.id, i);
      positions.set(n.id, { x: columnIndex * COLUMN_WIDTH, y: (i + offset) * ROW_HEIGHT });
    });
  });
  return positions;
}

// ---------------------------------------------------------------------------
// Simulator helpers
// ---------------------------------------------------------------------------

export interface SimEvent {
  name: string;
  entity: string;
}

const text = (v: unknown): string => (typeof v === "string" ? v : "");

export function simulationEvents(nodes: BlockNodeT[]): SimEvent[] {
  const events = new Map<string, SimEvent>();
  for (const n of nodes) {
    if (n.data.blockType !== "event") continue;
    const name = text(n.data.config["name"]);
    if (name && !events.has(name)) events.set(name, { name, entity: text(n.data.config["entity"]) });
  }
  return [...events.values()];
}

/** The chosen event, or the first one when nothing (valid) is chosen yet. */
export const resolveEvent = (events: SimEvent[], name: string): SimEvent | undefined =>
  events.find((e) => e.name === name) ?? events[0];

const SAMPLE: Record<string, unknown> = {
  string: "",
  text: "",
  integer: 0,
  number: 0,
  boolean: false,
  date: "",
  datetime: "",
};

/** An empty record shaped like the table the event is about. */
export function samplePayload(nodes: BlockNodeT[], entityName: string): Record<string, unknown> {
  if (!entityName) return {};
  const entity = nodes.find(
    (n) =>
      n.data.blockType === "entity" && pascal(text(n.data.config["name"])) === pascal(entityName),
  );
  const fields = entity?.data.config["fields"];
  if (!Array.isArray(fields)) return {};
  const pairs: [string, unknown][] = [];
  for (const f of fields as { name?: unknown; type?: unknown }[]) {
    if (typeof f.name === "string" && f.name) pairs.push([f.name, SAMPLE[text(f.type)] ?? ""]);
  }
  return Object.fromEntries(pairs);
}

/** node id -> the order it ran in (1-based). */
export const traceOrder = (r: SimResult): Record<string, number> =>
  Object.fromEntries(r.trace.map((t, i) => [t.node_id, i + 1]));
