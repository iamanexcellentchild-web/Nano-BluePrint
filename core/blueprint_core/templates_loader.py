from __future__ import annotations

import json
from pathlib import Path

_DIR = Path(__file__).parent / "templates"


def list_templates() -> list[dict]:
    out = []
    for p in sorted(_DIR.glob("*.json")):
        d = json.loads(p.read_text(encoding="utf-8"))
        out.append({"id": p.stem, "name": d.get("name", p.stem), "description": d.get("description", "")})
    return out


def load_template(template_id: str) -> dict:
    p = _DIR / f"{Path(template_id).name}.json"  # .name blocks path traversal
    if not p.exists():
        raise KeyError(template_id)
    return json.loads(p.read_text(encoding="utf-8"))
