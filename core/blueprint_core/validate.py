"""Diagram validation. Returns Issues; never raises for logic problems.

Severity: error   -> cannot compile / generate
          warning -> compiles, but probably not what the owner meant
          info    -> suggestion
"""
from __future__ import annotations

from collections import deque

from .block_library import (BLOCKS, ALLOWED_CONNECTIONS, DELETE_BEHAVIORS, FIELD_REFS,
                            FIELD_TYPES, RELATION_TYPES, category_of)
from .model import Diagram, Issue
from .names import is_valid_name, pascal, snake

RESERVED_FIELDS = {"id"}


def has_errors(issues: list[Issue]) -> bool:
    return any(i.level == "error" for i in issues)


def _empty(v) -> bool:
    return v is None or v == "" or v == []


def validate(diagram: Diagram) -> list[Issue]:
    issues: list[Issue] = []
    add = lambda *a, **k: issues.append(Issue(*a, **k))  # noqa: E731
    nodes = diagram.node_map()

    # --- structure ------------------------------------------------------
    seen: set[str] = set()
    for n in diagram.nodes:
        if n.id in seen:
            add("error", "DG002", f"Duplicate block id '{n.id}'", node_id=n.id)
        seen.add(n.id)
        if n.type not in BLOCKS:
            add("error", "DG001", f"Unknown block type '{n.type}'", node_id=n.id)

    valid_edges = []
    for e in diagram.edges:
        s, t = nodes.get(e.source), nodes.get(e.target)
        if s is None or t is None:
            add("error", "DG003", "Connection points to a block that does not exist", edge_id=e.id)
            continue
        sc, tc = category_of(s.type), category_of(t.type)
        if sc is None or tc is None:
            continue  # unknown type already reported
        if (sc, tc) not in ALLOWED_CONNECTIONS:
            add("error", "DG004",
                f"'{s.label or s.type}' ({sc}) cannot connect to '{t.label or t.type}' ({tc})",
                edge_id=e.id)
            continue
        if s.type == "condition" and e.source_handle not in ("true", "false"):
            add("error", "DG006", "Connections from an If/else must use its 'yes' or 'no' handle",
                edge_id=e.id)
            continue
        if s.type != "condition" and e.source_handle not in (None, "default"):
            add("error", "DG006", "Unexpected output handle on this block", edge_id=e.id)
            continue
        valid_edges.append(e)

    # --- per-block config -----------------------------------------------
    entity_fields: dict[str, set[str]] = {}
    seen_entities: dict[str, str] = {}
    seen_events: dict[str, str] = {}
    for n in diagram.nodes:
        block = BLOCKS.get(n.type)
        if not block:
            continue
        for f in block["config_fields"]:
            if f["required"] and _empty(n.config.get(f["key"])):
                add("error", "DG005", f"'{n.label or block['label']}': {f['label']} is required", node_id=n.id)
        if n.type == "entity":
            name = n.config.get("name")
            if not _empty(name) and not is_valid_name(name):
                add("error", "DG024", f"Invalid table name '{name}' (letters, numbers, spaces, underscores; start with a letter)", node_id=n.id)
            key = pascal(name) if isinstance(name, str) else ""
            if key and key in seen_entities:
                add("error", "DG010", f"Two tables are both called '{name}'", node_id=n.id)
            seen_entities[key] = n.id
            names: set[str] = set()
            for fld in n.config.get("fields") or []:
                fname = fld.get("name") if isinstance(fld, dict) else None
                if not is_valid_name(fname) or snake(fname) in RESERVED_FIELDS:
                    add("error", "DG023", f"Invalid field name '{fname}' in '{name}' ('id' is reserved)", node_id=n.id)
                    continue
                if snake(fname) in names:
                    add("error", "DG023", f"Duplicate field '{fname}' in '{name}'", node_id=n.id)
                field_type = fld.get("type")
                if field_type not in FIELD_TYPES and field_type not in RELATION_TYPES:
                    add("error", "DG023", f"Field '{fname}' has unknown type '{fld.get('type')}'", node_id=n.id)
                elif field_type in RELATION_TYPES:
                    target = fld.get("target")
                    known_entities = {pascal(x.config.get("name", "")) for x in diagram.nodes if x.type == "entity"}
                    if not isinstance(target, str) or pascal(target) not in known_entities:
                        add("error", "DG032", f"Relationship field '{fname}' refers to an unknown table '{target or ''}'", node_id=n.id)
                    if field_type == "foreign_key" and fld.get("on_delete", "cascade") not in DELETE_BEHAVIORS:
                        add("error", "DG033", f"Relationship field '{fname}' has an invalid delete behavior", node_id=n.id)
                    elif field_type == "foreign_key" and fld.get("on_delete") == "set_null" and fld.get("required"):
                        add("error", "DG033", f"Relationship field '{fname}' must be optional when delete behavior is set_null", node_id=n.id)
                    if field_type == "many_to_many" and fld.get("required"):
                        add("error", "DG034", f"Many-to-many field '{fname}' cannot be required", node_id=n.id)
                names.add(snake(fname))
            entity_fields[key] = names
        if n.type == "sql_query":
            from .sql_queries import validate_select_query
            query = n.config.get("sql")
            error = validate_select_query(query)
            if error:
                add("error", "DG035", error, node_id=n.id)
        if n.type == "event":
            name = n.config.get("name")
            if not _empty(name) and not is_valid_name(name):
                add("error", "DG024", f"Invalid event name '{name}'", node_id=n.id)
            key = snake(name) if isinstance(name, str) else ""
            if key and key in seen_events:
                add("error", "DG012", f"Two events are both called '{name}'", node_id=n.id)
            seen_events[key] = n.id
            ent = n.config.get("entity")
            if ent and pascal(ent) not in {pascal(x.config.get("name", "")) for x in diagram.nodes if x.type == "entity"}:
                add("error", "DG011", f"Event '{name}' refers to a table '{ent}' that is not on the canvas", node_id=n.id)

    # --- graph checks -----------------------------------------------------
    out: dict[str, list] = {n.id: [] for n in diagram.nodes}
    for e in valid_edges:
        out[e.source].append(e)

    # cycles (3-colour DFS)
    colour: dict[str, int] = {}
    def dfs(start: str) -> bool:
        stack = [(start, iter(out[start]))]
        colour[start] = 1
        while stack:
            node, it = stack[-1]
            for e in it:
                c = colour.get(e.target, 0)
                if c == 1:
                    add("error", "DG013", "These blocks loop back on themselves; flows must end", edge_id=e.id)
                    return True
                if c == 0:
                    colour[e.target] = 1
                    stack.append((e.target, iter(out[e.target])))
                    break
            else:
                colour[node] = 2
                stack.pop()
        return False
    for n in diagram.nodes:
        if colour.get(n.id, 0) == 0 and dfs(n.id):
            break

    # reachability + references, per event
    reached: set[str] = set()
    for ev in (n for n in diagram.nodes if n.type == "event"):
        if not out[ev.id]:
            add("warning", "DG020", f"Event '{ev.config.get('name', '')}' does nothing: nothing is connected after it", node_id=ev.id)
        ent = ev.config.get("entity")
        known = entity_fields.get(pascal(ent)) if ent else None
        q, local = deque([ev.id]), {ev.id}
        while q:
            cur = q.popleft()
            for e in out[cur]:
                if e.target not in local:
                    local.add(e.target)
                    q.append(e.target)
        reached |= local
        for nid in local:
            node = nodes[nid]
            if node.type in ("set_field", "update_status") and not ent:
                add("warning", "DG030", f"'{node.label or node.type}' changes a record, but event '{ev.config.get('name', '')}' is not linked to a table, so nothing is saved", node_id=nid)
            ref = FIELD_REFS.get(node.type)
            if ref and known is not None:
                f = node.config.get(ref)
                if f and snake(f) not in known and snake(f) != "status":
                    add("warning", "DG031", f"'{f}' is not a field of {ent}; it must be sent in the event payload", node_id=nid)
            if node.type == "condition":
                branches = {e.source_handle for e in out[nid]}
                if not branches:
                    add("warning", "DG022", "If/else has no outgoing paths", node_id=nid)
                elif branches != {"true", "false"}:
                    add("info", "DG022", "If/else has only one path; nothing happens on the other branch", node_id=nid)

    for n in diagram.nodes:
        if category_of(n.type) in ("logic", "action") and n.id not in reached:
            add("warning", "DG021", f"'{n.label or n.type}' is not reachable from any event, so it will never run", node_id=n.id)
    return issues
