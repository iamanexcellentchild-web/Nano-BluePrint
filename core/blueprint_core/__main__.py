"""CLI: python -m blueprint_core validate|simulate|generate <diagram.json>"""
import argparse
import json
import sys

from . import Diagram, compile_ir, generate, has_errors, simulate, validate, write_project


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="blueprint_core")
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("validate", "simulate", "generate"):
        p = sub.add_parser(name)
        p.add_argument("diagram")
    sub.choices["simulate"].add_argument("event")
    sub.choices["simulate"].add_argument("--payload", default="{}", help="JSON object")
    sub.choices["generate"].add_argument("--out", required=True)
    sub.choices["generate"].add_argument("--target", default="fastapi")
    a = ap.parse_args(argv)

    with open(a.diagram, encoding="utf-8") as fh:
        diagram = Diagram.from_dict(json.load(fh))
    issues = validate(diagram)
    for i in issues:
        print(f"[{i.level:7}] {i.code} {i.message}")
    if has_errors(issues):
        return 1
    if a.cmd == "simulate":
        res = simulate(compile_ir(diagram), a.event, json.loads(a.payload))
        print(json.dumps(res.to_dict(), indent=2, default=str))
        return 0 if res.ok else 1
    if a.cmd == "generate":
        skipped = write_project(generate(compile_ir(diagram), a.target), a.out)
        print(f"Generated into {a.out}" + (f" (kept existing: {', '.join(skipped)})" if skipped else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
