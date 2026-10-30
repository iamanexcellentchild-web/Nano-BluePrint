"""Run an event through the IR without any generated code.

The trace contains node ids so the canvas can highlight the path taken.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .ir import SystemIR, Step, coerce_value
from .runtime_support import compare, render
from .names import snake


@dataclass
class SimResult:
    ok: bool
    trace: list[dict] = field(default_factory=list)
    context: dict = field(default_factory=dict)
    error: str | None = None

    def to_dict(self) -> dict:
        return {"ok": self.ok, "trace": self.trace, "context": self.context, "error": self.error}


def simulate(ir: SystemIR, event: str, payload: dict | None = None) -> SimResult:
    flow = ir.flow(event)
    if flow is None:
        return SimResult(False, error=f"No event called '{event}'. Known events: {[f.event for f in ir.flows]}")
    ctx = dict(payload or {})
    trace: list[dict] = [{"node_id": flow.trigger_node_id, "kind": "event", "summary": f"Event '{flow.event}' received"}]

    def run(steps: list[Step]) -> None:
        for s in steps:
            p = s.params
            if s.kind == "condition":
                res = compare(ctx.get(p["field"]), p["operator"], p["value"])
                trace.append({"node_id": s.node_id, "kind": "condition", "branch": "true" if res else "false",
                              "summary": f"{p['field']} ({ctx.get(p['field'])!r}) {p['operator']} {p['value']!r} -> {'yes' if res else 'no'}"})
                run(s.then if res else s.otherwise)
                continue
            if s.kind == "set_field":
                ctx[p["field"]] = coerce_value(ir, flow.entity, p["field"], p["value"])
                summary = f"Set {p['field']} = {ctx[p['field']]!r}"
            elif s.kind == "update_status":
                ctx["status"] = p["status"]
                summary = f"Status -> {p['status']}"
            elif s.kind == "send_sms":
                summary = f"SMS to {ctx.get(p['to_field'])!r}: {render(p['message'], ctx)}"
            elif s.kind == "send_email":
                summary = f"Email to {ctx.get(p['to_field'])!r} [{render(p['subject'], ctx)}]: {render(p['message'], ctx)}"
            elif s.kind == "charge_payment":
                summary = f"Charge {ctx.get(p['amount_field'])!r} via {p['provider']}"
            elif s.kind == "custom_code":
                summary = f"Custom code (not simulated): {p.get('description', '')}"
            elif s.kind == "sql_query":
                summary = f"SQL query (not run in simulation): {p.get('name', '')}"
            else:
                summary = s.kind
            trace.append({"node_id": s.node_id, "kind": s.kind, "summary": summary})

    run(flow.steps)
    return SimResult(True, trace, ctx)
