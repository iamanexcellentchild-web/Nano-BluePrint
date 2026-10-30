import io
import zipfile
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from . import ai


@override_settings(DEBUG=True)
class ApiTests(TestCase):
    def setUp(self):
        self.c = APIClient()
        self.user = get_user_model().objects.create_user(username="api-test-user", password="safe-test-password-123")
        self.c.force_authenticate(user=self.user)

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

    def test_published_schema_is_documented_public_and_reusable(self):
        diagram = self.c.get("/api/templates/ecommerce/").json()
        payload = {
            "title": "Small shop schema",
            "description": "A reusable order and payment workflow for a small online shop.",
            "documentation": (
                "## Overview\nA simple online shop order workflow.\n\n"
                "## Data model\nOrders include customer and payment details.\n\n"
                "## How to use\nStart with the order_placed event and configure integrations."
            ),
            "diagram": diagram,
        }
        response = self.c.post("/api/schemas/", payload, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        slug = response.json()["slug"]
        self.assertEqual(self.c.get(f"/api/schemas/{slug}/").json()["documentation"], payload["documentation"])
        self.assertIn(slug, [item["slug"] for item in self.c.get("/api/schemas/?q=small").json()])

        used = self.c.post(f"/api/schemas/{slug}/use/", {"name": "My Shop"}, format="json")
        self.assertEqual(used.status_code, 201, used.content)
        self.assertEqual(used.json()["name"], "My Shop")
        copied = self.c.get(f"/api/projects/{used.json()['id']}/latest/").json()["diagram"]
        self.assertEqual(copied["name"], "My Shop")
        self.assertEqual(copied["nodes"], diagram["nodes"])
        self.assertEqual(self.c.get(f"/api/schemas/{slug}/").json()["use_count"], 1)

    def test_only_publisher_can_edit_published_schema(self):
        user_model = get_user_model()
        owner = user_model.objects.create_user(username="schema-owner", password="long-safe-password-123")
        other = user_model.objects.create_user(username="other-user", password="long-safe-password-123")
        diagram = self.c.get("/api/templates/ecommerce/").json()
        payload = {
            "title": "Owner schema",
            "description": "A documented reusable schema created by its owner.",
            "documentation": (
                "## Overview\nA reusable workflow.\n\n## Data model\nOrders and customers.\n\n"
                "## How to use\nConfigure the events before generating code."
            ),
            "diagram": diagram,
        }
        self.c.force_authenticate(user=owner)
        created = self.c.post("/api/schemas/", payload, format="json")
        self.assertEqual(created.status_code, 201, created.content)
        self.c.force_authenticate(user=other)
        denied = self.c.patch(f"/api/schemas/{created.json()['slug']}/", {"title": "Changed"}, format="json")
        self.assertEqual(denied.status_code, 403)
        self.c.force_authenticate(user=owner)
        allowed = self.c.patch(f"/api/schemas/{created.json()['slug']}/", {"title": "Updated schema"}, format="json")
        self.assertEqual(allowed.status_code, 200, allowed.content)

    @override_settings(DEBUG=False)
    def test_account_registration_and_token_login(self):
        anonymous = APIClient()
        protected_requests = [
            anonymous.get("/api/blocks/"),
            anonymous.get("/api/templates/"),
            anonymous.get("/api/templates/ecommerce/"),
            anonymous.get("/api/schemas/"),
            anonymous.get("/api/projects/"),
            anonymous.post("/api/validate/", {}, format="json"),
            anonymous.post("/api/simulate/", {}, format="json"),
            anonymous.post("/api/generate/", {}, format="json"),
            anonymous.post("/api/generate/ai/", {}, format="json"),
            anonymous.post("/api/ai/", {}, format="json"),
        ]
        self.assertTrue(all(response.status_code in (401, 403) for response in protected_requests))
        self.assertIn(anonymous.get("/api/docs/").status_code, (401, 403))
        self.assertIn(anonymous.get("/api/schema/").status_code, (401, 403))

        registration = anonymous.post("/api/auth/register/", {
            "username": "schema-publisher",
            "password": "distinct-strong-password-123",
        }, format="json")
        self.assertEqual(registration.status_code, 201, registration.content)
        login = anonymous.post("/api/auth/token/", {
            "username": "schema-publisher",
            "password": "distinct-strong-password-123",
        }, format="json")
        self.assertEqual(login.status_code, 200, login.content)
        authenticated = APIClient()
        authenticated.credentials(HTTP_AUTHORIZATION=f"Token {login.json()['token']}")
        self.assertEqual(authenticated.get("/api/blocks/").status_code, 200)
        self.assertEqual(authenticated.get("/api/templates/").status_code, 200)
        docs = authenticated.get("/api/docs/")
        self.assertEqual(docs.status_code, 200)
        self.assertIn(b"requestInterceptor", docs.content)
        self.assertEqual(authenticated.get("/api/schema/").status_code, 200)
        created_project = authenticated.post("/api/projects/", {"name": "Authenticated project"}, format="json")
        self.assertEqual(created_project.status_code, 201, created_project.content)

    def test_publishing_rejects_diagrams_with_errors(self):
        diagram = self.c.get("/api/templates/ecommerce/").json()
        diagram["nodes"].append({
            "id": "bad", "type": "unknown", "label": "Unknown", "config": {},
            "position": {"x": 0, "y": 0},
        })
        response = self.c.post("/api/schemas/", {
            "title": "Invalid schema",
            "description": "A description long enough for validation.",
            "documentation": (
                "## Overview\nThis schema is invalid.\n\n## Data model\nUnknown block.\n\n"
                "## How to use\nIt should not publish."
            ),
            "diagram": diagram,
        }, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("issues", response.json())

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
        anonymous = APIClient()
        self.assertIn(anonymous.get("/api/projects/").status_code, (401, 403))

    @override_settings(DEBUG=True)
    def test_debug_mode_still_requires_authentication(self):
        anonymous = APIClient()
        self.assertIn(anonymous.get("/api/blocks/").status_code, (401, 403))
        self.assertIn(anonymous.get("/api/templates/").status_code, (401, 403))
        self.assertIn(anonymous.get("/api/schemas/").status_code, (401, 403))
        self.assertIn(anonymous.get("/api/projects/").status_code, (401, 403))
