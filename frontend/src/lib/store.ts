import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import { create } from "zustand";
import { api, ApiError } from "./api";
import {
  buildDiagram,
  canConnect,
  countIssues,
  layoutPositions,
  newId,
  resolveEvent,
  samplePayload,
  simulationEvents,
  toEdge,
  toNode,
  traceOrder,
} from "./diagram";
import { saveBlob } from "./download";
import { slug } from "./names";
import { notify, notifyError } from "./notify";
import { DEFAULT_TARGET } from "./targets";
import type { BlockNodeT, Diagram, Issue, Library, SimResult } from "./types";

export type PanelTab = "block" | "checks" | "simulate" | "ai";
export type DialogName = "projects" | "help" | "settings";
type Busy = "save" | "code" | "ai-code" | null;

interface Simulation {
  event: string;
  payload: string;
  result: SimResult | null;
  running: boolean;
}

const PROJECT_KEY = "blueprint_project";
const TARGET_KEY = "blueprint_target";
const HISTORY_LIMIT = 20;

interface WorkspaceState {
  // diagram
  library: Library | null;
  name: string;
  nodes: BlockNodeT[];
  edges: Edge[];
  /** Snapshots taken before AI changes and auto-arrange, so they can be undone. */
  history: Diagram[];

  // persistence
  projectId: number | null;
  version: number | null;
  savedAt: Date | null;
  dirty: boolean;
  busy: Busy;
  target: string;

  // analysis
  issues: Issue[];
  sim: Simulation;
  /** node id -> order it ran in the last simulation */
  trace: Record<string, number>;

  // ui
  status: "booting" | "ready" | "offline";
  bootError: string | null;
  selectedId: string | null;
  tab: PanelTab;
  dialog: DialogName | null;
  /** Bump `rev` to ask the canvas to re-frame: the whole diagram, or one node. */
  fit: { rev: number; nodeId: string | null };

  boot: () => Promise<void>;
  openProject: (id: number) => Promise<boolean>;
  save: () => Promise<void>;
  generate: (ai: boolean) => Promise<void>;
  validate: () => Promise<void>;

  toDiagram: () => Diagram;
  loadDiagram: (d: Diagram, keepHistory?: boolean) => void;
  setName: (name: string) => void;
  setTarget: (target: string) => void;

  onNodesChange: (changes: NodeChange<BlockNodeT>[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (c: Connection) => void;
  addBlock: (type: string, position?: { x: number; y: number }) => void;
  updateNode: (
    id: string,
    patch: { label?: string; config?: Record<string, unknown> },
  ) => void;
  removeNode: (id: string) => void;
  select: (id: string | null) => void;
  focusNode: (id: string) => void;

  autoLayout: () => void;
  applyProposal: (d: Diagram) => void;
  undo: () => void;

  setSimEvent: (event: string) => void;
  setSimPayload: (payload: string) => void;
  fillSimPayload: () => void;
  runSimulation: () => Promise<void>;
  clearSimulation: () => void;

  setTab: (tab: PanelTab) => void;
  setDialog: (dialog: DialogName | null) => void;
}

const pushHistory = (history: Diagram[], snapshot: Diagram): Diagram[] => [
  ...history.slice(-(HISTORY_LIMIT - 1)),
  snapshot,
];

let validationSeq = 0;
let bootPromise: Promise<void> | null = null;

export const useWorkspace = create<WorkspaceState>()((set, get) => ({
  library: null,
  name: "Untitled",
  nodes: [],
  edges: [],
  history: [],

  projectId: null,
  version: null,
  savedAt: null,
  dirty: false,
  busy: null,
  target: DEFAULT_TARGET,

  issues: [],
  sim: { event: "", payload: "{}", result: null, running: false },
  trace: {},

  status: "booting",
  bootError: null,
  selectedId: null,
  tab: "block",
  dialog: null,
  fit: { rev: 0, nodeId: null },

  // ---- lifecycle ----------------------------------------------------------

  // Loads the block library, then reopens the last project (or shows the project picker).
  // Safe to call again to retry after a failure; concurrent calls share one run.
  boot: () => {
    bootPromise ??= (async () => {
      if (get().status !== "ready") set({ status: "booting", bootError: null });
      try {
        set({ library: await api.library() });
      } catch (e) {
        set({
          status: "offline",
          bootError: e instanceof Error ? e.message : "Could not reach the API",
        });
        return;
      }
      const savedTarget = localStorage.getItem(TARGET_KEY);
      set({ status: "ready", ...(savedTarget ? { target: savedTarget } : {}) });

      if (get().projectId !== null || get().nodes.length) return; // retry while working: keep the canvas
      const saved = Number(localStorage.getItem(PROJECT_KEY));
      if (saved && (await get().openProject(saved))) return;
      set({ dialog: "projects" });
    })().finally(() => {
      bootPromise = null;
    });
    return bootPromise;
  },

  openProject: async (id) => {
    try {
      const latest = await api.latest(id);
      get().loadDiagram(latest.diagram);
      set({ projectId: id, version: latest.number, savedAt: null, dialog: null });
      localStorage.setItem(PROJECT_KEY, String(id));
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) localStorage.removeItem(PROJECT_KEY);
      notifyError(e, "Could not open project");
      return false;
    }
  },

  save: async () => {
    if (get().busy) return;
    set({ busy: "save" });
    try {
      let id = get().projectId;
      if (id === null) {
        id = (await api.createProject(get().name.trim() || "Untitled", "")).id;
        set({ projectId: id });
        localStorage.setItem(PROJECT_KEY, String(id));
      }
      const { number } = await api.saveVersion(id, get().toDiagram());
      set({ version: number, savedAt: new Date(), dirty: false });
      notify(`Saved as v${number}`);
    } catch (e) {
      notifyError(e, "Save failed");
    } finally {
      set({ busy: null });
    }
  },

  generate: async (ai) => {
    if (get().busy) return;
    set({ busy: ai ? "ai-code" : "code" });
    try {
      const { target, name } = get();
      const blob = await api.generate(get().toDiagram(), target, ai);
      saveBlob(blob, `${slug(name)}-${target}${ai ? "-ai" : ""}.zip`);
      notify(ai ? "AI-assisted project downloaded" : "Project downloaded");
    } catch (e) {
      notifyError(e, "Generation failed");
      if (e instanceof ApiError && e.issues?.length) set({ issues: e.issues, tab: "checks" });
    } finally {
      set({ busy: null });
    }
  },

  // Live checks. Stale responses are dropped so a slow request can't overwrite a newer one.
  validate: async () => {
    const seq = ++validationSeq;
    try {
      const result = await api.validate(get().toDiagram());
      if (seq === validationSeq) set({ issues: result.issues });
    } catch {
      /* best-effort: generating surfaces real errors */
    }
  },

  // ---- diagram ------------------------------------------------------------

  toDiagram: () => buildDiagram(get().name, get().nodes, get().edges),

  loadDiagram: (d, keepHistory = false) =>
    set((s) => ({
      name: d.name,
      nodes: d.nodes.map(toNode),
      edges: d.edges.map(toEdge),
      selectedId: null,
      trace: {},
      sim: { ...s.sim, result: null },
      history: keepHistory ? s.history : [],
      dirty: false,
      fit: { rev: s.fit.rev + 1, nodeId: null },
    })),

  setName: (name) => set({ name, dirty: true }),
  setTarget: (target) => {
    localStorage.setItem(TARGET_KEY, target);
    set({ target });
  },

  onNodesChange: (changes) =>
    set((s) => ({
      nodes: applyNodeChanges(changes, s.nodes),
      dirty: s.dirty || changes.some((c) => c.type !== "select" && c.type !== "dimensions"),
      ...(changes.some((c) => c.type === "remove" && c.id === s.selectedId)
        ? { selectedId: null }
        : {}),
    })),

  onEdgesChange: (changes) =>
    set((s) => ({
      edges: applyEdgeChanges(changes, s.edges),
      dirty: s.dirty || changes.some((c) => c.type !== "select"),
    })),

  onConnect: (c) => {
    const { library, nodes, edges } = get();
    if (!canConnect(library, nodes, edges, c)) return;
    set({ edges: addEdge(c, edges), dirty: true });
  },

  addBlock: (type, position) => {
    const def = get().library?.blocks.find((b) => b.type === type);
    if (!def) return;
    const offset = 80 + (get().nodes.length % 6) * 40;
    const node: BlockNodeT = {
      id: newId(type),
      type: "block",
      position: position ?? { x: offset, y: offset },
      data: { blockType: type, label: def.label, config: structuredClone(def.defaults) },
      selected: true,
    };
    set((s) => ({
      nodes: [...s.nodes.map((n) => ({ ...n, selected: false })), node],
      selectedId: node.id,
      tab: "block",
      dirty: true,
    }));
  },

  updateNode: (id, patch) =>
    set((s) => ({
      dirty: true,
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)),
    })),

  removeNode: (id) =>
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.source !== id && e.target !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
      dirty: true,
    })),

  select: (id) =>
    set((s) => ({
      selectedId: id,
      nodes: s.nodes.map((n) =>
        Boolean(n.selected) === (n.id === id) ? n : { ...n, selected: n.id === id },
      ),
    })),

  // Select a block, show its settings, and pan the canvas to it.
  focusNode: (id) => {
    get().select(id);
    set((s) => ({ tab: "block", fit: { rev: s.fit.rev + 1, nodeId: id } }));
  },

  // ---- undoable bulk changes ---------------------------------------------

  autoLayout: () => {
    const { nodes, edges } = get();
    if (!nodes.length) return;
    const positions = layoutPositions(nodes, edges);
    const snapshot = get().toDiagram();
    set((s) => ({
      nodes: s.nodes.map((n) => ({ ...n, position: positions.get(n.id) ?? n.position })),
      history: pushHistory(s.history, snapshot),
      dirty: true,
      fit: { rev: s.fit.rev + 1, nodeId: null },
    }));
  },

  applyProposal: (d) => {
    const snapshot = get().toDiagram();
    get().loadDiagram(d, true);
    set((s) => ({ history: pushHistory(s.history, snapshot), dirty: true }));
  },

  undo: () => {
    const { history } = get();
    const previous = history[history.length - 1];
    if (!previous) return;
    get().loadDiagram(previous, true);
    set({ history: history.slice(0, -1), dirty: true });
  },

  // ---- simulation ---------------------------------------------------------

  setSimEvent: (event) => set((s) => ({ sim: { ...s.sim, event, result: null }, trace: {} })),
  setSimPayload: (payload) => set((s) => ({ sim: { ...s.sim, payload } })),

  fillSimPayload: () => {
    const { nodes, sim } = get();
    const event = resolveEvent(simulationEvents(nodes), sim.event);
    if (!event) return;
    const payload = JSON.stringify(samplePayload(nodes, event.entity), null, 2);
    set((s) => ({ sim: { ...s.sim, payload } }));
  },

  runSimulation: async () => {
    const { nodes, sim } = get();
    const event = resolveEvent(simulationEvents(nodes), sim.event);
    if (!event) {
      notify("Add an Event block to simulate it.");
      return;
    }
    // Untouched payload: start from a record shaped like the event's table.
    const raw = sim.payload.trim();
    const body =
      raw && raw !== "{}" ? raw : JSON.stringify(samplePayload(nodes, event.entity), null, 2);

    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      notify("Payload is not valid JSON");
      return;
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      notify("Payload must be a JSON object");
      return;
    }

    set((s) => ({
      sim: { ...s.sim, event: event.name, payload: body, running: true },
      tab: "simulate",
    }));
    try {
      const result = await api.simulate(
        get().toDiagram(),
        event.name,
        payload as Record<string, unknown>,
      );
      set((s) => ({ sim: { ...s.sim, result, running: false }, trace: traceOrder(result) }));
    } catch (e) {
      set((s) => ({ sim: { ...s.sim, running: false } }));
      notifyError(e, "Simulation failed");
    }
  },

  clearSimulation: () => set((s) => ({ sim: { ...s.sim, result: null }, trace: {} })),

  // ---- ui -----------------------------------------------------------------

  setTab: (tab) => set({ tab }),
  setDialog: (dialog) => set({ dialog }),
}));

export const selectErrorCount = (s: WorkspaceState): number => countIssues(s.issues, "error");
export const selectWarningCount = (s: WorkspaceState): number => countIssues(s.issues, "warning");
