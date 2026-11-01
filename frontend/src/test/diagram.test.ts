import { describe, expect, it } from "vitest";
import type { Edge } from "@xyflow/react";
import {
  buildDiagram,
  canConnect,
  layoutPositions,
  logicSignature,
  resolveEvent,
  samplePayload,
  simulationEvents,
  toEdge,
  toNode,
} from "@/lib/diagram";
import type { BlockNodeT, Library } from "@/lib/types";

const library: Library = {
  categories: {},
  blocks: [
    { type: "actor", category: "actor", label: "Actor", description: "", outputs: ["out"], inputs: false, config_fields: [], defaults: {} },
    { type: "event", category: "trigger", label: "Event", description: "", outputs: ["out"], inputs: true, config_fields: [], defaults: {} },
    { type: "condition", category: "logic", label: "Condition", description: "", outputs: ["true", "false"], inputs: true, config_fields: [], defaults: {} },
    { type: "email", category: "action", label: "Email", description: "", outputs: ["out"], inputs: true, config_fields: [], defaults: {} },
  ],
  allowed_connections: [["actor", "trigger"], ["trigger", "logic"], ["trigger", "action"], ["logic", "action"]],
  field_types: [],
  relation_types: [],
  delete_behaviors: [],
  operators: [],
};

const node = (id: string, blockType: string, y = 0, config: Record<string, unknown> = {}): BlockNodeT => ({
  id,
  type: "block",
  position: { x: 0, y },
  data: { blockType, label: id, config },
});
const edge = (source: string, target: string, sourceHandle: string | null = null): Edge => ({
  id: `${source}-${target}-${sourceHandle ?? ""}`,
  source,
  target,
  sourceHandle,
});

describe("diagram mapping", () => {
  it("round-trips through the API shape", () => {
    const nodes = [node("a", "actor"), node("e", "event")];
    const edges = [edge("a", "e")];
    const d = buildDiagram("Shop", nodes, edges);
    expect(d.nodes.map(toNode)).toEqual(nodes);
    expect(d.edges.map((x) => toEdge(x).source)).toEqual(["a"]);
    expect(d.edges[0]?.source_handle).toBeNull();
  });

  it("rounds positions when serialising", () => {
    const n = node("a", "actor");
    n.position = { x: 10.6, y: 3.2 };
    expect(buildDiagram("x", [n], []).nodes[0]?.position).toEqual({ x: 11, y: 3 });
  });
});

describe("logicSignature", () => {
  it("ignores layout but notices logic changes", () => {
    const a = node("a", "actor");
    const moved = { ...a, position: { x: 500, y: 500 } };
    expect(logicSignature([a], [])).toBe(logicSignature([moved], []));
    const edited = { ...a, data: { ...a.data, config: { name: "x" } } };
    expect(logicSignature([a], [])).not.toBe(logicSignature([edited], []));
    expect(logicSignature([a], [])).not.toBe(logicSignature([a], [edge("a", "a")]));
  });
});

describe("canConnect", () => {
  const nodes = [node("a", "actor"), node("e", "event"), node("c", "condition"), node("m", "email")];

  it("allows only the category pairs the library lists", () => {
    expect(canConnect(library, nodes, [], { source: "a", target: "e" })).toBe(true);
    expect(canConnect(library, nodes, [], { source: "a", target: "m" })).toBe(false);
    expect(canConnect(library, nodes, [], { source: "m", target: "e" })).toBe(false);
  });

  it("rejects self-links, unknown ids, targets without inputs and a missing library", () => {
    expect(canConnect(library, nodes, [], { source: "e", target: "e" })).toBe(false);
    expect(canConnect(library, nodes, [], { source: "e", target: "nope" })).toBe(false);
    expect(canConnect(library, nodes, [], { source: "e", target: "a" })).toBe(false);
    expect(canConnect(null, nodes, [], { source: "a", target: "e" })).toBe(false);
  });

  it("rejects duplicates, but allows each branch of a condition separately", () => {
    const existing = [edge("c", "m", "true")];
    expect(canConnect(library, nodes, existing, { source: "c", target: "m", sourceHandle: "true" })).toBe(false);
    expect(canConnect(library, nodes, existing, { source: "c", target: "m", sourceHandle: "false" })).toBe(true);
  });
});

describe("layoutPositions", () => {
  it("lays a chain out left to right", () => {
    const nodes = [node("a", "actor", 300), node("e", "event", 0), node("m", "email", 90)];
    const pos = layoutPositions(nodes, [edge("a", "e"), edge("e", "m")]);
    expect(pos.get("a")?.x).toBe(0);
    expect((pos.get("e")?.x ?? 0) > (pos.get("a")?.x ?? 0)).toBe(true);
    expect((pos.get("m")?.x ?? 0) > (pos.get("e")?.x ?? 0)).toBe(true);
  });

  it("puts a node after its latest predecessor and keeps rows apart", () => {
    const nodes = [node("a", "actor"), node("e", "event"), node("c", "condition"), node("m", "email")];
    const edges = [edge("a", "e"), edge("e", "c"), edge("e", "m"), edge("c", "m", "true")];
    const pos = layoutPositions(nodes, edges);
    expect((pos.get("m")?.x ?? 0) > (pos.get("c")?.x ?? 0)).toBe(true);
    const ys = new Set([...pos.values()].map((p) => `${p.x}:${p.y}`));
    expect(ys.size).toBe(nodes.length);
  });

  it("terminates on cycles and places every node", () => {
    const nodes = [node("e", "event"), node("m", "email"), node("c", "condition")];
    const pos = layoutPositions(nodes, [edge("e", "m"), edge("m", "c"), edge("c", "e")]);
    expect(pos.size).toBe(3);
  });

  it("handles an empty diagram and unconnected blocks", () => {
    expect(layoutPositions([], []).size).toBe(0);
    expect(layoutPositions([node("a", "actor"), node("b", "actor")], []).size).toBe(2);
  });
});

describe("simulator helpers", () => {
  const nodes = [
    node("t", "entity", 0, { name: "booking", fields: [{ name: "start", type: "datetime" }, { name: "deposit", type: "integer" }, { name: "paid", type: "boolean" }] }),
    node("e1", "event", 0, { name: "booking_requested", entity: "Booking" }),
    node("e2", "event", 0, { name: "booking_requested", entity: "Booking" }),
    node("e3", "event", 0, { name: "" }),
    node("e4", "event", 0, { name: "cancelled" }),
  ];

  it("lists named events once", () => {
    expect(simulationEvents(nodes).map((e) => e.name)).toEqual(["booking_requested", "cancelled"]);
  });

  it("falls back to the first event", () => {
    const events = simulationEvents(nodes);
    expect(resolveEvent(events, "cancelled")?.name).toBe("cancelled");
    expect(resolveEvent(events, "gone")?.name).toBe("booking_requested");
    expect(resolveEvent([], "x")).toBeUndefined();
  });

  it("builds a sample record from the matching table, ignoring name casing", () => {
    expect(samplePayload(nodes, "Booking")).toEqual({ start: "", deposit: 0, paid: false });
    expect(samplePayload(nodes, "")).toEqual({});
    expect(samplePayload(nodes, "Unknown")).toEqual({});
  });
});
