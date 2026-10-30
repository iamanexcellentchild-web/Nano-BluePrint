import io
import json
import zipfile
from unittest.mock import patch

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from blueprint_core import Diagram

from . import ai


@override_settings(DEBUG=True)
class ApiTests(TestCase):
    def setUp(self):
        self.c = APIClient()

    def test_block_library_and_templates(self):
        self.assertTrue(self.c.get("/api/blocks/").json()["blocks"])
        ids = [t["id"] for t in self.c.get("/api/templates/").json()]
        self.assertIn("ecommerce", ids)

    def test_project_from_template_and_versions(self):
        r = self.c.post("/api/projects/", {"name": "Shop", "template": "ecommerce"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        pid = r.json()["id"]
        latest = self.c.get(f"/api/projects/{pid}/latest/").json()
        self.assertEqual(latest["number"], 1)
        r2 = self.c.post(f"/api/projects/{pid}/versions/", {"diagram": latest["diagram"], "note": "x"}, format="json")
        self.assertEqual(r2.json()["number"], 2)

    def test_rejects_malformed_diagram(self):
        r = self.c.post("/api/validate/", {"diagram": {"nodes": [{"id": "a"}]}}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_simulate_and_generate(self):
        d = self.c.get("/api/templates/ecommerce/").json()
        sim = self.c.post("/api/simulate/", {"diagram": d, "event": "order_placed", "payload": {"total": 60000}}, format="json")
        self.assertEqual(sim.status_code, 200)
        self.assertEqual(sim.json()["context"]["status"], "placed")
        gen = self.c.post("/api/generate/", {"diagram": d, "target": "fastapi"}, format="json")
        self.assertEqual(gen.status_code, 200)
        self.assertIn("online-shop/app/main.py", zipfile.ZipFile(io.BytesIO(gen.content)).namelist())

    def test_generate_all_targets(self):
        diagram = self.c.get("/api/templates/ecommerce/").json()
        expected_paths = {
            "fastapi": "app/main.py",
            "django": "manage.py",
            "express": "src/server.js",
        }
        for target, expected_path in expected_paths.items():
            with self.subTest(target=target):
                response = self.c.post("/api/generate/", {"diagram": diagram, "target": target}, format="json")
                self.assertEqual(response.status_code, 200, response.content)
                files = zipfile.ZipFile(io.BytesIO(response.content)).namelist()
                self.assertTrue(any(path.endswith(expected_path) for path in files), files)

    def test_ai_generate_reports_unavailable_provider(self):
        diagram = self.c.get("/api/templates/ecommerce/").json()
        with patch("projects.views.ai.generate_project_assist", side_effect=ai.AIUnavailable("Provider not configured.")):
            response = self.c.post("/api/generate/ai/", {"diagram": diagram, "target": "django"}, format="json")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"], "Provider not configured.")

    def test_generate_blocked_on_errors(self):
        bad = {"nodes": [{"id": "x", "type": "nope"}], "edges": []}
        self.assertEqual(self.c.post("/api/generate/", {"diagram": bad}, format="json").status_code, 400)

    @override_settings(DEBUG=False)
    def test_requires_auth_in_production(self):
        self.assertIn(self.c.get("/api/projects/").status_code, (401, 403))


class AISafetyTests(TestCase):
    """Tests for the AI proposal safety gate in projects/ai.py."""

    @patch("projects.ai._ask")
    def test_patch_adding_unknown_block_is_rejected(self, mock_ask):
        mock_ask.return_value = json.dumps({
            "summary": "add unknown block",
            "patch": [{"op": "add", "path": "/nodes/-",
                       "value": {"id": "x", "type": "wat", "label": "Wat", "position": {"x": 0, "y": 0}, "config": {}}}]
        })
        diagram = {"nodes": [], "edges": []}
        with self.assertRaises(ai.AIError) as ctx:
            ai.suggest(diagram, "add a block")
        self.assertIn("DG001", str(ctx.exception))

    @patch("projects.ai._ask")
    def test_patch_that_fixes_error_is_accepted(self, mock_ask):
        # Diagram has an entity + an event with nothing after it (DG020 warning).
        # Propose adding a valid update_status step connected to it -> resolves the warning, no new errors/warnings.
        mock_ask.return_value = json.dumps({
            "summary": "add status step",
            "patch": [
                {"op": "add", "path": "/nodes/-",
                 "value": {"id": "s", "type": "update_status", "label": "Set status", "position": {"x": 300, "y": 0},
                           "config": {"status": "placed"}}},
                {"op": "add", "path": "/edges/-",
                 "value": {"id": "e1", "source": "ev", "target": "s", "source_handle": None}},
            ],
        })
        diagram = {
            "nodes": [
                {"id": "ord", "type": "entity", "label": "Order", "position": {"x": 0, "y": 0},
                 "config": {"name": "Order", "fields": [{"name": "total", "type": "number", "required": True}]}},
                {"id": "ev", "type": "event", "label": "Order placed", "position": {"x": 200, "y": 0},
                 "config": {"name": "order_placed", "entity": "Order"}},
            ],
            "edges": [],
        }
        result = ai.suggest(diagram, "add a step after the event")
        self.assertEqual(result["mode"], "suggest")
        expected_patch = json.loads(mock_ask.return_value)["patch"]
        self.assertEqual(result["patch"], expected_patch)

    @patch("projects.ai._ask")
    def test_empty_patch_is_accepted(self, mock_ask):
        mock_ask.return_value = json.dumps({"summary": "no changes needed", "patch": []})
        diagram = {"nodes": [], "edges": []}
        result = ai.suggest(diagram, "review")
        self.assertEqual(result["mode"], "suggest")
        self.assertEqual(result["patch"], [])

    @patch("projects.ai._ask")
    def test_generate_project_assist_rejects_forbidden_import(self, mock_ask):
        mock_ask.return_value = json.dumps({
            "review": "unsafe",
            "custom_code": {"c": "    import os\n    os.system('echo pwned')"},
        })
        diagram = Diagram.from_dict({
            "nodes": [
                {"id": "e", "type": "event", "label": "Go", "position": {"x": 0, "y": 0}, "config": {"name": "go"}},
                {"id": "c", "type": "custom_code", "label": "Custom", "position": {"x": 200, "y": 0},
                 "config": {"description": "do something"}},
            ],
            "edges": [{"id": "e1", "source": "e", "target": "c", "source_handle": None}],
        })
        with self.assertRaises(ai.AIError) as ctx:
            ai.generate_project_assist(diagram, "fastapi")
        self.assertIn("disallowed", str(ctx.exception).lower())

    @patch("projects.ai._ask")
    def test_generate_project_assist_rejects_eval(self, mock_ask):
        mock_ask.return_value = json.dumps({
            "review": "unsafe",
            "custom_code": {"c": "eval(ctx.get('x', '0'))"},
        })
        diagram = Diagram.from_dict({
            "nodes": [
                {"id": "e", "type": "event", "label": "Go", "position": {"x": 0, "y": 0}, "config": {"name": "go"}},
                {"id": "c", "type": "custom_code", "label": "Custom", "position": {"x": 200, "y": 0},
                 "config": {"description": "do something"}},
            ],
            "edges": [{"id": "e1", "source": "e", "target": "c", "source_handle": None}],
        })
        with self.assertRaises(ai.AIError):
            ai.generate_project_assist(diagram, "express")
