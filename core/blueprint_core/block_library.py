"""Block definitions as data. Served to the frontend so palette, inspector and
connection rules can never drift from what the validator and compiler accept.

To add a block: add an entry to BLOCKS, handle its `type` in ir.py (if it is a
step) and in each generator. See docs/EXTENDING.md.
"""
from __future__ import annotations

FIELD_TYPES = ["string", "text", "integer", "number", "boolean", "date", "datetime"]
RELATION_TYPES = ["foreign_key", "many_to_many"]
DELETE_BEHAVIORS = ["cascade", "set_null", "restrict"]
OPERATORS = ["eq", "ne", "gt", "gte", "lt", "lte", "contains"]
PROVIDERS = ["paystack", "flutterwave", "stripe"]

CATEGORIES = {
    "data": {"label": "Data", "color": "#2f6f5e"},
    "actor": {"label": "Actors", "color": "#8a5a00"},
    "trigger": {"label": "Events", "color": "#b3261e"},
    "logic": {"label": "Rules", "color": "#5b3fa0"},
    "action": {"label": "Actions", "color": "#1f5fa8"},
    "integration": {"label": "Integrations", "color": "#555b66"},
}

# (source category, target category). Anything else is refused by validator and canvas.
ALLOWED_CONNECTIONS = {
    ("actor", "trigger"), ("data", "trigger"), ("trigger", "logic"), ("trigger", "action"),
    ("logic", "logic"), ("logic", "action"), ("action", "action"), ("action", "logic"),
    ("integration", "action"),
}

# config key -> which field-name each step references (used by validator warnings)
FIELD_REFS = {"condition": "field", "set_field": "field", "send_sms": "to_field",
              "send_email": "to_field", "charge_payment": "amount_field"}


def _f(key, label, kind="text", required=False, **extra):
    return {"key": key, "label": label, "kind": kind, "required": required, **extra}


BLOCKS: dict[str, dict] = {
    "entity": {
        "category": "data", "label": "Data table", "outputs": ["default"], "inputs": True,
        "description": "A table of records with scalar, foreign-key, and many-to-many fields.",
        "config_fields": [_f("name", "Name", required=True), _f("fields", "Fields", "fields")],
        "defaults": {"name": "Item", "fields": [{"name": "name", "type": "string", "required": True}]},
    },
    "actor": {
        "category": "actor", "label": "Actor", "outputs": ["default"], "inputs": False,
        "description": "Someone who can cause events: Customer, Admin, Staff.",
        "config_fields": [_f("name", "Name", required=True), _f("permissions", "Can do", "tags")],
        "defaults": {"name": "Customer", "permissions": []},
    },
    "event": {
        "category": "trigger", "label": "Event", "outputs": ["default"], "inputs": True,
        "description": "Something that happens, e.g. 'order placed'. Becomes POST /events/<name>.",
        "config_fields": [_f("name", "Event name", required=True),
                          _f("entity", "Acts on table (optional)")],
        "defaults": {"name": "something_happened", "entity": ""},
    },
    "condition": {
        "category": "logic", "label": "If / else", "outputs": ["true", "false"], "inputs": True,
        "description": "Branches the flow. Connect the 'yes' and 'no' handles to what happens next.",
        "config_fields": [_f("field", "Field", required=True),
                          _f("operator", "Operator", "select", True, options=OPERATORS),
                          _f("value", "Value", required=True)],
        "defaults": {"field": "total", "operator": "gte", "value": "0"},
    },
    "set_field": {
        "category": "action", "label": "Set field", "outputs": ["default"], "inputs": True,
        "description": "Writes a value to a field on the record, e.g. delivery_fee = 1500.",
        "config_fields": [_f("field", "Field", required=True), _f("value", "Value", required=True)],
        "defaults": {"field": "", "value": ""},
    },
    "update_status": {
        "category": "action", "label": "Change status", "outputs": ["default"], "inputs": True,
        "description": "Moves the record to a new status. Adds a 'status' field to the table if missing.",
        "config_fields": [_f("status", "New status", required=True)],
        "defaults": {"status": "paid"},
    },
    "send_sms": {
        "category": "action", "label": "Send SMS", "outputs": ["default"], "inputs": True,
        "description": "Texts a number stored on the record. Use {field} placeholders in the message.",
        "config_fields": [_f("to_field", "Phone field", required=True),
                          _f("message", "Message", "textarea", True)],
        "defaults": {"to_field": "phone", "message": "Hi {name}, thanks!"},
    },
    "send_email": {
        "category": "action", "label": "Send email", "outputs": ["default"], "inputs": True,
        "description": "Emails an address stored on the record. Use {field} placeholders.",
        "config_fields": [_f("to_field", "Email field", required=True), _f("subject", "Subject", required=True),
                          _f("message", "Message", "textarea", True)],
        "defaults": {"to_field": "email", "subject": "Update", "message": "Hi {name}"},
    },
    "charge_payment": {
        "category": "action", "label": "Charge payment", "outputs": ["default"], "inputs": True,
        "description": "Starts a payment for the amount in a field, via the chosen provider.",
        "config_fields": [_f("provider", "Provider", "select", True, options=PROVIDERS),
                          _f("amount_field", "Amount field", required=True)],
        "defaults": {"provider": "paystack", "amount_field": "total"},
    },
    "custom_code": {
        "category": "action", "label": "Custom code", "outputs": ["default"], "inputs": True,
        "description": "Escape hatch. Generates a stub file you own; it is never overwritten on regeneration.",
        "config_fields": [_f("description", "What should it do?", "textarea", True)],
        "defaults": {"description": ""},
    },
    "sql_query": {
        "category": "action", "label": "SQL query", "outputs": ["default"], "inputs": True,
        "description": "Runs a parameterized, read-only SELECT query. Use :name placeholders from the event payload.",
        "config_fields": [_f("name", "Query name", required=True),
                          _f("sql", "SQL SELECT", "textarea", True),
                          _f("result_key", "Store results in", required=True)],
        "defaults": {"name": "find_records", "sql": "SELECT * FROM items WHERE id = :id",
                     "result_key": "query_result"},
    },
    "provider": {
        "category": "integration", "label": "Integration", "outputs": ["default"], "inputs": False,
        "description": "Documents an external service (Paystack, Twilio...) used by connected actions.",
        "config_fields": [_f("provider", "Service", required=True), _f("note", "Notes", "textarea")],
        "defaults": {"provider": "paystack", "note": ""},
    },
}


def category_of(block_type: str) -> str | None:
    b = BLOCKS.get(block_type)
    return b["category"] if b else None


def library_as_dict() -> dict:
    return {
        "categories": CATEGORIES,
        "blocks": [{"type": t, **b} for t, b in BLOCKS.items()],
        "allowed_connections": sorted([list(p) for p in ALLOWED_CONNECTIONS]),
        "field_types": FIELD_TYPES,
        "relation_types": RELATION_TYPES,
        "delete_behaviors": DELETE_BEHAVIORS,
        "operators": OPERATORS,
    }
