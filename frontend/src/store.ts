import { create } from 'zustand';
import {
  addEdge, applyEdgeChanges, applyNodeChanges,
  type Connection, type Edge, type EdgeChange, type NodeChange,
} from '@xyflow/react';
import type { BlockNodeT, Diagram, Issue, Library, SimResult } from './types';

const toNode = (n: Diagram['nodes'][number]): BlockNodeT => ({
  id: n.id,
  type: 'block',
  position: n.position,
  data: { blockType: n.type, label: n.label, config: n.config },
});
const toEdge = (e: Diagram['edges'][number]): Edge => ({
  id: e.id, source: e.source, target: e.target, sourceHandle: e.source_handle ?? undefined, type: 'smoothstep',
});

let counter = 0;
const newId = (type: string) => `${type}_${Date.now().toString(36)}${(counter++).toString(36)}`;

interface State {
  library: Library | null;
  name: string;
  nodes: BlockNodeT[];
  edges: Edge[];
  projectId: number | null;
  selectedId: string | null;
  issues: Issue[];
  trace: Record<string, number>; // node id -> step number
  history: Diagram[];
  dirty: boolean;
  toast: string | null;

  setLibrary: (l: Library) => void;
  setName: (n: string) => void;
  setProjectId: (id: number | null) => void;
  loadDiagram: (d: Diagram, opts?: { keepHistory?: boolean }) => void;
  toDiagram: () => Diagram;
  onNodesChange: (c: NodeChange<BlockNodeT>[]) => void;
  onEdgesChange: (c: EdgeChange[]) => void;
  onConnect: (c: Connection) => void;
  canConnect: (c: { source: string; target: string; sourceHandle?: string | null }) => boolean;
  addBlock: (type: string, position?: { x: number; y: number }) => void;
  updateNode: (id: string, patch: Partial<{ label: string; config: Record<string, unknown> }>) => void;
  removeNode: (id: string) => void;
  select: (id: string | null) => void;
  setIssues: (i: Issue[]) => void;
  setTrace: (r: SimResult | null) => void;
  applyProposal: (d: Diagram) => void;
  undo: () => void;
  markSaved: () => void;
  notify: (m: string | null) => void;
}

export const useStore = create<State>()((set, get) => ({
  library: null, name: 'Untitled', nodes: [], edges: [], projectId: null, selectedId: null,
  issues: [], trace: {}, history: [], dirty: false, toast: null,

  setLibrary: (library) => set({ library }),
  setName: (name) => set({ name, dirty: true }),
  setProjectId: (projectId) => set({ projectId }),

  loadDiagram: (d, opts) =>
    set((s) => ({
      name: d.name, nodes: d.nodes.map(toNode), edges: d.edges.map(toEdge), selectedId: null, trace: {},
      history: opts?.keepHistory ? s.history : [], dirty: false,
    })),

  toDiagram: () => {
    const { name, nodes, edges } = get();
    return {
      schema_version: '1', name,
      nodes: nodes.map((n) => ({
        id: n.id, type: n.data.blockType, label: n.data.label, config: n.data.config,
        position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
      })),
      edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, source_handle: e.sourceHandle ?? null })),
    };
  },

  onNodesChange: (changes) =>
    set((s) => ({
      nodes: applyNodeChanges(changes, s.nodes),
      dirty: s.dirty || changes.some((c) => c.type !== 'select' && c.type !== 'dimensions'),
    })),
  onEdgesChange: (changes) =>
    set((s) => ({
      edges: applyEdgeChanges(changes, s.edges),
      dirty: s.dirty || changes.some((c) => c.type !== 'select'),
    })),

  // Typed connections: the same category rules the backend validator enforces.
  canConnect: ({ source, target, sourceHandle }) => {
    const { library, nodes, edges } = get();
    if (!library || source === target) return false;
    const s = nodes.find((n) => n.id === source), t = nodes.find((n) => n.id === target);
    if (!s || !t) return false;
    const cat = (type: string) => library.blocks.find((b) => b.type === type)?.category;
    const sc = cat(s.data.blockType), tc = cat(t.data.blockType);
    if (!sc || !tc || !library.allowed_connections.some(([a, b]) => a === sc && b === tc)) return false;
    if (!library.blocks.find((b) => b.type === t.data.blockType)?.inputs) return false;
    return !edges.some((e) => e.source === source && e.target === target && (e.sourceHandle ?? null) === (sourceHandle ?? null));
  },
  onConnect: (c) => {
    if (!get().canConnect({ source: c.source, target: c.target, sourceHandle: c.sourceHandle })) return;
    set((s) => ({ edges: addEdge(c, s.edges), dirty: true }));
  },

  addBlock: (type, position) => {
    const def = get().library?.blocks.find((b) => b.type === type);
    if (!def) return;
    const n = get().nodes.length;
    const node: BlockNodeT = {
      id: newId(type), type: 'block',
      position: position ?? { x: 80 + (n % 6) * 40, y: 80 + (n % 6) * 40 },
      data: { blockType: type, label: def.label, config: structuredClone(def.defaults) },
    };
    set((s) => ({ nodes: [...s.nodes.map((x) => ({ ...x, selected: false })), { ...node, selected: true }], selectedId: node.id, dirty: true }));
  },

  updateNode: (id, patch) =>
    set((s) => ({
      dirty: true,
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...(patch.label !== undefined ? { label: patch.label } : {}),
          ...(patch.config ? { config: patch.config } : {}) } } : n),
    })),
  removeNode: (id) =>
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.source !== id && e.target !== id),
      selectedId: s.selectedId === id ? null : s.selectedId, dirty: true,
    })),
  select: (id) => set((s) => ({ selectedId: id, nodes: s.nodes.map((n) => ({ ...n, selected: n.id === id })) })),

  setIssues: (issues) => set({ issues }),
  setTrace: (r) => set({ trace: r ? Object.fromEntries(r.trace.map((t, i) => [t.node_id, i + 1])) : {} }),

  applyProposal: (d) => {
    const prev = get().toDiagram();
    get().loadDiagram(d, { keepHistory: true });
    set((s) => ({ history: [...s.history.slice(-19), prev], dirty: true }));
  },
  undo: () => {
    const h = get().history;
    if (!h.length) return;
    get().loadDiagram(h[h.length - 1], { keepHistory: true });
    set({ history: h.slice(0, -1), dirty: true });
  },
  markSaved: () => set({ dirty: false }),
  notify: (toast) => set({ toast }),
}));

// Tiny helper used by the app shell: re-validate only when the logic changes, not when blocks are dragged.
export const logicSignature = (d: Pick<Diagram, 'nodes' | 'edges'>): string =>
  JSON.stringify([d.nodes.map((n) => [n.id, n.type, n.config]), d.edges.map((e) => [e.source, e.target, e.source_handle])]);
