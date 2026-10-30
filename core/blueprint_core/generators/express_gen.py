"""Express + PostgreSQL project generator."""
from __future__ import annotations

import json

from ..ir import FlowIR, Step, SystemIR, walk_steps
from ..names import snake
from .base import GeneratedFile

PG_TYPES = {
    "string": "VARCHAR(255)", "text": "TEXT", "integer": "INTEGER",
    "number": "DOUBLE PRECISION", "boolean": "BOOLEAN", "date": "DATE",
    "datetime": "TIMESTAMPTZ",
}
ON_DELETE = {"cascade": "CASCADE", "set_null": "SET NULL", "restrict": "RESTRICT"}


def _plural(name: str) -> str:
    return snake(name) + "s"


def _node_ident(node_id: str) -> str:
    return "n_" + "".join(char if char.isalnum() else "_" for char in node_id)


def _render_steps(steps: list[Step], indent: int = 1) -> list[str]:
    pad, lines = "  " * indent, []
    if not steps:
        return [pad + "void 0;"]
    for step in steps:
        p = step.params
        lines.append(f"{pad}// block {step.node_id}")
        if step.kind == "condition":
            lines.append(f"{pad}if (compare(ctx[{p['field']!r}], {p['operator']!r}, {p['value']!r})) {{")
            lines.extend(_render_steps(step.then, indent + 1))
            if step.otherwise:
                lines.append(f"{pad}}} else {{")
                lines.extend(_render_steps(step.otherwise, indent + 1))
            lines.append(f"{pad}}}")
        elif step.kind == "set_field":
            lines.append(f"{pad}ctx[{p['field']!r}] = {p['value']!r};")
        elif step.kind == "update_status":
            lines.append(f"{pad}ctx.status = {p['status']!r};")
        elif step.kind == "sql_query":
            lines.append(f"{pad}ctx[{p['result_key']!r}] = await queryRunner({p['sql']!r}, ctx);")
        elif step.kind == "send_sms":
            lines.append(f"{pad}sendSms(ctx[{p['to_field']!r}], render({p['message']!r}, ctx));")
        elif step.kind == "send_email":
            lines.append(f"{pad}sendEmail(ctx[{p['to_field']!r}], render({p['subject']!r}, ctx), render({p['message']!r}, ctx));")
        elif step.kind == "charge_payment":
            lines.append(f"{pad}chargePayment({p['provider']!r}, ctx[{p['amount_field']!r}], ctx);")
        elif step.kind == "custom_code":
            lines.append(f"{pad}ctx = {_node_ident(step.node_id)}(ctx) || ctx;")
    return lines


def _flows(ir: SystemIR) -> str:
    custom = sorted({step.node_id for flow in ir.flows for step in walk_steps(flow.steps)
                     if step.kind == "custom_code"})
    lines = [
        *[f"const {_node_ident(node_id)} = require('./custom/{_node_ident(node_id)}');" for node_id in custom],
        "function compare(a, op, b) {",
        "  if (a == null) return op === 'eq' && b == null;",
        "  const x = Number(a), y = Number(b);",
        "  if (Number.isFinite(x) && Number.isFinite(y)) { a = x; b = y; }",
        "  else { a = String(a); b = String(b); }",
        "  return ({ eq: () => a === b, ne: () => a !== b, gt: () => a > b, gte: () => a >= b, lt: () => a < b, lte: () => a <= b, contains: () => String(a).includes(String(b)) })[op]();",
        "}",
        "function render(text, ctx) { return text.replace(/\\{([A-Za-z_][A-Za-z0-9_]*)\\}/g, (_, key) => String(ctx[key] ?? `{${key}}`)); }",
        "function sendSms() {} function sendEmail() {} function chargePayment() {}",
        "",
    ]
    for flow in ir.flows:
        lines.append(f"async function run_{flow.event}(ctx, queryRunner) {{")
        lines.extend(_render_steps(flow.steps))
        lines.extend(["  return ctx;", "}", ""])
    lines.append("const FLOWS = {")
    lines.extend(f"  {flow.event!r}: run_{flow.event}," for flow in ir.flows)
    lines.extend(["};", "module.exports = { FLOWS };", ""])
    return "\n".join(lines)


def _schema(ir: SystemIR) -> str:
    table_statements, relation_statements, constraint_statements = [], [], []
    for entity in ir.entities:
        columns = ['"id" SERIAL PRIMARY KEY']
        for field in entity.fields:
            if field.type == "many_to_many":
                continue
            if field.type == "foreign_key":
                column = f'"{field.name}_id" INTEGER'
            else:
                column = f'"{field.name}" {PG_TYPES[field.type]}'
            if field.required:
                column += " NOT NULL"
            columns.append(column)
        table_statements.append(f'  `CREATE TABLE IF NOT EXISTS "{_plural(entity.name)}" ({", ".join(columns)})`')
        for field in entity.fields:
            if field.type == "foreign_key":
                target, delete = _plural(field.target or ""), ON_DELETE.get(field.on_delete, "CASCADE")
                constraint = f"fk_{_plural(entity.name)}_{field.name}"
                constraint_statements.append(
                    f"  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '{constraint}') "
                    f'THEN ALTER TABLE "{_plural(entity.name)}" ADD CONSTRAINT "{constraint}" '
                    f'FOREIGN KEY ("{field.name}_id") REFERENCES "{target}"("id") ON DELETE {delete}; END IF; END $$`')
            elif field.type == "many_to_many":
                join_table = f"{_plural(entity.name)}_{field.name}"
                relation_statements.append(
                    f'  `CREATE TABLE IF NOT EXISTS "{join_table}" '
                    f'("{_plural(entity.name)}_id" INTEGER NOT NULL REFERENCES "{_plural(entity.name)}"("id") ON DELETE CASCADE, '
                    f'"{_plural(field.target or "")}_id" INTEGER NOT NULL REFERENCES "{_plural(field.target or "")}"("id") ON DELETE CASCADE, '
                    f'PRIMARY KEY ("{_plural(entity.name)}_id", "{_plural(field.target or "")}_id"))`')
    statements = table_statements + relation_statements + constraint_statements
    return "const SCHEMA = [\n" + ",\n".join(statements) + "\n];\n"


def _server(ir: SystemIR) -> str:
    lines = [
        "const express = require('express');",
        "const { Pool } = require('pg');",
        "const { FLOWS } = require('./flows');",
        "const { SCHEMA, initSchema } = require('./schema');",
        "",
        "const pool = new Pool({ connectionString: process.env.DATABASE_URL });",
        "const app = express(); app.use(express.json({ limit: '1mb' }));",
        "app.get('/health', (_req, res) => res.json({ status: 'ok' }));",
        "",
        "function queryRunner(sql, ctx) {",
        "  const values = [];",
        "  const statement = sql.replace(/(?<!:):([A-Za-z_][A-Za-z0-9_]*)/g, (_match, name) => {",
        "    if (!(name in ctx)) throw new Error(`Missing SQL parameter: ${name}`);",
        "    values.push(ctx[name]); return `$${values.length}`;",
        "  });",
        "  return pool.query(statement, values).then(result => result.rows);",
        "}",
        "async function hydrateRelations(table, rows, relations) {",
        "  for (const row of rows) for (const [field, targetTable, join] of relations) {",
        "    const result = await pool.query(`SELECT \"${targetTable}_id\" FROM \"${join}\" WHERE \"${table}_id\" = $1`, [row.id]);",
        "    row[field] = result.rows.map(item => item[`${targetTable}_id`]);",
        "  }",
        "  return rows;",
        "}",
        "",
    ]
    for entity in ir.entities:
        name, table = entity.name, _plural(entity.name)
        scalar = [field for field in entity.fields if field.type != "many_to_many"]
        m2m = [field for field in entity.fields if field.type == "many_to_many"]
        fields = [f.name + "_id" if f.type == "foreign_key" else f.name for f in scalar]
        relations = json.dumps([[f.name, _plural(f.target or ""), f"{table}_{f.name}"] for f in m2m])
        lines.extend([
            f"const {snake(name)}Fields = {fields!r};",
            f"const {snake(name)}Relations = {relations};",
            f"app.get('/api/{table}', async (_req, res, next) => {{ try {{",
            f"  const result = await pool.query('SELECT * FROM {table} ORDER BY id'); res.json(await hydrateRelations('{table}', result.rows, {snake(name)}Relations));",
            "} catch (error) { next(error); } });",
            f"app.get('/api/{table}/:id', async (req, res, next) => {{ try {{",
            f"  const result = await pool.query('SELECT * FROM {table} WHERE id = $1', [req.params.id]);",
            f"  if (!result.rowCount) return res.status(404).json({{ detail: 'Not found' }}); res.json((await hydrateRelations('{table}', result.rows, {snake(name)}Relations))[0]);",
            "} catch (error) { next(error); } });",
            f"app.post('/api/{table}', async (req, res, next) => {{ const client = await pool.connect(); try {{",
            "  await client.query('BEGIN');",
            f"  const fields = {snake(name)}Fields.filter(key => req.body[key] !== undefined);",
            "  const values = fields.map(key => req.body[key]);",
            f"  const result = fields.length ? await client.query('INSERT INTO {table} (' + fields.map(key => '\"' + key + '\"').join(', ') + ') VALUES (' + values.map((_, i) => '$' + (i + 1)).join(', ') + ') RETURNING *', values) : await client.query('INSERT INTO {table} DEFAULT VALUES RETURNING *');",
            f"  await setRelations(client, '{table}', result.rows[0].id, {snake(name)}Relations, req.body);",
            f"  await client.query('COMMIT'); res.status(201).json((await hydrateRelations('{table}', result.rows, {snake(name)}Relations))[0]);",
            "} catch (error) { await client.query('ROLLBACK'); next(error); } finally { client.release(); } });",
            f"app.put('/api/{table}/:id', async (req, res, next) => {{ const client = await pool.connect(); try {{",
            "  await client.query('BEGIN');",
            f"  const fields = {snake(name)}Fields.filter(key => req.body[key] !== undefined);",
            "  const values = fields.map(key => req.body[key]);",
            f"  const result = fields.length ? await client.query('UPDATE {table} SET ' + fields.map((key, i) => '\"' + key + '\" = $' + (i + 1)).join(', ') + ' WHERE id = $' + (fields.length + 1) + ' RETURNING *', [...values, req.params.id]) : await client.query('SELECT * FROM {table} WHERE id = $1', [req.params.id]);",
            "  if (!result.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ detail: 'Not found' }); }",
            f"  await setRelations(client, '{table}', req.params.id, {snake(name)}Relations, req.body);",
            f"  await client.query('COMMIT'); res.json((await hydrateRelations('{table}', result.rows, {snake(name)}Relations))[0]);",
            "} catch (error) { await client.query('ROLLBACK'); next(error); } finally { client.release(); } });",
            f"app.delete('/api/{table}/:id', async (req, res, next) => {{ try {{",
            f"  const result = await pool.query('DELETE FROM {table} WHERE id = $1', [req.params.id]);",
            "  if (!result.rowCount) return res.status(404).json({ detail: 'Not found' }); res.status(204).end();",
            "} catch (error) { next(error); } });",
            "",
        ])
    lines.extend([
        "async function setRelations(client, table, id, relations, body) {",
        "  for (const [field, targetTable, join] of relations) {",
        "    if (!Array.isArray(body[field])) continue;",
        "    await client.query(`DELETE FROM \"${join}\" WHERE \"${table}_id\" = $1`, [id]);",
        "    for (const relatedId of body[field]) await client.query(`INSERT INTO \"${join}\" (\"${table}_id\", \"${targetTable}_id\") VALUES ($1, $2) ON CONFLICT DO NOTHING`, [id, relatedId]);",
        "  }",
        "}",
        "const EVENT_ENTITIES = {",
    ])
    for flow in ir.flows:
        if not flow.entity:
            continue
        entity = ir.entity(flow.entity)
        fields = [[f.name, f.name + "_id" if f.type == "foreign_key" else f.name]
                  for f in entity.fields if f.type != "many_to_many"]
        relations = [[f.name, _plural(f.target or ""), f"{_plural(entity.name)}_{f.name}"]
                     for f in entity.fields if f.type == "many_to_many"]
        lines.append(f"  {flow.event!r}: {json.dumps({'table': _plural(entity.name), 'fields': fields, 'relations': relations})},")
    lines.extend([
        "};",
        "app.post('/api/events/:name', async (req, res, next) => { try {",
        "  const flow = FLOWS[req.params.name]; if (!flow) return res.status(404).json({ detail: 'Unknown event' });",
        "  const entity = EVENT_ENTITIES[req.params.name]; let row = null;",
        "  const context = { ...(req.body.payload || {}) };",
        "  if (entity) {",
        "    if (req.body.entity_id == null) return res.status(400).json({ detail: 'entity_id is required for this event' });",
        "    const found = await pool.query(`SELECT * FROM \"${entity.table}\" WHERE id = $1`, [req.body.entity_id]);",
        "    if (!found.rowCount) return res.status(404).json({ detail: 'Record not found' }); row = found.rows[0];",
        "    Object.assign(context, row);",
        "    for (const [field, column] of entity.fields) context[field] = row[column];",
        "  }",
        "  if (entity) for (const [field, targetTable, join] of entity.relations) {",
        "    const related = await pool.query(`SELECT \"${targetTable}_id\" FROM \"${join}\" WHERE \"${entity.table}_id\" = $1`, [req.body.entity_id]);",
        "    context[field] = related.rows.map(item => item[`${targetTable}_id`]);",
        "  }",
        "  const result = await flow(context, queryRunner);",
        "  if (entity) {",
        "    const updates = entity.fields.filter(([key]) => result[key] !== undefined);",
        "    const values = updates.map(([key]) => result[key]);",
        "    if (updates.length) await pool.query(`UPDATE \"${entity.table}\" SET ${updates.map(([, column], i) => `\"${column}\" = $${i + 1}`).join(', ')} WHERE id = $${updates.length + 1}`, [...values, req.body.entity_id]);",
        "    await setRelations(pool, entity.table, req.body.entity_id, entity.relations, result);",
        "  }",
        "  res.json({ event: req.params.name, context: result });",
        "} catch (error) { next(error); } });",
        "app.use((error, _req, res, _next) => res.status(400).json({ detail: error.message }));",
        "const port = Number(process.env.PORT || 3000);",
        "initSchema(pool).then(() => app.listen(port, () => console.log(`Listening on ${port}`))).catch(error => { console.error(error); process.exitCode = 1; });",
        "",
    ])
    return "\n".join(lines)


def generate(ir: SystemIR) -> list[GeneratedFile]:
    schema = _schema(ir)
    schema += "\nasync function initSchema(pool) { for (const statement of SCHEMA) await pool.query(statement); }\nmodule.exports = { SCHEMA, initSchema };\n"
    files = [
        GeneratedFile("src/schema.js", schema),
        GeneratedFile("src/flows.js", _flows(ir)),
        GeneratedFile("src/server.js", _server(ir)),
        GeneratedFile("src/custom/.gitkeep", "", overwrite=False),
        GeneratedFile("package.json", '{"name":"blueprint-express-app","version":"1.0.0","private":true,"scripts":{"start":"node src/server.js"},"dependencies":{"express":"^4.21.0","pg":"^8.13.0"}}\n'),
        GeneratedFile(".env.example", "DATABASE_URL=postgres://user:password@localhost:5432/blueprint\nPORT=3000\n"),
        GeneratedFile(".gitignore", "node_modules/\n.env\n"),
        GeneratedFile("README.md", f"# {ir.name}\n\nGenerated Express API backed by PostgreSQL.\n\n1. Copy `.env.example` to `.env` and set `DATABASE_URL`.\n2. Run `npm install` and `npm start`.\n\nCRUD routes are under `/api/`; event flows use `/api/events/:name`. SQL query blocks accept named `:parameter` values from event payloads and execute only validated read-only SELECT statements.\n"),
    ]
    seen = set()
    for flow in ir.flows:
        for step in walk_steps(flow.steps):
            if step.kind == "custom_code" and step.node_id not in seen:
                seen.add(step.node_id)
                files.append(GeneratedFile(
                    f"src/custom/{_node_ident(step.node_id)}.js",
                    f"// AI-implementable custom block. Description: {step.params.get('description', '').strip()!r}\n"
                    "module.exports = function run(ctx) {\n  return ctx;\n};\n",
                    overwrite=False))
    return files
