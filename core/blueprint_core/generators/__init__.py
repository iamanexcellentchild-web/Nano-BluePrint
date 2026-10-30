"""Code generators. One module per target; each exposes generate(ir) -> list[GeneratedFile]."""
from __future__ import annotations

import io
import zipfile
from pathlib import Path

from ..ir import SystemIR
from .base import GeneratedFile
from . import fastapi_gen
from . import django_gen, express_gen

TARGETS = {
    "fastapi": fastapi_gen.generate,
    "django": django_gen.generate,
    "express": express_gen.generate,
}


def generate(ir: SystemIR, target: str = "fastapi") -> list[GeneratedFile]:
    if target not in TARGETS:
        raise ValueError(f"Unknown target '{target}'. Available: {sorted(TARGETS)}")
    return TARGETS[target](ir)


def write_project(files: list[GeneratedFile], out_dir: str | Path) -> list[str]:
    """Write files to disk. Files marked overwrite=False are left alone if they exist
    (this is how hand-written code survives regeneration). Returns paths skipped."""
    out, skipped = Path(out_dir), []
    for f in files:
        dest = out / f.path
        if dest.exists() and not f.overwrite:
            skipped.append(f.path)
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(f.content, encoding="utf-8")
    return skipped


def zip_project(files: list[GeneratedFile], root: str = "project") -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for f in files:
            z.writestr(f"{root}/{f.path}", f.content)
    return buf.getvalue()
