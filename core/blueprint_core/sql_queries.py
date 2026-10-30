"""Validation helpers for diagram-authored read-only SQL queries."""
from __future__ import annotations

import re

_PARAMETER = re.compile(r"(?<!:):([A-Za-z_][A-Za-z0-9_]*)")
_TOKEN = re.compile(r"[A-Za-z_][A-Za-z0-9_$]*")
_MUTATING = {
    "ALTER", "ATTACH", "CALL", "CREATE", "DELETE", "DETACH", "DROP", "EXEC",
    "EXECUTE", "GRANT", "INSERT", "MERGE", "PRAGMA", "REPLACE", "REVOKE",
    "TRUNCATE", "UPDATE", "VACUUM",
}


def validate_select_query(query: object) -> str | None:
    if not isinstance(query, str) or not query.strip():
        return "SQL query must not be empty"
    if len(query) > 10_000:
        return "SQL query must be 10,000 characters or fewer"

    visible: list[str] = []
    quote: str | None = None
    i = 0
    while i < len(query):
        char = query[i]
        if quote:
            if char == quote:
                if i + 1 < len(query) and query[i + 1] == quote:
                    visible.extend("  ")
                    i += 2
                    continue
                quote = None
            visible.append(" ")
        elif char in ("'", '"', "`"):
            quote = char
            visible.append(" ")
        elif query.startswith("--", i) or query.startswith("/*", i):
            return "SQL comments are not allowed; use a single parameterized SELECT query"
        elif char == ";":
            return "Only one SQL statement is allowed; remove the semicolon"
        else:
            visible.append(char)
        i += 1

    if quote:
        return "SQL query contains an unterminated quoted value"
    tokens = [token.upper() for token in _TOKEN.findall("".join(visible))]
    if not tokens or tokens[0] not in {"SELECT", "WITH"}:
        return "Only read-only SELECT queries (including WITH queries) are allowed"
    if any(token in _MUTATING for token in tokens):
        return "SQL query contains a write or schema-changing operation"
    return None


def query_parameters(query: str) -> list[str]:
    return list(dict.fromkeys(_PARAMETER.findall(query)))
