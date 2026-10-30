# Extending Blueprint

## Add a block type (example: `send_whatsapp`)
1. `core/blueprint_core/block_library.py`: add an entry to `BLOCKS` (category, label, outputs, `config_fields`, `defaults`).
   If it references a record field, add it to `FIELD_REFS`.
2. `core/blueprint_core/ir.py`: add the type to `STEP_KINDS` (so it compiles into a `Step`).
3. `core/blueprint_core/simulate.py`: add an `elif` producing a readable trace summary.
4. Each generator (`generators/fastapi_gen.py` -> `_render_steps`): emit code; add a stub in `integrations.py` if needed.
5. Add a test in `core/tests/test_core.py` and a payload sample in `SAMPLES` if you added an event.
The frontend needs **no change**: palette, inspector form and connection rules come from the API.
Only the `summary()` helper in `BlockNode.tsx` may be tweaked for a nicer one-line preview.

## Add a template
Drop a diagram JSON in `core/blueprint_core/templates/<id>.json` (export from the canvas, or copy an existing one).
Add its events to `SAMPLES` in `core/tests/test_core.py`; the tests then validate it and check generated-code parity.

## Add a generator target
1. Create `generators/<target>_gen.py` exposing `generate(ir) -> list[GeneratedFile]`.
2. Register it in `generators/__init__.py` (`TARGETS`). The API and UI pick it up via `target`.
3. Reuse the same behaviour contract as FastAPI: CRUD routes per table, `POST /events/<name>`, flows as one function per event,
   write-once integration/custom files, and generated tests.
4. Add a parity-style test. If you cannot run it in Python, run the generated project's own test suite in CI.
Proving the IR drives two targets is the real test that it is framework-neutral.

The built-in targets are FastAPI, Django, and Express. FastAPI and Express use PostgreSQL;
Django uses SQLite by default. Diagram relationships are foreign keys
and many-to-many fields. SQL query blocks accept named `:parameter` values from event
payloads and only allow a single read-only SELECT/CTE statement.

## Replace the hand-written validation with Pydantic (optional)
Keep the dataclasses as the internal model; define Pydantic models mirroring `model.py` at the API boundary,
export `model_json_schema()` and generate TypeScript types from it (e.g. `json-schema-to-typescript`).
