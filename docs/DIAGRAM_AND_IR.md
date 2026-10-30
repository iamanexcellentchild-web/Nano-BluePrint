# Diagram format and IR

## Diagram JSON (what the canvas saves)

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
Edges leaving an If/else must set `source_handle` to `"true"` or `"false"`; all others use `null`.

## Block types

| type | category | config |
|---|---|---|
| `entity` | data | `name`, `fields[{name,type,required,target,on_delete}]` (scalar types: string, text, integer, number, boolean, date, datetime; relation types: foreign_key, many_to_many) |
| `actor` | actor | `name`, `permissions[]` (documentation only for now) |
| `event` | trigger | `name`, `entity?` |
| `condition` | logic | `field`, `operator` (eq ne gt gte lt lte contains), `value` |
| `set_field` | action | `field`, `value` (coerced to the field's type) |
| `update_status` | action | `status` (adds a `status` column if missing) |
| `send_sms` / `send_email` | action | `to_field`, `message` (+`subject`); `{field}` placeholders |
| `charge_payment` | action | `provider` (paystack, flutterwave, stripe), `amount_field` |
| `custom_code` | action | `description` -> generates a write-once stub |
| `sql_query` | action | `name`, `sql`, `result_key`; one parameterized read-only SELECT/CTE, using `:name` values from event payload |
| `provider` | integration | `provider`, `note` (documentation) |

Allowed connections (source -> target category): actor->trigger, data->trigger, trigger->logic|action,
logic->logic|action, action->action|logic, integration->action.

## Validation codes

| Code | Level | Meaning |
|---|---|---|
| DG001 | error | unknown block type |
| DG002 | error | duplicate block id |
| DG003 | error | connection to missing block |
| DG004 | error | connection not allowed between these categories |
| DG005 | error | required config missing |
| DG006 | error | wrong output handle (If/else needs yes/no) |
| DG010 | error | duplicate table name |
| DG011 | error | event refers to unknown table |
| DG012 | error | duplicate event name |
| DG013 | error | loop |
| DG020 | warning | event has nothing after it |
| DG021 | warning | block unreachable from any event |
| DG022 | warning/info | If/else with no / one branch |
| DG023 | error | bad field name/type, duplicate field, reserved `id` |
| DG024 | error | invalid table/event name |
| DG030 | warning | changes a record but event has no table |
| DG031 | warning | referenced field is not on the table (must come in payload) |
| DG032-DG034 | error | invalid relation target, delete behavior, or required many-to-many field |
| DG035 | error | query is not a single read-only SELECT/CTE statement |

## IR (`SystemIR`)

```
SystemIR { name, entities[EntityIR], flows[FlowIR], roles[RoleIR], providers[str] }
EntityIR { name (Pascal), fields[{name (snake), type, required, target?, on_delete?}], node_id }
FlowIR   { event (snake), trigger_node_id, entity?, steps[Step] }
Step     { node_id, kind, params, then[Step], otherwise[Step] }   # then/otherwise only for kind="condition"
```
`compile_ir` refuses diagrams with errors. Every `Step` keeps its `node_id`, which is how the simulator
highlights the path on the canvas and how generated code is traceable (`# block <id>` comments).
