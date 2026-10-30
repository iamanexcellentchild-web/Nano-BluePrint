# API (also live at `/api/docs/` when the backend runs)

| Method & path | Purpose |
|---|---|
| `GET /api/blocks/` | Block library, categories, allowed connections |
| `GET /api/templates/`, `GET /api/templates/<id>/` | Starter diagrams |
| `GET/POST /api/projects/` | List / create (`{name, template?}`) |
| `GET /api/projects/<id>/latest/` | Latest saved diagram |
| `GET/POST /api/projects/<id>/versions/` | History / save new version (`{diagram, note?}`) |
| `POST /api/validate/` | `{diagram}` -> `{issues, has_errors}` |
| `POST /api/simulate/` | `{diagram, event, payload}` -> `{ok, trace[], context}` |
| `POST /api/generate/` | `{diagram, target}` -> zip (400 with issues if errors) |
| `POST /api/generate/ai/` | `{diagram, target}` -> AI-assisted zip (requires `GROQ_API_KEY`) |
| `POST /api/ai/` | `{mode: explain|suggest, diagram, question}`; `suggest` returns `proposed_diagram` |
| `POST /api/auth/register/`, `POST /api/auth/token/` | Create account, get token |

Auth: `Authorization: Token <key>`. In `DEBUG=1` anonymous requests work. The frontend reads the token from
`localStorage.blueprint_token` (there is no login screen yet).
```bash
curl -X POST localhost:8000/api/auth/register/ -H 'Content-Type: application/json' -d '{"username":"me","password":"a-long-password-123"}'
curl -X POST localhost:8000/api/auth/token/    -H 'Content-Type: application/json' -d '{"username":"me","password":"a-long-password-123"}'
```
