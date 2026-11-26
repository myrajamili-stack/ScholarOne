import unittest
from unittest.mock import patch

import psycopg2
from werkzeug.security import generate_password_hash

from app import create_app
from login_throttle import LoginThrottle


class LoginTests(unittest.TestCase):
    def setUp(self):
        app = create_app()
        app.extensions["login_throttle"] = LoginThrottle(limit=2, window_seconds=60)
        self.client = app.test_client()
        self.connect = self.enterContext(patch("routes.auth.get_db_connection"))
        self.cursor = self.connect.return_value.cursor.return_value
        self.cursor.fetchone.return_value = None
        self.credentials = {"email": "student@example.com", "password": "Example123"}

    def login(self, **changes):
        return self.client.post("/api/auth/login", json={**self.credentials, **changes})

    def test_malformed_and_invalid_requests_do_not_open_database(self):
        self.client.application.extensions["login_throttle"] = LoginThrottle(limit=30)
        for payload in ("[1]", "null", "{", '"text"'):
            self.assertEqual(self.client.post("/api/auth/login", data=payload, content_type="application/json").status_code, 400)
        for changes in ({"email": 1}, {"email": "invalid"}, {"email": "a\x00@example.com"},
                        {"email": "\ud800@example.com"}, {"password": []}, {"password": " "},
                        {"password": "\ud800"}, {"password": "x" * 4097}):
            with self.subTest(changes=list(changes)):
                self.assertEqual(self.login(**changes).status_code, 400)
        oversized = self.client.post("/api/auth/login", data=b" " * (33 * 1024), content_type="application/json")
        self.assertEqual(oversized.status_code, 413)
        self.connect.assert_not_called()

    def test_malformed_requests_count_toward_limit(self):
        for expected in (400, 400, 429):
            response = self.client.post("/api/auth/login", data="{", content_type="application/json")
            self.assertEqual(response.status_code, expected)
        self.connect.assert_not_called()

    def test_throttle_blocks_before_database_and_resets_after_window(self):
        with patch("login_throttle.monotonic", return_value=100) as clock:
            self.assertEqual(self.login().status_code, 401)
            self.assertEqual(self.login(email="other@example.com").status_code, 401)
            response = self.client.post("/api/auth/login", json=self.credentials,
                                        headers={"X-Forwarded-For": "192.0.2.1"})
            self.assertEqual(response.status_code, 429)
            self.assertEqual(response.headers["Retry-After"], "60")
            self.assertEqual(self.connect.call_count, 2)
            response = self.client.post("/api/auth/login", json=self.credentials,
                                        environ_overrides={"REMOTE_ADDR": "192.0.2.2"})
            self.assertEqual(response.status_code, 401)
            clock.return_value = 160
            self.assertEqual(self.login().status_code, 401)

    def test_login_normalizes_active_status_and_preserves_legacy_email_lookup(self):
        self.cursor.fetchone.return_value = {
            "user_id": 7, "role": "student", "status": "ACTIVE",
            "password": generate_password_hash(self.credentials["password"], method="pbkdf2:sha256:1000"),
        }
        response = self.login(email=" Student@Example.com ")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["user"]["status"], "active")
        self.assertIn("access_token", response.json)
        self.assertNotIn("password", response.json["user"])
        self.assertEqual(self.cursor.execute.call_args.args[1],
                         ("Student@Example.com", "student@example.com", "Student@Example.com"))

    def test_blank_unknown_and_restricted_statuses_do_not_receive_tokens(self):
        password = generate_password_hash(self.credentials["password"], method="pbkdf2:sha256:1000")
        with patch("login_throttle.monotonic") as clock:
            for index, status in enumerate((None, "", "unknown", "disabled", "suspended", "pending", "rejected")):
                with self.subTest(status=status):
                    clock.return_value = 100 + 60 * index
                    self.cursor.fetchone.return_value = {
                        "user_id": 7, "role": "student", "status": status, "password": password,
                    }
                    response = self.login()
                    self.assertEqual(response.status_code, 403)
                    self.assertNotIn("access_token", response.json)

    def test_login_database_error_is_sanitized_and_closes_resources(self):
        self.cursor.execute.side_effect = psycopg2.OperationalError("private database detail")
        response = self.login()
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json, {"error": "Unable to complete your request. Please try again."})
        self.cursor.close.assert_called_once()
        self.connect.return_value.close.assert_called_once()

    def test_public_database_failures_do_not_disclose_error_details(self):
        endpoints = {
            "/api/db-test": "health",
            "/api/scholarships": "scholarships",
            "/api/calendar/deadlines": "calendar",
            "/api/advisors": "advisors",
        }
        for endpoint, module in endpoints.items():
            with self.subTest(endpoint=endpoint), patch(
                f"routes.{module}.get_db_connection", side_effect=psycopg2.OperationalError("private database detail")
            ):
                from security import issue_access_token
                headers = {"Authorization": "Bearer " + issue_access_token({"user_id": 7, "role": "student"})}
                with patch("security.verify_active_account", return_value=None):
                    response = self.client.get(endpoint, headers=headers)
                self.assertEqual(response.status_code, 500)
                self.assertNotIn(b"private database detail", response.data)
