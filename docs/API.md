# API (also live at `/api/docs/` when the backend runs)

| Method & path | Purpose |
|---|---|
| `GET /api/blocks/` | Block library, categories, allowed connections |
| `GET /api/templates/`, `GET /api/templates/<id>/` | Starter diagrams |
| `GET /api/schemas/?q=<text>` | Search public reusable schemas by title or description |
| `POST /api/schemas/` | Publish a documented schema (`{title, description, documentation, diagram}`) |
| `GET/PATCH/DELETE /api/schemas/<slug>/` | Read a published schema; only its publisher may update or remove it |
| `POST /api/schemas/<slug>/use/` | Copy a published diagram into a new project (`{name?}`); increments its use count |
| `GET/POST /api/projects/` | List / create (`{name, template?}`) |
| `GET /api/projects/<id>/latest/` | Latest saved diagram |
| `GET/POST /api/projects/<id>/versions/` | History / save new version (`{diagram, note?}`) |
| `POST /api/validate/` | `{diagram}` -> `{issues, has_errors}` |
| `POST /api/simulate/` | `{diagram, event, payload}` -> `{ok, trace[], context}` |
| `POST /api/generate/` | `{diagram, target}` -> zip (400 with issues if errors) |
| `POST /api/generate/ai/` | `{diagram, target}` -> AI-assisted zip (requires `GROQ_API_KEY`) |
| `POST /api/ai/` | `{mode: explain|suggest, diagram, question}`; `suggest` returns `proposed_diagram` |
| `POST /api/auth/register/`, `POST /api/auth/token/` | Create account, get token |

Auth: `Authorization: Token <key>`. Block metadata, starter templates, and published schemas are publicly
readable. Project operations and schema publishing/usage require authentication in production. The frontend
supports account registration and sign-in; API clients can create a token with the endpoints below.

Schema publication requires a non-empty, valid diagram, a 20–300 character description, and at least
60 characters of Markdown documentation. A publication is a snapshot of the current diagram; changing
a project later does not change its published copy. Schemas are publicly readable. In production,
publishing, editing, deleting, and using a schema require authentication; only the publisher can edit or
delete it. Anonymous ownership is available only in debug mode.

```bash
curl -X POST localhost:8000/api/auth/register/ -H 'Content-Type: application/json' -d '{"username":"me","password":"a-long-password-123"}'
curl -X POST localhost:8000/api/auth/token/    -H 'Content-Type: application/json' -d '{"username":"me","password":"a-long-password-123"}'
curl -X POST localhost:8000/api/schemas/ \
  -H 'Authorization: Token <key>' -H 'Content-Type: application/json' \
  -d '{"title":"Order workflow","description":"An order and payment flow for small shops.","documentation":"## Overview\nA reusable order workflow.\n\n## Data model\nOrders reference customers.\n\n## How to use\nConfigure the payment event and integrations before generating code.","diagram":{...}}'
curl -X POST localhost:8000/api/schemas/order-workflow-1/use/ \
  -H 'Authorization: Token <key>' -H 'Content-Type: application/json' \
  -d '{"name":"My order workflow"}'
```
