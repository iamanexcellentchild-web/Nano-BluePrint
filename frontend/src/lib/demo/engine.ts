// Browser-side stand-in for blueprint_core: validate() and simulate().
// Only used in demo mode; the real Django API replaces all of this.
import { pascal, snake } from "../names";
import type { BlockDef, Diagram, DiagramEdge, DiagramNode, Issue, SimResult, TraceStep } from "../types";
import { LIBRARY } from "./library";

type FieldDef = { name: string; type: string; required?: boolean; target?: string; on_delete?: string };

const str = (v: unknown): string => (typeof v === "string" ? v : v === null || v === undefined ? "" : String(v));
const blockDef = (type: string): BlockDef | undefined => LIBRARY.blocks.find((b) => b.type === type);
const cfg = (n: DiagramNode, key: string): unknown => n.config[key];

const fieldsOf = (n: DiagramNode): FieldDef[] => {
  const raw = n.config["fields"];
  return Array.isArray(raw) ? (raw as FieldDef[]).filter((f) => f && typeof f === "object") : [];
};

const RESERVED_SQL = /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|attach|pragma|merge|replace)\b/i;
const NAME_RE = /^[a-z][a-z0-9_]*$/;

const issue = (
  level: Issue["level"],
  code: string,
  message: string,
  node_id: string | null = null,
  edge_id: string | null = null,
): Issue => ({ level, code, message, node_id, edge_id });

/** Edges leaving a node, in the order they were drawn. */
const outgoing = (d: Diagram, id: string): DiagramEdge[] => d.edges.filter((e) => e.source === id);

const tablesOf = (d: Diagram): DiagramNode[] => d.nodes.filter((n) => n.type === "entity");

const findTable = (d: Diagram, name: string): DiagramNode | undefined =>
  name ? tablesOf(d).find((t) => pascal(str(t.config["name"])) === pascal(name)) : undefined;

// ---------------------------------------------------------------------------
// validate
// ---------------------------------------------------------------------------

export function validate(d: Diagram): Issue[] {
  const issues: Issue[] = [];
  const byId = new Map<string, DiagramNode>();

  for (const n of d.nodes) {
    if (byId.has(n.id)) issues.push(issue("error", "DG002", `Two blocks share the id "${n.id}".`, n.id));
    byId.set(n.id, n);
    const def = blockDef(n.type);
    if (!def) {
      issues.push(issue("error", "DG001", `Unknown block type "${n.type}".`, n.id));
      continue;
    }
    for (const f of def.config_fields) {
      if (!f.required) continue;
      const v = n.config[f.key];
      const missing = f.kind === "fields" ? !Array.isArray(v) || v.length === 0 : str(v).trim() === "";
      if (missing) issues.push(issue("error", "DG005", `“${n.label || def.label}” needs “${f.label}”.`, n.id));
    }
  }

  // connections
  for (const e of d.edges) {
    const from = byId.get(e.source);
    const to = byId.get(e.target);
    if (!from || !to) {
      issues.push(issue("error", "DG003", "A connection points to a block that no longer exists.", null, e.id));
      continue;
    }
    const a = blockDef(from.type);
    const b = blockDef(to.type);
    if (!a || !b) continue;
    const allowed = b.inputs && LIBRARY.allowed_connections.some(([x, y]) => x === a.category && y === b.category);
    if (!allowed) {
      issues.push(issue("error", "DG004", `${a.label} can’t connect to ${b.label}.`, from.id, e.id));
    }
    const isCondition = from.type === "condition";
    const okHandle = isCondition ? e.source_handle === "true" || e.source_handle === "false" : e.source_handle === null;
    if (!okHandle) {
      issues.push(issue("error", "DG006", isCondition ? "Connections from If/else must leave through yes or no." : "Only If/else blocks have yes/no outputs.", from.id, e.id));
    }
  }

  // tables
  const seenTables = new Set<string>();
  for (const t of tablesOf(d)) {
    const name = pascal(str(t.config["name"]));
    if (name && !/^[A-Z][A-Za-z0-9]*$/.test(name)) {
      issues.push(issue("error", "DG024", `“${str(t.config["name"])}” isn’t a valid table name. Use letters and numbers.`, t.id));
    }
    if (name && seenTables.has(name)) issues.push(issue("error", "DG010", `There are two tables called ${name}.`, t.id));
    seenTables.add(name);

    const seenFields = new Set<string>();
    for (const f of fieldsOf(t)) {
      const fname = snake(str(f.name));
      if (!NAME_RE.test(fname)) {
        issues.push(issue("error", "DG023", `Field “${str(f.name)}” on ${name || "a table"} needs a name like “order_total”.`, t.id));
        continue;
      }
      if (fname === "id") issues.push(issue("error", "DG023", `“id” is added for you on ${name}; pick another field name.`, t.id));
      if (seenFields.has(fname)) issues.push(issue("error", "DG023", `${name} has two fields called ${fname}.`, t.id));
      seenFields.add(fname);

      const isRelation = LIBRARY.relation_types.includes(f.type);
      if (!isRelation && !LIBRARY.field_types.includes(f.type)) {
        issues.push(issue("error", "DG023", `Field ${fname} has an unknown type “${f.type}”.`, t.id));
      }
      if (isRelation) {
        if (!f.target || !findTable(d, f.target)) {
          issues.push(issue("error", "DG032", `${name}.${fname} points to a table that doesn’t exist.`, t.id));
        }
        if (f.type === "foreign_key" && f.on_delete && !LIBRARY.delete_behaviors.includes(f.on_delete)) {
          issues.push(issue("error", "DG033", `${name}.${fname} has an unknown delete behavior.`, t.id));
        }
        if (f.type === "many_to_many" && f.required) {
          issues.push(issue("error", "DG034", `${name}.${fname} is many-to-many, so it can’t be required.`, t.id));
        }
      }
    }
  }

  // events
  const events = d.nodes.filter((n) => n.type === "event");
  const seenEvents = new Set<string>();
  for (const ev of events) {
    const raw = str(ev.config["name"]);
    const name = snake(raw);
    if (raw && !NAME_RE.test(name)) {
      issues.push(issue("error", "DG024", `“${raw}” isn’t a valid event name. Use lowercase words like order_placed.`, ev.id));
    }
    if (name && seenEvents.has(name)) issues.push(issue("error", "DG012", `There are two events called ${name}.`, ev.id));
    seenEvents.add(name);

    const entity = str(ev.config["entity"]);
    if (entity && !findTable(d, entity)) {
      issues.push(issue("error", "DG011", `Event ${name || ""} is about “${entity}”, but there is no such table.`, ev.id));
    }
  }

  // loops
  const color = new Map<string, 1 | 2>();
  let loopAt: string | null = null;
  const visit = (id: string): void => {
    if (loopAt) return;
    color.set(id, 1);
    for (const e of outgoing(d, id)) {
      if (!byId.has(e.target)) continue;
      const c = color.get(e.target);
      if (c === 1) {
        loopAt = e.target;
        return;
      }
      if (c === undefined) visit(e.target);
    }
    color.set(id, 2);
  };
  for (const n of d.nodes) if (!color.has(n.id)) visit(n.id);
  if (loopAt) issues.push(issue("error", "DG013", "These blocks loop back on themselves. Flows can’t loop yet.", loopAt));

  // reachability + flow warnings
  const reachable = new Set<string>();
  const walk = (id: string): void => {
    if (reachable.has(id)) return;
    reachable.add(id);
    for (const e of outgoing(d, id)) walk(e.target);
  };
  for (const ev of events) {
    walk(ev.id);
    if (outgoing(d, ev.id).length === 0) {
      issues.push(issue("warning", "DG020", `Event “${ev.label || str(ev.config["name"])}” has nothing after it yet.`, ev.id));
    }
  }
  for (const n of d.nodes) {
    const def = blockDef(n.type);
    if (!def || (def.category !== "action" && def.category !== "logic")) continue;
    if (!reachable.has(n.id)) {
      issues.push(issue("warning", "DG021", `“${n.label || def.label}” isn’t connected to any event, so it never runs.`, n.id));
    }
  }
  for (const n of d.nodes.filter((x) => x.type === "condition")) {
    const handles = new Set(outgoing(d, n.id).map((e) => e.source_handle));
    if (!handles.has("true") && !handles.has("false")) {
      issues.push(issue("warning", "DG022", `“${n.label || "If/else"}” has no yes or no path.`, n.id));
    } else if (!handles.has("true") || !handles.has("false")) {
      issues.push(issue("info", "DG022", `“${n.label || "If/else"}” only has a ${handles.has("true") ? "yes" : "no"} path.`, n.id));
    }
  }

  // field references against the event's table
  for (const ev of events) {
    const table = findTable(d, str(ev.config["entity"]));
    const known = new Set(table ? fieldsOf(table).map((f) => snake(str(f.name))) : []);
    const seen = new Set<string>();
    const check = (id: string): void => {
      if (seen.has(id)) return;
      seen.add(id);
      const n = byId.get(id);
      if (!n) return;
      if (n.type === "set_field" && n.config["field"] !== undefined && !table) {
        issues.push(issue("warning", "DG030", `“${n.label}” changes a record, but the event has no table.`, n.id));
      } else if (table) {
        for (const key of ["field", "to_field", "amount_field"]) {
          const ref = snake(str(n.config[key]));
          if (ref && !known.has(ref) && (n.type !== "set_field" || key === "field")) {
            issues.push(issue("warning", "DG031", `“${ref}” isn’t a field on ${str(table.config["name"])}; it must come in the event data.`, n.id));
          }
        }
      }
      for (const e of outgoing(d, id)) check(e.target);
    };
    for (const e of outgoing(d, ev.id)) check(e.target);
  }

  // SQL
  for (const n of d.nodes.filter((x) => x.type === "sql_query")) {
    const sql = str(n.config["sql"]).trim().replace(/;\s*$/, "");
    const ok = /^(select|with)\b/i.test(sql) && !sql.includes(";") && !RESERVED_SQL.test(sql);
    if (sql && !ok) issues.push(issue("error", "DG035", "Queries must be a single read-only SELECT.", n.id));
  }

  return issues;
}

// ---------------------------------------------------------------------------
// simulate
// ---------------------------------------------------------------------------

const render = (template: string, ctx: Record<string, unknown>): string =>
  template.replace(/\{(\w+)\}/g, (_m, key: string) => str(ctx[key]));

const coerce = (value: string, type: string | undefined): unknown => {
  if (type === "integer") return Number.parseInt(value, 10) || 0;
  if (type === "number") return Number(value) || 0;
  if (type === "boolean") return value.toLowerCase() === "true";
  return value;
};

function compare(actual: unknown, op: string, expected: string): boolean {
  if (op === "contains") return str(actual).toLowerCase().includes(expected.toLowerCase());
  let a: string | number | boolean = typeof actual === "number" || typeof actual === "boolean" ? actual : str(actual);
  let b: string | number | boolean = expected;
  if (typeof a === "number") b = Number(expected);
  else if (typeof a === "boolean") b = expected.toLowerCase() === "true";
  if (typeof a === "string" && typeof b === "string") {
    a = a.toLowerCase();
    b = b.toLowerCase();
  }
  switch (op) {
    case "eq": return a === b;
    case "ne": return a !== b;
    case "gt": return a > b;
    case "gte": return a >= b;
    case "lt": return a < b;
    case "lte": return a <= b;
    default: return false;
  }
}

export function simulate(d: Diagram, eventName: string, payload: Record<string, unknown>): SimResult {
  const errors = validate(d).filter((i) => i.level === "error");
  const fail = (error: string, trace: TraceStep[] = [], context: Record<string, unknown> = payload): SimResult => ({
    ok: false,
    trace,
    context,
    error,
  });
  if (errors[0]) return fail(`Fix this first: ${errors[0].message}`);

  const ev = d.nodes.find((n) => n.type === "event" && snake(str(n.config["name"])) === snake(eventName));
  if (!ev) return fail(`There is no event called “${eventName}”.`);

  const table = findTable(d, str(ev.config["entity"]));
  const typeOf = (field: string): string | undefined =>
    table ? fieldsOf(table).find((f) => snake(str(f.name)) === snake(field))?.type : undefined;

  const ctx: Record<string, unknown> = { ...payload };
  const trace: TraceStep[] = [{ node_id: ev.id, kind: "event", summary: `Event ${snake(eventName)} received` }];
  const byId = new Map(d.nodes.map((n) => [n.id, n]));

  const run = (id: string): void => {
    const n = byId.get(id);
    if (!n) return;
    const label = n.label || blockDef(n.type)?.label || n.type;
    const step = (summary: string, branch?: string): void => {
      trace.push({ node_id: n.id, kind: n.type, summary, ...(branch ? { branch } : {}) });
    };
    let handle: string | null = null;

    switch (n.type) {
      case "set_field": {
        const field = snake(str(cfg(n, "field")));
        ctx[field] = coerce(render(str(cfg(n, "value")), ctx), typeOf(field));
        step(`Set ${field} to ${JSON.stringify(ctx[field])}`);
        break;
      }
      case "update_status":
        ctx["status"] = str(cfg(n, "status"));
        step(`Status is now “${str(ctx["status"])}”`);
        break;
      case "condition": {
        const field = snake(str(cfg(n, "field")));
        const op = str(cfg(n, "operator")) || "eq";
        const result = compare(ctx[field], op, str(cfg(n, "value")));
        handle = result ? "true" : "false";
        step(`Checked ${field} ${op} ${str(cfg(n, "value"))}: ${result ? "yes" : "no"}`, handle);
        break;
      }
      case "send_sms":
        step(`(Simulated) SMS to ${str(ctx[snake(str(cfg(n, "to_field")))]) || "?"}: “${render(str(cfg(n, "message")), ctx)}”`);
        break;
      case "send_email":
        step(`(Simulated) Email to ${str(ctx[snake(str(cfg(n, "to_field")))]) || "?"}, subject “${render(str(cfg(n, "subject")), ctx)}”`);
        break;
      case "charge_payment":
        ctx["payment_status"] = "paid";
        step(`(Simulated) Charged ${str(ctx[snake(str(cfg(n, "amount_field")))]) || 0} through ${str(cfg(n, "provider"))}`);
        break;
      case "sql_query":
        ctx[str(cfg(n, "result_key")) || "rows"] = [];
        step(`(Simulated) Ran query “${str(cfg(n, "name"))}”; the demo returns no rows`);
        break;
      case "custom_code":
        step(`Custom code placeholder: ${str(cfg(n, "description")) || label}`);
        break;
      default:
        step(label);
    }

    for (const e of outgoing(d, n.id)) {
      if (n.type === "condition" && e.source_handle !== handle) continue;
      run(e.target);
    }
  };

  for (const e of outgoing(d, ev.id)) run(e.target);
  return { ok: true, trace, context: ctx, error: null };
}
