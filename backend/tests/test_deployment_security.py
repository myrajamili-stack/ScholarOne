import os
from unittest import TestCase
from unittest.mock import patch

from app import create_app
from login_throttle import PostgresLoginThrottle
from security import issue_access_token


PRODUCTION = {
    "SCHOLARONE_ENV": "production",
    "SECRET_KEY": "unit-test-key-A8s2G7h9Q1w5Z4j6E0r3",
    "CORS_ALLOWED_ORIGINS": "https://scholarone.example.invalid",
}


class DeploymentSecurityTests(TestCase):
    def test_production_rejects_missing_key_origins_and_enabled_debug(self):
        for override in ({"SECRET_KEY": ""}, {"CORS_ALLOWED_ORIGINS": ""}, {"FLASK_DEBUG": "1"},
                         {"CORS_ALLOWED_ORIGINS": "*"}, {"CORS_ALLOWED_ORIGINS": "http://app.example.invalid"}):
            with self.subTest(override=override), patch.dict(os.environ, {**PRODUCTION, **override}, clear=True):
                with self.assertRaises(RuntimeError):
                    create_app()

    def test_cors_allows_exact_origin_only_and_production_hides_diagnostics(self):
        with patch.dict(os.environ, PRODUCTION, clear=True):
            app = create_app()
        self.assertIsInstance(app.extensions["login_throttle"], PostgresLoginThrottle)
        client = app.test_client()
        good = PRODUCTION["CORS_ALLOWED_ORIGINS"]
        for origin in (good, "https://scholarone.example.invalid.other.invalid", "https://other.invalid"):
            response = client.options("/api/admin/reports", headers={
                "Origin": origin, "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "Authorization",
            })
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.headers.get("Access-Control-Allow-Origin"), good if origin == good else None)
        self.assertEqual(client.get("/api/db-test").status_code, 404)

    def test_tokens_work_across_instances_with_same_key_and_fail_with_different_key(self):
        with patch.dict(os.environ, PRODUCTION, clear=True):
            first, second = create_app(), create_app()
        with first.app_context():
            token = issue_access_token({"user_id": 7, "role": "student"})
        with patch.dict(os.environ, {**PRODUCTION, "SECRET_KEY": PRODUCTION["SECRET_KEY"] + "-different"}, clear=True):
            rotated = create_app()
        auth = {"Authorization": f"Bearer {token}"}
        with (patch("security.verify_active_account", return_value=None),
              patch("routes.advisors.get_db_connection") as connect):
            connect.return_value.cursor.return_value.fetchall.return_value = [{"advisor_id": 5, "full_name": "Review Advisor"}]
            self.assertEqual(second.test_client().get("/api/advisors", headers=auth).status_code, 200)
            self.assertEqual(rotated.test_client().get("/api/advisors", headers=auth).status_code, 401)

    def test_forwarded_ip_requires_explicit_proxy_configuration(self):
        for hops, expected in (("0", "127.0.0.1"), ("1", "192.0.2.4")):
            with patch.dict(os.environ, {"TRUSTED_PROXY_HOPS": hops}, clear=True):
                app = create_app()
            with patch.object(app.extensions["login_throttle"], "retry_after", return_value=30) as limiter:
                response = app.test_client().post("/api/auth/login", headers={"X-Forwarded-For": "192.0.2.4"}, json={})
            self.assertEqual(response.status_code, 429)
            limiter.assert_called_once_with(expected)
