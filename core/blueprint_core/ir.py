"""Intermediate representation: framework-neutral description of the system.

Diagram -> (validate) -> compile_ir() -> SystemIR -> generators / simulator.
Nothing in here mentions FastAPI, Django or Express.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any, Optional

from .model import Diagram, Edge
from .names import pascal, snake
from .validate import has_errors, validate

STEP_KINDS = {"condition", "set_field", "update_status", "send_sms", "send_email",
              "charge_payment", "custom_code", "sql_query"}


@dataclass
class FieldIR:
    name: str
    type: str = "string"
    required: bool = False
    target: Optional[str] = None
    on_delete: str = "cascade"


@dataclass
class EntityIR:
    name: str  # PascalCase
    fields: list[FieldIR] = field(default_factory=list)
    node_id: str = ""

    def field(self, name: str) -> Optional[FieldIR]:
        return next((f for f in self.fields if f.name == snake(name)), None)


@dataclass
class Step:
    node_id: str
    kind: str
    params: dict = field(default_factory=dict)
    then: list["Step"] = field(default_factory=list)       # condition: true branch
    otherwise: list["Step"] = field(default_factory=list)  # condition: false branch


@dataclass
class FlowIR:
    event: str            # snake_case, used in URLs
    trigger_node_id: str
    entity: Optional[str] = None  # PascalCase or None
    steps: list[Step] = field(default_factory=list)


@dataclass
class RoleIR:
    name: str
    permissions: list[str] = field(default_factory=list)


@dataclass
class SystemIR:
    name: str
    entities: list[EntityIR] = field(default_factory=list)
    flows: list[FlowIR] = field(default_factory=list)
    roles: list[RoleIR] = field(default_factory=list)
    providers: list[str] = field(default_factory=list)

    def entity(self, name: Optional[str]) -> Optional[EntityIR]:
        return next((e for e in self.entities if e.name == pascal(name)), None) if name else None

    def flow(self, event: str) -> Optional[FlowIR]:
        return next((f for f in self.flows if f.event == snake(event)), None)

    def to_dict(self) -> dict:
        return asdict(self)


def coerce_value(ir: SystemIR, entity: Optional[str], field_name: str, value: Any) -> Any:
    """Turn the string typed on the canvas into the field's real type."""
    ent = ir.entity(entity)
    f = ent.field(field_name) if ent else None
    if f is None or not isinstance(value, str):
        return value
    try:
        if f.type == "integer":
            return int(float(value))
        if f.type == "number":
            return float(value)
        if f.type == "boolean":
            return value.strip().lower() in ("1", "true", "yes", "y")
    except ValueError:
        return value
    return value


def compile_ir(diagram: Diagram) -> SystemIR:
    issues = validate(diagram)
    if has_errors(issues):
        raise ValueError("Diagram has errors: " + "; ".join(i.message for i in issues if i.level == "error"))

    nodes = diagram.node_map()
    out: dict[str, list[Edge]] = {n.id: [] for n in diagram.nodes}
    for e in diagram.edges:
        out[e.source].append(e)

    def expand(node_id: str) -> list[Step]:
        n = nodes[node_id]
        if n.type not in STEP_KINDS:
            return []
        step = Step(n.id, n.type, dict(n.config))
        if n.type == "condition":
            for e in out[node_id]:
                branch = step.then if e.source_handle == "true" else step.otherwise
                branch.extend(expand(e.target))
            return [step]
        steps = [step]
        for e in out[node_id]:
            steps.extend(expand(e.target))
        return steps

    ir = SystemIR(name=diagram.name)
    for n in diagram.nodes:
        if n.type == "entity":
            ir.entities.append(EntityIR(
                pascal(n.config["name"]),
                [FieldIR(snake(f["name"]), f["type"], bool(f.get("required")),
                         pascal(f["target"]) if f.get("target") else None,
                         f.get("on_delete", "cascade")) for f in n.config.get("fields") or []],
                n.id))
        elif n.type == "actor":
            ir.roles.append(RoleIR(n.config["name"], list(n.config.get("permissions") or [])))
        elif n.type == "provider":
            ir.providers.append(snake(n.config["provider"]))

    for n in diagram.nodes:
        if n.type != "event":
            continue
        flow = FlowIR(snake(n.config["name"]), n.id, pascal(n.config["entity"]) if n.config.get("entity") else None)
        for e in out[n.id]:
            flow.steps.extend(expand(e.target))
        ir.flows.append(flow)

    # A "change status" step needs a status column to write to.
    for flow in ir.flows:
        ent = ir.entity(flow.entity)
        if ent and any(s.kind == "update_status" for s in walk_steps(flow.steps)) and not ent.field("status"):
            ent.fields.append(FieldIR("status", "string", False))
    return ir


def walk_steps(steps):
    for s in steps:
        yield s
        yield from walk_steps(s.then)
        yield from walk_steps(s.otherwise)
