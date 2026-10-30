import io
import zipfile
from unittest.mock import patch

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

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
