"""Tiny runtime shared by the simulator and by generated projects.

This exact file is copied into generated code as app/runtime.py, so the
simulator and the real backend evaluate rules identically. Stdlib only.
"""


def _num(x):
    if isinstance(x, bool):
        return None
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def compare(left, op, right):
    """Evaluate `left <op> right`. Compares as numbers when both sides look numeric."""
    if op == "contains":
        return left is not None and str(right).lower() in str(left).lower()
    a, b = _num(left), _num(right)
    if a is not None and b is not None:
        left, right = a, b
    else:
        left, right = ("" if left is None else str(left)), str(right)
    if op == "eq":
        return left == right
    if op == "ne":
        return left != right
    try:
        if op == "gt":
            return left > right
        if op == "gte":
            return left >= right
        if op == "lt":
            return left < right
        if op == "lte":
            return left <= right
    except TypeError:
        return False
    raise ValueError(f"Unknown operator: {op}")


class _SafeDict(dict):
    def __missing__(self, key):
        return "{" + key + "}"


def render(template, ctx):
    """Fill {field} placeholders from ctx; unknown placeholders are left as-is."""
    try:
        return str(template).format_map(_SafeDict(ctx))
    except (ValueError, IndexError, AttributeError):
        return str(template)
