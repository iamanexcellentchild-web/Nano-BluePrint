# Product Requirements Document: Blueprint

**Project:** Nano-BluePrint (product name: **Blueprint**)  
**Version:** 1.0  
**Status:** Draft  
**Owner:** Product / Engineering

---

## 1. Overview

**Blueprint** is a visual canvas for designing the **business logic** of a website — orders, bookings, enrolments, payments, notifications — from building blocks. A user drags blocks onto a canvas, connects them into flows, and the system validates, simulates, and generates runnable backend code (FastAPI, Django, or Express) from the diagram.

**Core principle:** The diagram is the source of truth; code is output. The AI assistant edits the diagram (never code directly), so everything stays explainable, reviewable, and regenerable.

### Value proposition
- **Non-technical owners** can model business logic visually without writing code.
- **Developers** get a scaffolded, runnable project (FastAPI / Django / Express) that matches the diagram exactly, with deterministic generation.
- **Product teams** can simulate a flow end-to-end before a line of production code is written.

---

## 2. Problem Statement

Small teams building web applications spend significant engineering time hand-coding CRUD, event handlers, status transitions, and notification flows — often without first validating that the business process itself is correct. There is no low-code tool that:

1. Lets a business owner visually model domain logic (entities, events, conditions, actions).
2. Validates that model (typed connections, no loops, valid field names).
3. Simulates the flow on the canvas with a trace.
4. Generates a runnable, framework-specific project from a neutral intermediate representation (IR).

Existing no-code tools lock users into proprietary runtimes; Blueprint generates standard framework code the team owns and can evolve.

---

## 3. Goals & Non-Goals

### Goals (MVP / current)
| # | Goal |
|---|------|
| G1 | A visual canvas (React Flow) for placing blocks and connecting them into flows. |
| G2 | Starter templates (e-commerce, booking, LMS) so users don't start from blank. |
| G3 | Validation of diagrams with clear error/warning codes (DG001–DG035). |
| G4 | Simulation of an event flow with a step trace and resulting context. |
| G5 | Code generation to three targets: FastAPI, Django, Express. |
| G6 | Versioned diagram saves (every save = new `DiagramVersion`, nothing edited in place). |
| G7 | AI assistant that proposes diagram edits (JSON Patch), verified by the validator before the user accepts. |
| G8 | REST API (Django + DRF) serving blocks, templates, projects, validate/simulate/generate/AI endpoints. |
| G9 | Core engine (`blueprint_core`) is pure Python stdlib, framework-free, CLI-runnable, and testable. |
| G10 | Regeneration safety: generated files are overwritten; developer-owned files (`integrations.py`, `custom/*.py`) are write-once. |

### Non-Goals (explicitly out of scope for v1)
| # | Non-Goal | Reason |
|---|----------|--------|
| NG1 | Authentication/authorization on *generated* project APIs | Scaffold only; see roadmap |
| NG2 | Joins in flows (a block reachable by two paths is duplicated) | Simplifies IR; roadmap item |
| NG3 | Loops | Rejected (`DG013`) |
| NG4 | Scheduled/delayed events | Roadmap |
| NG5 | Multi-user real-time collaboration | Roadmap |
| NG6 | Generated-project Alembic migrations / diffing IR versions | Roadmap |
| NG7 | Frontend login screen (auth token endpoints exist, but no UI) | Roadmap |

---

## 4. Target Audience / Personas

| Persona | Role | Needs |
|---------|------|-------|
| **Business Owner** | Runs a shop / service | Model orders/bookings visually, simulate before building, export runnable code |
| **Product Manager** | Specifies features | Review diagram as source of truth, iterate quickly with AI suggestions |
| **Developer** | Implements the backend | Generate FastAPI/Django/Express scaffold, extend with custom code blocks, own the output |
| **QA / Tester** | Validates behavior | Run simulator traces, inspect generated tests |

---

## 5. Core Features & User Stories

### 5.1 Canvas & Diagram Modeling
**US-1** As a user, I can drag blocks from a palette onto a canvas and connect them, so I can model my business process visually.
**US-2** As a user, I can configure each block (entity fields, event name, condition operator, message template, etc.) via an inspector panel.
**US-3** As a user, I can start from a starter template (e-commerce, booking, LMS) and customize it.
**US-4** As a user, I see block categories color-coded: Data (tables), Actors (people), Events (triggers), Rules (conditions), Actions (do something), Integrations (external services).

### 5.2 Block Library
**US-5** The system offers these block types:

| Type | Category | Purpose |
|------|----------|---------|
| `entity` | Data | Table with scalar/relation fields (`foreign_key`, `many_to_many`) |
| `actor` | Actor | Person/role who can cause events (documentation) |
| `event` | Trigger | Starts a flow; becomes `POST /events/<name>` |
| `condition` | Logic | If/else branch on a field/operator/value |
| `set_field` | Action | Write a value to a record field |
| `update_status` | Action | Change record status (adds `status` column if missing) |
| `send_sms` / `send_email` | Action | Notify via `{field}` placeholders |
| `charge_payment` | Action | Charge via Paystack / Flutterwave / Stripe |
| `custom_code` | Action | Escape hatch → write-once stub file |
| `sql_query` | Action | Parameterized read-only SELECT/CTE using `:name` from payload |
| `provider` | Integration | Document an external service (documentation) |

**US-6** Connections are typed: e.g. `trigger → logic/action` OK, `entity → sms` refused. Rules enforced identically on the canvas (`store.ts`) and validator (`DG004`).

### 5.3 Validation
**US-7** As a user, I get immediate feedback on my diagram via validation issues with codes and levels:

| Code | Level | Meaning |
|------|-------|---------|
| DG001 | error | unknown block type |
| DG002 | error | duplicate block id |
| DG003 | error | connection to missing block |
| DG004 | error | connection not allowed between categories |
| DG005 | error | required config missing |
| DG006 | error | wrong output handle (If/else needs true/false) |
| DG010 | error | duplicate table name |
| DG011 | error | event refers to unknown table |
| DG012 | error | duplicate event name |
| DG013 | error | loop |
| DG020–DG022 | warning | unreachable blocks, empty branches, dangling events |
| DG023–DG035 | error/warning | field/table/name/relation/query validity |

**US-8** Generation is blocked when validation errors exist.

### 5.4 Simulation
**US-9** As a user, I can run an event with a payload on the canvas and see a step-by-step trace (which blocks ran, in what order) plus the resulting context.
**US-10** Simulation uses the same runtime (`runtime_support.py`) as generated projects, so simulator output matches backend behavior (enforced by test).

### 5.5 Code Generation
**US-11** As a user, I choose a target (FastAPI, Django, Express) and generate a runnable project zip.
**US-12** Generated output is deterministic: same diagram → same code. AI is not in the generation path.
**US-13** Generated projects include: CRUD routes per table, `POST /events/<name>`, one function per event flow, write-once integration/custom files, and generated tests.
**US-14** Regeneration overwrites generated files but never touches developer-owned files (`integrations.py`, `custom/*.py`).

### 5.6 Versioning
**US-15** Every diagram save creates a new `DiagramVersion`; nothing is edited in place. Users can list history and restore a prior version.
**US-16** Projects can be created from a template (`{name, template?}`).

### 5.7 AI Assistant
**US-17** As a user, I can ask the AI to **explain** my diagram in plain words.
**US-18** As a user, I can ask the AI to **suggest** improvements (e.g. add refund path, failed payment, cancellation). The model returns an RFC 6902 JSON Patch applied to a copy of the diagram.
**US-19** Every AI proposal is re-validated; if it introduces more errors than before, it is discarded. The user must explicitly **Apply** the accepted patch on the canvas.
**US-20** Diagram content is treated as untrusted data — the model never follows instructions embedded in the diagram.
**US-21** AI-assisted generation produces a review doc + safe custom-block function bodies (syntax-checked, no imports/network/eval).
**US-22** AI requires `GROQ_API_KEY` (default model `llama-3.3-70b-versatile`, overridable via `GROQ_MODEL`).

---

## 6. Functional Requirements

### FR-1: Core Engine (`blueprint_core`)
- FR-1.1 Pure Python, stdlib-only, no Django/FastAPI imports.
- FR-1.2 CLI: `validate`, `simulate`, `generate` subcommands.
- FR-1.3 `validate(diagram) -> [Issue]` returns issues with code/level/message.
- FR-1.4 `compile_ir(diagram) -> SystemIR` (refuses diagrams with errors).
- FR-1.5 `simulate(ir, event, payload) -> trace, context`.
- FR-1.6 `generate(ir, target) -> [GeneratedFile]` for fastapi/django/express.
- FR-1.7 Neutral IR: `SystemIR { name, entities[], flows[], roles[], providers[] }`.

### FR-2: Backend API (Django + DRF)
- FR-2.1 `GET /api/blocks/` — block library, categories, allowed connections.
- FR-2.2 `GET /api/templates/`, `GET /api/templates/<id>/` — starter diagrams.
- FR-2.3 `GET/POST /api/projects/` — list/create (`{name, template?}`).
- FR-2.4 `GET /api/projects/<id>/latest/` — latest saved diagram.
- FR-2.5 `GET/POST /api/projects/<id>/versions/` — history / save new version (`{diagram, note?}`).
- FR-2.6 `POST /api/validate/` — `{diagram} -> {issues, has_errors}`.
- FR-2.7 `POST /api/simulate/` — `{diagram, event, payload} -> {ok, trace[], context}`.
- FR-2.8 `POST /api/generate/` — `{diagram, target} -> zip` (400 if validation errors).
- FR-2.9 `POST /api/generate/ai/` — AI-assisted zip (requires `GROQ_API_KEY`).
- FR-2.10 `POST /api/ai/` — `{mode: explain|suggest, diagram, question}`.
- FR-2.11 `POST /api/auth/register/`, `POST /api/auth/token/` — accounts + token auth.
- FR-2.12 Anonymous access allowed only when `DEBUG=1`; production requires auth.
- FR-2.13 OpenAPI docs at `/api/docs/`.
- FR-2.14 Rate limits on AI and generate endpoints; request body capped at 5 MB; `BLUEPRINT_MAX_NODES` cap.

### FR-3: Frontend (React + TypeScript + React Flow)
- FR-3.1 Canvas with palette, inspector, issues panel, simulator panel, AI panel, launcher.
- FR-3.2 `canConnect` in `store.ts` mirrors validator `ALLOWED_CONNECTIONS`.
- FR-3.3 Proxies `/api` to backend `:8000`.
- FR-3.4 Reads auth token from `localStorage.blueprint_token` (no login UI yet).
- FR-3.5 Passes `npm run typecheck`.

### FR-4: Generated Project Contract (all targets)
- FR-4.1 CRUD routes per table.
- FR-4.2 `POST /events/<name>` per event flow.
- FR-4.3 One function per event; steps as `# block <id>` comments for traceability.
- FR-4.4 Write-once files: `integrations.py`, `custom/*.py` (never overwritten).
- FR-4.5 Generated tests included.
- FR-4.6 FastAPI & Express use PostgreSQL; Django uses SQLite by default.
- FR-4.7 SQL query blocks: single read-only SELECT/CTE with `:parameter` bindings.

---

## 7. Non-Functional Requirements

| ID | Requirement | Criterion |
|----|-------------|-----------|
| NF-1 | Determinism | Same diagram + target → identical generated code |
| NF-2 | Safety | AI proposals never increase error count; user must Apply |
| NF-3 | Testability | Core engine 21+ unit tests; backend API tests; frontend typecheck |
| NF-4 | Framework neutrality | New target = one new generator reading IR, never canvas JSON |
| NF-5 | Regeneration safety | Generated files overwritten; developer-owned files write-once |
| NF-6 | Security | Diagram text as data (never instructions); user text embedded via `repr()` literals, never string-concatenated code; auth required unless `DEBUG=1` |
| NF-7 | Performance | Request body ≤ 5 MB; node cap via `BLUEPRINT_MAX_NODES` |
| NF-8 | Portability | Core runs anywhere Python exists; frontend Node 18+ |

---

## 8. Architecture (High Level)

```
React Flow canvas  --(Diagram JSON)-->  Django API  --calls-->  blueprint_core
                                                                  |- validate(diagram)  -> [Issue]
                                                                  |- compile_ir(diagram)-> SystemIR
                                                                  |- simulate(ir, ...)  -> trace
                                                                  '- generate(ir, target)-> [GeneratedFile]
```

- **Diagram is the source of truth.** Code is output.
- **Blocks are data** (`block_library.py`) served to the frontend, so palette/inspector/connection rules cannot drift from the validator.
- **Neutral IR** sits between diagram and code; generators read IR only.
- **One runtime, two consumers:** `runtime_support.py` is used by the simulator and copied into generated projects as `app/runtime.py`; simulator output == backend behavior.

---

## 9. Data Model

### Diagram JSON (canvas save format)
```json
{
  "schema_version": "1",
  "name": "Online shop",
  "nodes": [
    {"id": "order", "type": "entity", "label": "Order", "position": {"x": 0, "y": 0},
     "config": {"name": "Order", "fields": [
       {"name": "total", "type": "number", "required": true},
       {"name": "customer", "type": "foreign_key", "target": "Customer", "on_delete": "cascade"},
       {"name": "tags", "type": "many_to_many", "target": "Tag"}
     ]}},
    {"id": "ev", "type": "event", "label": "Order placed", "position": {"x": 300, "y": 0},
     "config": {"name": "order_placed", "entity": "Order"}}
  ],
  "edges": [{"id": "e1", "source": "order", "target": "ev", "source_handle": null}]
}
```
Edges leaving an If/else set `source_handle` to `"true"` or `"false"`; all others use `null`.

### IR (`SystemIR`)
```
SystemIR { name, entities[EntityIR], flows[FlowIR], roles[RoleIR], providers[str] }
EntityIR   { name (Pascal), fields[{name (snake), type, required, target?, on_delete?}], node_id }
FlowIR     { event (snake), trigger_node_id, entity?, steps[Step] }
Step       { node_id, kind, params, then[Step], otherwise[Step] }  # then/otherwise for conditions
```

### Backend models (Django)
- `Project` — name, timestamps
- `DiagramVersion` — versioned snapshot of a diagram (`diagram`, `note`)
- Auth via DRF token (`Authorization: Token <key>`)

---

## 10. Flow Semantics

- An **event** starts a flow. Blocks connected after it run **in connection order**.
- An **If/else** has `true` and `false` outputs; each branch is its own sequence.
- A block reachable by two paths is **duplicated** in the IR (no joins yet).
- **Loops are rejected** (`DG013`).
- The event handler loads the record (if the event has a table), merges the request payload, runs the steps on a context dict, then persists only the columns the flow changed.

---

## 11. Security

| Concern | Control |
|---------|---------|
| Anonymous access | Only when `DEBUG=1`; production requires token auth |
| AI prompt injection | Diagram text treated as data, never instructions |
| Generated code injection | User text embedded via Python `repr()` literals, never string-concatenated |
| AI code sandbox | Custom block bodies syntax-checked; imports/network/eval/subprocess forbidden |
| Rate limiting | AI and generate endpoints throttled |
| Size limits | Request body capped at 5 MB; `BLUEPRINT_MAX_NODES` |
| Generated APIs | No authentication yet — treat as scaffolds |

---

## 12. Release Phases / Roadmap

| Phase | Focus | Key items |
|-------|-------|-----------|
| **Phase 1 (current / MVP)** | Core + canvas + generate | Validation, simulation, 3 generators, versioning, AI suggest/explain |
| **Phase 2** | End-to-end + auth | Run FastAPI/Express against PostgreSQL (FK, M2M, parameterized queries); frontend login screen |
| **Phase 3** | Generated project quality | Alembic-style migrations from IR diffs, auth on generated APIs, real provider adapters, Dockerfile |
| **Phase 4** | Flow semantics | Joins (no duplicated steps), loops over line items, delays/scheduled events, actor-based status-transition rules |
| **Phase 5** | Blocks & templates | Inventory/stock, SMS campaigns, LMS lessons/quizzes, roles & permissions enforcement |
| **Phase 6** | UX & scale | Grouping/sub-flows, background jobs (Celery + Redis) + SSE progress for slow generation/AI |
| **Phase 7** | AI & collaboration | AI interview mode, scenario checker, plain-language rule → condition, GitHub push of generated output, storefront generation, multi-user collaboration |

---

## 13. Success Metrics

- Core test suite passes (validation, IR, simulation, all 3 generators, syntax parity).
- Backend API test suite passes (API, versions, exports).
- Frontend `npm run typecheck` clean.
- Generated Django project smoke-tested: migrations, FK/M2M CRUD, parameterized query.
- Determinism: repeated generation of the same diagram produces byte-identical output.
- AI proposals that add validator errors are rejected 100% of the time.

---

## 14. Open Questions

1. Should the frontend login screen (Phase 2) be prioritized over generated-project auth (Phase 3)?
2. When to introduce Pydantic/JSON Schema at the API boundary (optional per `docs/EXTENDING.md`)?
3. What is the target `BLUEPRINT_MAX_NODES` default?
4. Which payment providers get real adapters first (Paystack/Flutterwave/Stripe/Termii)?

---

## Appendix: Quick Start

**Core** (no install):
```bash
cd core
python -m unittest discover -s tests -v
python -m blueprint_core validate blueprint_core/templates/ecommerce.json
python -m blueprint_core simulate blueprint_core/templates/ecommerce.json order_placed --payload '{"total": 60000}'
python -m blueprint_core generate blueprint_core/templates/ecommerce.json --out /tmp/shop
```

**Backend** (Python 3.10+):
```bash
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
export DEBUG=1
python manage.py makemigrations projects
python manage.py migrate
python manage.py runserver   # http://localhost:8000/api/docs/
```
Optional AI: `export GROQ_API_KEY=...`

**Frontend** (Node 18+):
```bash
cd frontend
npm install && npm run typecheck && npm run dev   # http://localhost:5173
```

---

*This PRD reflects the current state of the repository (docs/, core/, backend/, frontend/). It should be updated as roadmap items are implemented.*
