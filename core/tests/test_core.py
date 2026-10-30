import importlib
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from blueprint_core import (Diagram, DiagramFormatError, compile_ir, generate, has_errors, list_templates,
                            load_template, simulate, validate, write_project, zip_project)
from blueprint_core.sql_queries import validate_select_query

TEMPLATE_IDS = [t["id"] for t in list_templates()]


def D(nodes, edges=()):
    return Diagram.from_dict({"nodes": nodes, "edges": list(edges)})


def N(id, type, **cfg):
    return {"id": id, "type": type, "config": cfg}


def codes(d):
    return {i.code for i in validate(d)}


class ValidationTests(unittest.TestCase):
    def test_templates_have_no_errors(self):
        for tid in TEMPLATE_IDS:
            with self.subTest(tid):
                self.assertFalse(has_errors(validate(Diagram.from_dict(load_template(tid)))))

    def test_bad_shape_raises(self):
        with self.assertRaises(DiagramFormatError):
            Diagram.from_dict({"nodes": [{"id": "a"}]})

    def test_invalid_connection(self):
        d = D([N("o", "entity", name="Order"), N("s", "send_sms", to_field="phone", message="x")],
              [{"source": "o", "target": "s"}])
        self.assertIn("DG004", codes(d))

    def test_condition_needs_handle(self):
        d = D([N("e", "event", name="go"), N("c", "condition", field="a", operator="eq", value="1"),
               N("s", "update_status", status="x")],
              [{"source": "e", "target": "c"}, {"source": "c", "target": "s"}])
        self.assertIn("DG006", codes(d))

    def test_cycle_detected(self):
        d = D([N("e", "event", name="go"), N("a", "update_status", status="a"), N("b", "update_status", status="b")],
              [{"source": "e", "target": "a"}, {"source": "a", "target": "b"}, {"source": "b", "target": "a"}])
        self.assertIn("DG013", codes(d))

    def test_missing_config_and_unknown_type_and_dupes(self):
        d = D([N("e", "event", name=""), N("x", "wat"), N("e", "event", name="y")])
        self.assertTrue({"DG005", "DG001", "DG002"} <= codes(d))

    def test_dead_end_and_unreachable(self):
        d = D([N("e", "event", name="go"), N("s", "update_status", status="x")])
        self.assertTrue({"DG020", "DG021"} <= codes(d))

    def test_unknown_entity_and_reserved_field(self):
        d = D([N("e", "event", name="go", entity="Nope"),
               N("t", "entity", name="T", fields=[{"name": "id", "type": "string"}])])
        self.assertTrue({"DG011", "DG023"} <= codes(d))

    def test_field_not_on_table_warns(self):
        d = D([N("t", "entity", name="T", fields=[{"name": "a", "type": "string"}]),
               N("e", "event", name="go", entity="T"),
               N("s", "send_sms", to_field="phone", message="x")], [{"source": "e", "target": "s"}])
        self.assertIn("DG031", codes(d))

    def test_relationship_targets_must_exist(self):
        d = D([N("order", "entity", name="Order", fields=[
            {"name": "customer", "type": "foreign_key", "target": "Missing"}])])
        self.assertIn("DG032", codes(d))

    def test_many_to_many_cannot_be_required(self):
        d = D([N("order", "entity", name="Order", fields=[
            {"name": "tags", "type": "many_to_many", "target": "Tag", "required": True}]),
               N("tag", "entity", name="Tag")])
        self.assertIn("DG034", codes(d))

    def test_sql_query_rejects_writes_and_multiple_statements(self):
        self.assertIsNone(validate_select_query("SELECT * FROM orders WHERE id = :id"))
        self.assertIsNone(validate_select_query("WITH recent AS (SELECT id FROM orders) SELECT * FROM recent"))
        self.assertIsNotNone(validate_select_query("SELECT * FROM orders; DELETE FROM orders"))
        self.assertIsNotNone(validate_select_query("WITH gone AS (DELETE FROM orders RETURNING *) SELECT * FROM gone"))
        self.assertIsNotNone(validate_select_query("DROP TABLE orders"))


class CompileAndSimulateTests(unittest.TestCase):
    def ecommerce(self):
        return compile_ir(Diagram.from_dict(load_template("ecommerce")))

    def test_compile_refuses_errors(self):
        with self.assertRaises(ValueError):
            compile_ir(D([N("x", "wat")]))

    def test_status_field_added(self):
        self.assertIsNotNone(self.ecommerce().entity("Order").field("status"))

    def test_free_delivery_branch(self):
        r = simulate(self.ecommerce(), "order_placed", {"total": 60000, "phone": "080", "customer_name": "Ada"})
        self.assertTrue(r.ok)
        self.assertEqual(r.context["delivery_fee"], 0.0)
        self.assertEqual(r.context["status"], "placed")
        self.assertTrue(any(t["kind"] == "send_sms" for t in r.trace))

    def test_paid_delivery_branch(self):
        r = simulate(self.ecommerce(), "order_placed", {"total": "100"})
        self.assertEqual(r.context["delivery_fee"], 1500.0)

    def test_cancel_after_payment_goes_to_refund(self):
        self.assertEqual(simulate(self.ecommerce(), "order_cancelled", {"status": "paid"}).context["status"], "refund_pending")
        self.assertEqual(simulate(self.ecommerce(), "order_cancelled", {"status": "placed"}).context["status"], "cancelled")

    def test_unknown_event(self):
        self.assertFalse(simulate(self.ecommerce(), "nope").ok)


SAMPLES = {
    "ecommerce": {"order_placed": [{"total": 60000, "phone": "1", "customer_name": "A"}, {"total": 10}],
                  "payment_received": [{}], "order_cancelled": [{"status": "paid"}, {"status": "new"}]},
    "booking": {"booking_requested": [{"client_name": "A", "phone": "1", "service": "cut"}],
                "booking_confirmed": [{"starts_at": "tomorrow"}], "booking_cancelled": [{"deposit": 2000}, {"deposit": 0}]},
    "lms": {"student_enrolled": [{"price": 0}, {"price": 5000}], "payment_received": [{"course": "X"}],
            "course_completed": [{}]},
}


class GeneratorTests(unittest.TestCase):
    def test_all_generated_python_is_valid_syntax(self):
        for tid in TEMPLATE_IDS:
            files = generate(compile_ir(Diagram.from_dict(load_template(tid))))
            for f in files:
                if f.path.endswith(".py"):
                    with self.subTest(tid=tid, path=f.path):
                        compile(f.content, f.path, "exec")

    def test_generated_flows_match_simulator(self):
        """The strongest guarantee in the repo: real generated code == simulator."""
        for tid in TEMPLATE_IDS:
            ir = compile_ir(Diagram.from_dict(load_template(tid)))
            with tempfile.TemporaryDirectory() as tmp:
                write_project(generate(ir), tmp)
                for m in [m for m in sys.modules if m == "app" or m.startswith("app.")]:
                    del sys.modules[m]
                sys.path.insert(0, tmp)
                try:
                    flows = importlib.import_module("app.flows")
                    for event, payloads in SAMPLES[tid].items():
                        for payload in payloads:
                            with self.subTest(tid=tid, event=event, payload=payload):
                                got = flows.FLOWS[event](dict(payload))
                                self.assertEqual(got, simulate(ir, event, payload).context)
                finally:
                    sys.path.remove(tmp)

    def test_every_event_has_a_sample(self):
        for tid in TEMPLATE_IDS:
            ir = compile_ir(Diagram.from_dict(load_template(tid)))
            self.assertEqual({f.event for f in ir.flows}, set(SAMPLES[tid]), tid)

    def test_write_once_files_survive_regeneration(self):
        ir = compile_ir(Diagram.from_dict(load_template("booking")))
        with tempfile.TemporaryDirectory() as tmp:
            write_project(generate(ir), tmp)
            mine = Path(tmp, "app/integrations.py")
            mine.write_text("# my real sms code\n")
            custom = next(Path(tmp, "app/custom").glob("n_*.py"))
            custom.write_text("# my custom rule\n")
            flows = Path(tmp, "app/flows.py")
            flows.write_text("# stale\n")
            skipped = write_project(generate(ir), tmp)
            self.assertEqual(mine.read_text(), "# my real sms code\n")
            self.assertEqual(custom.read_text(), "# my custom rule\n")
            self.assertIn("GENERATED", flows.read_text())
            self.assertIn("app/integrations.py", skipped)

    def test_zip_contains_files(self):
        import io, zipfile
        data = zip_project(generate(compile_ir(Diagram.from_dict(load_template("ecommerce")))))
        names = zipfile.ZipFile(io.BytesIO(data)).namelist()
        self.assertIn("project/app/main.py", names)
        self.assertIn("project/tests/test_api.py", names)

    def test_all_targets_generate_relations_and_queries(self):
        diagram = D([
            N("order", "entity", name="Order", fields=[
                {"name": "customer", "type": "foreign_key", "target": "Customer", "on_delete": "cascade"},
                {"name": "tags", "type": "many_to_many", "target": "Tag"}]),
            N("customer", "entity", name="Customer", fields=[{"name": "name", "type": "string"}]),
            N("tag", "entity", name="Tag", fields=[{"name": "name", "type": "string"}]),
            N("event", "event", name="order_read", entity="Order"),
            N("query", "sql_query", name="lookup_orders",
              sql="SELECT * FROM orders WHERE id = :id", result_key="matches"),
        ], [{"source": "order", "target": "event"}, {"source": "event", "target": "query"}])
        ir = compile_ir(diagram)
        for target in ("fastapi", "django", "express"):
            files = {f.path: f.content for f in generate(ir, target)}
            with self.subTest(target=target):
                if target == "fastapi":
                    for path, content in files.items():
                        if path.endswith(".py"):
                            compile(content, path, "exec")
                    self.assertIn("ForeignKey('customers.id'", files["app/models.py"])
                    self.assertIn("query_runner", files["app/flows.py"])
                elif target == "django":
                    for path, content in files.items():
                        if path.endswith(".py"):
                            compile(content, path, "exec")
                    self.assertIn("models.ForeignKey('Customer'", files["app/models.py"])
                    self.assertIn("query_runner", files["app/flows.py"])
                else:
                    import subprocess
                    for path, content in files.items():
                        node = shutil.which("node")
                        if path.endswith(".js") and node:
                            with tempfile.NamedTemporaryFile("w", suffix=".js", encoding="utf-8", delete=False) as source:
                                source.write(content)
                                js_path = source.name
                            try:
                                subprocess.run([node, "--check", js_path], check=True, capture_output=True, text=True)
                            finally:
                                Path(js_path).unlink(missing_ok=True)
                    self.assertIn("REFERENCES \"customers\"", files["src/schema.js"])
                    self.assertIn("queryRunner", files["src/flows.js"])

    def test_string_values_are_escaped(self):
        d = D([N("t", "entity", name="T", fields=[{"name": "phone", "type": "string"}]),
               N("e", "event", name="go", entity="T"),
               N("s", "send_sms", to_field="phone", message="it's \"quoted\"\n{phone}")],
              [{"source": "e", "target": "s"}])
        files = {f.path: f.content for f in generate(compile_ir(d))}
        compile(files["app/flows.py"], "flows.py", "exec")


if __name__ == "__main__":
    unittest.main()
