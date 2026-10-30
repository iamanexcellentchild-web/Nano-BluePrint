# Architecture

## Pipeline

```
React Flow canvas  --(Diagram JSON)-->  Django API  --calls-->  blueprint_core
                                                                 |- validate(diagram)  -> [Issue]
                                                                 |- compile_ir(diagram)-> SystemIR
                                                                 |- simulate(ir, ...)  -> trace
                                                                 '- generate(ir, target)-> [GeneratedFile]
```

The **diagram is the source of truth**. Code is output. The AI edits the diagram, so everything stays
explainable, reviewable and regenerable.

## Key decisions

1. **`core` is framework-free.** No Django/FastAPI imports. It can be tested, run from a CLI, or embedded elsewhere.
2. **Blocks are data** (`block_library.py`). The API serves them to the UI, so the palette, inspector and
   connection rules cannot drift from what the backend accepts.
3. **Typed connections.** Connections are checked by *category* (e.g. event -> action ok, entity -> sms refused),
   in both the canvas (`canConnect` in `store.ts`) and the validator (`DG004`). Keep them in sync via `allowed_connections`.
4. **Neutral IR between diagram and code.** Generators read the IR, never the canvas JSON. A new framework = one new generator.
5. **Deterministic generation.** Same diagram -> same code. AI is not in the generation path.
6. **One runtime, two consumers.** `runtime_support.py` is used by the simulator *and* copied into generated
   projects as `app/runtime.py`, so "what the simulator shows" is "what the backend does". A test enforces this.
7. **Regeneration safety.** Generated files are overwritten; developer-owned files (`integrations.py`,
   `custom/*.py`) are `overwrite=False` and written once.
8. **Versioned saves.** Every save is a new `DiagramVersion`; nothing is edited in place.
9. **AI proposals are verified.** `projects/ai.py` applies the model's JSON Patch to a copy, re-validates it,
   discards proposals that add errors, and the user must click Apply. Diagram text is treated as data, not instructions.

## Flow semantics (important)

* An **event** starts a flow. Blocks connected after it run **in connection order**.
* An **If/else** has a `true` and `false` output; each branch is its own sequence.
* A block reachable by two paths is **duplicated** in the IR (no joins yet). Fine for small flows.
* Loops are rejected (`DG013`).
* The event handler loads the record (if the event has a table), merges the request payload, runs the steps
  on a context dict, then persists only the columns the flow changed.

## Security notes

* Anonymous access exists **only when `DEBUG=1`** (`projects/permissions.py`). Production requires auth.
* Diagram size capped (`BLUEPRINT_MAX_NODES`, request body 5 MB). AI and generate endpoints are throttled.
* Generated code embeds user text only through Python `repr()` literals (tested), never string-concatenated code.
* Generated apps have **no authentication** on their API yet. Treat them as scaffolds (see roadmap).
