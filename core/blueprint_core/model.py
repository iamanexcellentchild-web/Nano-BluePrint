"""Diagram document model: what the canvas saves and the API exchanges."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

SCHEMA_VERSION = "1"


class DiagramFormatError(ValueError):
    """The payload is not shaped like a diagram at all (as opposed to a diagram with logic problems)."""


@dataclass
class Node:
    id: str
    type: str
    label: str = ""
    config: dict = field(default_factory=dict)
    position: dict = field(default_factory=lambda: {"x": 0, "y": 0})


@dataclass
class Edge:
    id: str
    source: str
    target: str
    source_handle: Optional[str] = None


@dataclass(frozen=True)
class Issue:
    level: str  # "error" | "warning" | "info"
    code: str
    message: str
    node_id: Optional[str] = None
    edge_id: Optional[str] = None

    def to_dict(self) -> dict:
        return {"level": self.level, "code": self.code, "message": self.message,
                "node_id": self.node_id, "edge_id": self.edge_id}


@dataclass
class Diagram:
    name: str = "Untitled"
    nodes: list[Node] = field(default_factory=list)
    edges: list[Edge] = field(default_factory=list)
    schema_version: str = SCHEMA_VERSION

    def node_map(self) -> dict[str, Node]:
        return {n.id: n for n in self.nodes}

    @classmethod
    def from_dict(cls, data: Any) -> "Diagram":
        if not isinstance(data, dict):
            raise DiagramFormatError("Diagram must be an object")
        raw_nodes, raw_edges = data.get("nodes", []), data.get("edges", [])
        if not isinstance(raw_nodes, list) or not isinstance(raw_edges, list):
            raise DiagramFormatError("'nodes' and 'edges' must be lists")
        nodes, edges = [], []
        for i, n in enumerate(raw_nodes):
            if not isinstance(n, dict) or "id" not in n or "type" not in n:
                raise DiagramFormatError(f"nodes[{i}] needs 'id' and 'type'")
            cfg = n.get("config") or {}
            if not isinstance(cfg, dict):
                raise DiagramFormatError(f"nodes[{i}].config must be an object")
            nodes.append(Node(str(n["id"]), str(n["type"]), str(n.get("label") or ""), cfg,
                              n.get("position") or {"x": 0, "y": 0}))
        for i, e in enumerate(raw_edges):
            if not isinstance(e, dict) or "source" not in e or "target" not in e:
                raise DiagramFormatError(f"edges[{i}] needs 'source' and 'target'")
            handle = e.get("source_handle", e.get("sourceHandle"))
            edges.append(Edge(str(e.get("id") or f"{e['source']}->{e['target']}"),
                              str(e["source"]), str(e["target"]), handle or None))
        return cls(str(data.get("name") or "Untitled"), nodes, edges,
                   str(data.get("schema_version") or SCHEMA_VERSION))

    def to_dict(self) -> dict:
        return {
            "schema_version": self.schema_version,
            "name": self.name,
            "nodes": [{"id": n.id, "type": n.type, "label": n.label, "config": n.config,
                       "position": n.position} for n in self.nodes],
            "edges": [{"id": e.id, "source": e.source, "target": e.target,
                       "source_handle": e.source_handle} for e in self.edges],
        }
