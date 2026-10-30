"""Django ORM project generator using SQLite by default."""
from __future__ import annotations

from ..ir import FlowIR, Step, SystemIR, walk_steps
from ..names import snake
from .base import GeneratedFile

DJANGO_TYPES = {
    "string": "models.CharField(max_length=255)",
    "text": "models.TextField()",
    "integer": "models.IntegerField()",
    "number": "models.FloatField()",
    "boolean": "models.BooleanField()",
    "date": "models.DateField()",
    "datetime": "models.DateTimeField()",
}
DELETE = {"cascade": "models.CASCADE", "set_null": "models.SET_NULL", "restrict": "models.RESTRICT"}


def _plural(name: str) -> str:
    return snake(name) + "s"


def _node_ident(node_id: str) -> str:
    return "n_" + "".join(char if char.isalnum() else "_" for char in node_id)


def _render_steps(steps: list[Step], indent: int = 1) -> list[str]:
    pad, lines = "    " * indent, []
    if not steps:
        return [pad + "pass"]
    for step in steps:
        p = step.params
        lines.append(f"{pad}# block {step.node_id}")
        if step.kind == "condition":
            lines.append(f"{pad}if compare(ctx.get({p['field']!r}), {p['operator']!r}, {p['value']!r}):")
            lines.extend(_render_steps(step.then, indent + 1))
            if step.otherwise:
                lines.append(f"{pad}else:")
                lines.extend(_render_steps(step.otherwise, indent + 1))
        elif step.kind == "set_field":
            lines.append(f"{pad}ctx[{p['field']!r}] = {p['value']!r}")
        elif step.kind == "update_status":
            lines.append(f"{pad}ctx['status'] = {p['status']!r}")
        elif step.kind == "sql_query":
            lines.append(f"{pad}ctx[{p['result_key']!r}] = query_runner({p['sql']!r}, ctx)")
        elif step.kind == "send_sms":
            lines.append(f"{pad}send_sms(ctx.get({p['to_field']!r}), render({p['message']!r}, ctx))")
        elif step.kind == "send_email":
            lines.append(f"{pad}send_email(ctx.get({p['to_field']!r}), render({p['subject']!r}, ctx), render({p['message']!r}, ctx))")
        elif step.kind == "charge_payment":
            lines.append(f"{pad}charge_payment({p['provider']!r}, ctx.get({p['amount_field']!r}), ctx)")
        elif step.kind == "custom_code":
            lines.append(f"{pad}ctx = {_node_ident(step.node_id)}(ctx) or ctx")
    return lines


def _models(ir: SystemIR) -> str:
    lines = ["from django.db import models", ""]
    for entity in ir.entities:
        lines.extend([f"class {entity.name}(models.Model):", "    id = models.BigAutoField(primary_key=True)"])
        if not entity.fields:
            lines.append("    pass")
        for field in entity.fields:
            if field.type == "foreign_key":
                delete = DELETE.get(field.on_delete, "models.CASCADE")
                lines.append(f"    {field.name} = models.ForeignKey({field.target!r}, on_delete={delete}, "
                             f"null={not field.required}, blank={not field.required})")
            elif field.type == "many_to_many":
                lines.append(f"    {field.name} = models.ManyToManyField({field.target!r}, blank=True)")
            else:
                definition = DJANGO_TYPES[field.type]
                if not field.required:
                    definition = definition[:-1] + ", null=True, blank=True)"
                lines.append(f"    {field.name} = {definition}")
        lines.extend(["", "    class Meta:", f"        db_table = {_plural(entity.name)!r}"])
        lines.append("")
    return "\n".join(lines)


def _flows(ir: SystemIR) -> str:
    custom = sorted({step.node_id for flow in ir.flows for step in walk_steps(flow.steps)
                     if step.kind == "custom_code"})
    lines = [
        "import re",
        "from . import integrations",
        *[f"from .custom.{_node_ident(node_id)} import run as {_node_ident(node_id)}" for node_id in custom],
        "",
        "def compare(a, op, b):",
        "    if a is None: return op == 'eq' and b is None",
        "    try: a, b = float(a), float(b)",
        "    except (TypeError, ValueError): a, b = str(a), str(b)",
        "    return {'eq': lambda: a == b, 'ne': lambda: a != b, 'gt': lambda: a > b, 'gte': lambda: a >= b, 'lt': lambda: a < b, 'lte': lambda: a <= b, 'contains': lambda: str(b) in str(a)}[op]()",
        "",
        "def render(template, ctx):",
        "    return re.sub(r'{([A-Za-z_][A-Za-z0-9_]*)}', lambda m: str(ctx.get(m.group(1), m.group(0))), template)",
        "",
        "def send_sms(to, message): integrations.send_sms(to, message)",
        "def send_email(to, subject, message): integrations.send_email(to, subject, message)",
        "def charge_payment(provider, amount, ctx): integrations.charge_payment(provider, amount, ctx)",
        "",
    ]
    for flow in ir.flows:
        lines.append(f"def run_{flow.event}(ctx, query_runner):")
        lines.extend(_render_steps(flow.steps))
        lines.append("    return ctx")
        lines.append("")
    lines.append("FLOWS = {")
    lines.extend(f"    {flow.event!r}: run_{flow.event}," for flow in ir.flows)
    lines.append("}")
    return "\n".join(lines) + "\n"


def _views(ir: SystemIR) -> str:
    lines = [
        "import json, re",
        "from django.core.serializers.json import DjangoJSONEncoder",
        "from django.db import connection, transaction",
        "from django.http import JsonResponse",
        "from django.views.decorators.csrf import csrf_exempt",
        "from . import flows, models",
        "",
        "def _body(request):",
        "    try: return json.loads(request.body or b'{}')",
        "    except (ValueError, UnicodeDecodeError): return None",
        "",
        "def _json(value, status=200):",
        "    return JsonResponse(value, status=status, safe=not isinstance(value, list), encoder=DjangoJSONEncoder)",
        "",
        "def _query(sql, ctx):",
        "    names = re.findall(r'(?<!:):([A-Za-z_][A-Za-z0-9_]*)', sql)",
        "    params = [ctx[name] for name in names]",
        "    statement = re.sub(r'(?<!:):([A-Za-z_][A-Za-z0-9_]*)', '%s', sql)",
        "    with connection.cursor() as cursor:",
        "        cursor.execute(statement, params)",
        "        columns = [column[0] for column in cursor.description or []]",
        "        return [dict(zip(columns, row)) for row in cursor.fetchall()]",
        "",
    ]
    for entity in ir.entities:
        name, route = entity.name, _plural(entity.name)
        m2m = [field for field in entity.fields if field.type == "many_to_many"]
        lines.extend([
            "@csrf_exempt",
            f"def {route}(request, pk=None):",
            "    if request.method == 'GET':",
            f"        if pk is None: return _json([{_serialize_expr(ir, name, 'row')} for row in models.{name}.objects.all()])",
            f"        row = models.{name}.objects.filter(pk=pk).first()",
            "        return _json(_serialize_expr_placeholder) if row else _json({'detail': 'Not found'}, 404)".replace(
                "_serialize_expr_placeholder", _serialize_expr(ir, name, "row")),
            "    if request.method not in ('POST', 'PUT', 'PATCH', 'DELETE'): return _json({'detail': 'Method not allowed'}, 405)",
            "    if request.method == 'DELETE':",
            f"        deleted, _ = models.{name}.objects.filter(pk=pk).delete()",
            "        return _json({'deleted': bool(deleted)}, 200 if deleted else 404)",
            "    data = _body(request)",
            "    if not isinstance(data, dict): return _json({'detail': 'Expected a JSON object'}, 400)",
            f"    row = models.{name}.objects.filter(pk=pk).first() if pk is not None else models.{name}()",
            "    if row is None: return _json({'detail': 'Not found'}, 404)",
        ])
        for field in entity.fields:
            if field.type == "many_to_many":
                continue
            attr = field.name + "_id" if field.type == "foreign_key" else field.name
            lines.append(f"    if {field.name!r} in data: row.{attr} = data[{field.name!r}]")
        lines.append("    with transaction.atomic():")
        lines.append("        row.save()")
        for field in m2m:
            lines.append(f"        if {field.name!r} in data: row.{field.name}.set(data[{field.name!r}])")
        lines.extend(["    return _json(" + _serialize_expr(ir, name, "row") + ", 201 if request.method == 'POST' else 200)", ""])

    lines.extend(["EVENT_ENTITIES = {"])
    lines.extend(f"    {flow.event!r}: {flow.entity!r}," for flow in ir.flows)
    lines.extend(["}", "EVENT_SERIALIZERS = {"])
    for flow in ir.flows:
        if flow.entity:
            lines.append(f"    {flow.event!r}: lambda row: {_serialize_expr(ir, flow.entity, 'row')},")
    lines.extend(["}", "", "@csrf_exempt", "def event(request, name):",
                  "    if request.method != 'POST': return _json({'detail': 'Method not allowed'}, 405)",
                  "    body = _body(request)",
                  "    if not isinstance(body, dict): return _json({'detail': 'Expected a JSON object'}, 400)",
                  "    flow = flows.FLOWS.get(name)",
                  "    if flow is None: return _json({'detail': 'Unknown event'}, 404)",
                  "    ctx = dict(body.get('payload') or {})",
                  "    entity_name = EVENT_ENTITIES.get(name)",
                  "    row = None",
                  "    if entity_name:",
                  "        entity_id = body.get('entity_id')",
                  "        if entity_id is None: return _json({'detail': 'entity_id is required for this event'}, 400)",
                  "        model = getattr(models, entity_name)",
                  "        row = model.objects.filter(pk=entity_id).first()",
                  "        if row is None: return _json({'detail': 'Record not found'}, 404)",
                  "        ctx = {**EVENT_SERIALIZERS[name](row), **ctx}",
                  "    try:",
                  "        result = flow(ctx, _query)",
                  "        if row is not None:",
                  "            with transaction.atomic():"])
    for flow in ir.flows:
        if not flow.entity:
            continue
        entity = ir.entity(flow.entity)
        lines.extend([f"                if name == {flow.event!r}:"])
        for field in entity.fields:
            if field.type == "many_to_many":
                lines.append(f"                    if {field.name!r} in result: row.{field.name}.set(result[{field.name!r}])")
            elif field.type == "foreign_key":
                lines.append(f"                    if {field.name!r} in result: row.{field.name}_id = result[{field.name!r}]")
            else:
                lines.append(f"                    if {field.name!r} in result: row.{field.name} = result[{field.name!r}]")
        lines.append("")
    lines.extend(["                row.save()",
                  "    except Exception as exc:", "        return _json({'detail': str(exc)}, 400)",
                  "    return _json({'event': name, 'context': result})", ""])
    return "\n".join(lines)


def _serialize_expr(ir: SystemIR, entity: str, variable: str) -> str:
    definition = ir.entity(entity)
    if definition is None:
        return f"{{'id': {variable}.pk}}"
    values = [f"'id': {variable}.pk"]
    for field in definition.fields:
        if field.type == "foreign_key":
            values.append(f"{field.name!r}: {variable}.{field.name}_id")
        elif field.type == "many_to_many":
            values.append(f"{field.name!r}: list({variable}.{field.name}.values_list('pk', flat=True))")
        else:
            values.append(f"{field.name!r}: {variable}.{field.name}")
    return "{" + ", ".join(values) + "}"


def _urls(ir: SystemIR) -> str:
    lines = ["from django.urls import path", "from . import views", "", "urlpatterns = ["]
    for entity in ir.entities:
        route = _plural(entity.name)
        lines.extend([f"    path('api/{route}/', views.{route}),",
                      f"    path('api/{route}/<int:pk>/', views.{route}),"])
    lines.append("    path('api/events/<str:name>/', views.event),")
    lines.extend(["]", ""])
    return "\n".join(lines)


def generate(ir: SystemIR) -> list[GeneratedFile]:
    files = [
        GeneratedFile("manage.py", "import os, sys\nos.environ.setdefault('DJANGO_SETTINGS_MODULE', 'project.settings')\nfrom django.core.management import execute_from_command_line\nexecute_from_command_line(sys.argv)\n"),
        GeneratedFile("project/__init__.py", ""),
        GeneratedFile("project/settings.py", "SECRET_KEY = 'replace-before-deploy'\nDEBUG = True\nALLOWED_HOSTS = ['*']\nROOT_URLCONF = 'project.urls'\nINSTALLED_APPS = ['django.contrib.contenttypes', 'app']\nMIDDLEWARE = []\nDATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': 'db.sqlite3'}}\nDEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'\n"),
        GeneratedFile("project/urls.py", "from django.urls import include, path\nurlpatterns = [path('', include('app.urls'))]\n"),
        GeneratedFile("app/__init__.py", ""),
        GeneratedFile("app/apps.py", "from django.apps import AppConfig\nclass AppConfig(AppConfig):\n    name = 'app'\n"),
        GeneratedFile("app/models.py", _models(ir)),
        GeneratedFile("app/flows.py", _flows(ir)),
        GeneratedFile("app/views.py", _views(ir)),
        GeneratedFile("app/urls.py", _urls(ir)),
        GeneratedFile("app/integrations.py", "def send_sms(to, message): pass\ndef send_email(to, subject, message): pass\ndef charge_payment(provider, amount, ctx): pass\n", overwrite=False),
        GeneratedFile("app/custom/__init__.py", "", overwrite=False),
        GeneratedFile("requirements.txt", "Django>=5.0,<6.0\n"),
        GeneratedFile("README.md", f"# {ir.name}\n\nGenerated Django project. SQLite is configured by default.\n\n```bash\npython -m venv .venv\n# activate the environment, then:\npip install -r requirements.txt\npython manage.py migrate --run-syncdb\npython manage.py runserver\n```\n\nGenerated API routes use `/api/`. SQL query blocks accept named `:parameter` values from event payloads and execute only validated read-only SELECT statements.\n"),
    ]
    seen = set()
    for flow in ir.flows:
        for step in walk_steps(flow.steps):
            if step.kind == "custom_code" and step.node_id not in seen:
                seen.add(step.node_id)
                files.append(GeneratedFile(
                    f"app/custom/{_node_ident(step.node_id)}.py",
                    f'"""AI-implementable custom block. Description: {step.params.get("description", "").strip()!r}"""\n\n'
                    "def run(ctx):\n    return ctx\n",
                    overwrite=False))
    return files
