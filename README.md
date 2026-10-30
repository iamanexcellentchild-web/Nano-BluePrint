# Blueprint

A visual canvas for designing the **business logic** of a website (orders, bookings, enrolments...) from
building blocks, with starter templates, live checks, a simulator, an AI assistant that edits the
diagram, and generators for PostgreSQL-backed FastAPI/Express or SQLite-backed Django projects.

```
Diagram (canvas JSON) --validate--> IR --simulate--> trace on the canvas
                                     \--generate--> FastAPI | Django | Express project
```

## Repo layout

| Path | What it is |
|---|---|
| `core/` | `blueprint_core`: pure Python, **stdlib only**. Block library, validator, IR compiler, simulator, generators, templates, CLI. The product's brain. |
| `backend/` | Django + DRF API: projects, versioned diagrams, validate / simulate / generate endpoints, AI endpoint, OpenAPI docs. |
| `frontend/` | React + TypeScript + React Flow canvas, palette, inspector, checks, simulator, AI panel. |
| `docs/` | Architecture, diagram & IR spec, extending guide, roadmap. |

## Quick start

**1. Core (no install needed to try it)**
```bash
cd core
python -m unittest discover -s tests -v                       # 21 tests
python -m blueprint_core validate blueprint_core/templates/ecommerce.json
python -m blueprint_core simulate blueprint_core/templates/ecommerce.json order_placed --payload '{"total": 60000}'
python -m blueprint_core generate blueprint_core/templates/ecommerce.json --out /tmp/shop
```

**2. Backend** (Python 3.10+)
```bash
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt            # installs ../core in editable mode
export DEBUG=1                             # allows anonymous use locally
python manage.py makemigrations projects   # commit the generated migration
python manage.py migrate
python manage.py runserver                 # http://localhost:8000/api/docs/
python manage.py test                      # API tests
```
Optional AI assistant: `export GROQ_API_KEY=...` (model via `GROQ_MODEL`, default `llama-3.3-70b-versatile`).

**3. Frontend** (Node 18+)
```bash
cd frontend
npm install
npm run typecheck
npm run dev                                # http://localhost:5173 (proxies /api to :8000)
```

**4. Try the generated project**
```bash
cd /tmp/shop && python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt && pytest && uvicorn app.main:app --reload
```
FastAPI and Express use PostgreSQL. Django uses SQLite by default. Choose a target in the
canvas before generating. Entity fields support foreign keys and many-to-many relations;
the SQL Query block accepts parameterized, read-only `SELECT`/`WITH` queries using
`:parameter` values from the event payload. AI Generate sends the diagram to the configured
Groq model for custom-block implementations and a generation review.

## Verification status

* The core suite covers validation, IR compilation, simulation, all three generators, generated Python
  syntax, and simulator/generated-flow parity. JavaScript syntax checks run when Node.js is installed.
* The backend suite covers the API, project versions, and exports for FastAPI, Django, and Express.
* The frontend passes `npm run typecheck`.
* A generated Django project has been smoke-tested through migrations, foreign-key/many-to-many CRUD,
  and a parameterized query. FastAPI and Express have generation/syntax coverage, but still need an
  end-to-end run against PostgreSQL.
* See [`docs/ROADMAP.md`](docs/ROADMAP.md) for remaining work.

## Why `core` has no Pydantic

The core uses dataclasses and hand-written validation so it runs anywhere with zero installs and is
trivially testable. Pydantic is a good fit at the API edge or if you later publish a JSON Schema;
`docs/DIAGRAM_AND_IR.md` documents the formats so you can add it without changing behaviour.

## Docs
* [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) - how the pieces fit, design decisions
* [`docs/DIAGRAM_AND_IR.md`](docs/DIAGRAM_AND_IR.md) - the diagram format, validation codes, the IR
* [`docs/EXTENDING.md`](docs/EXTENDING.md) - add a block, a template, a generator target
* [`docs/API.md`](docs/API.md) - endpoints
* [`docs/ROADMAP.md`](docs/ROADMAP.md) - what to build next, in order
