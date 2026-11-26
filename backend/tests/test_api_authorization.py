"""Access-control regressions using isolated Flask requests and mocked databases."""
from pathlib import Path
import sys
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import create_app
from security import issue_access_token


class ApiAuthorizationTests(unittest.TestCase):
    def setUp(self):
        # Business-logic tests assume an active account; restriction tests cover the real lookup.
        self.enterContext(patch("security.verify_active_account", return_value=None))
        self.app = create_app()
        self.app.testing = True
        self.client = self.app.test_client()

    def headers(self, role="student", user_id=11):
        return {"Authorization": "Bearer " + issue_access_token({"user_id": user_id, "role": role})}

    def request(self, method, url, headers=None, payload=None):
        return self.client.open(url, method=method, headers=headers or {}, json=payload)

    def test_every_admin_route_rejects_anonymous_and_non_admin_users_before_database(self):
        # Discover routes so future unprotected additions also fail this regression.
        with patch("routes.admin.get_db_connection") as database, patch("routes.admin_settings.get_db_connection") as settings_database:
            for rule in self.app.url_map.iter_rules():
                if not rule.rule.startswith("/api/admin/"):
                    continue
                url = rule.rule
                for argument in rule.arguments:
                    url = url.replace("<int:" + argument + ">", "1")
                for method in rule.methods - {"HEAD", "OPTIONS"}:
                    for headers, status in [({}, 401), ({"Authorization": "Bearer invalid"}, 401),
                                            *[(self.headers(role), 403) for role in ("student", "advisor", "sponsor")]]:
                        with self.subTest(url=url, method=method, status=status):
                            self.assertEqual(self.request(method, url, headers, {}).status_code, status)
            database.assert_not_called()
            settings_database.assert_not_called()

    def test_student_application_and_saved_routes_reject_unauthorized_requests_before_database(self):
        routes = [("GET", "/api/applications/student/11"), ("POST", "/api/applications"),
                  ("GET", "/api/students/11/saved-scholarships"),
                  ("POST", "/api/students/11/saved-scholarships/7"),
                  ("DELETE", "/api/students/11/saved-scholarships/7")]
        with patch("routes.applications.get_db_connection") as applications, patch("routes.students.get_db_connection") as students:
            for method, url in routes:
                for headers, status in [({}, 401), ({"Authorization": "Bearer invalid"}, 401),
                                        *[(self.headers(role), 403) for role in ("admin", "advisor", "sponsor")]]:
                    with self.subTest(url=url, method=method, status=status):
                        self.assertEqual(self.request(method, url, headers, {}).status_code, status)
                if method != "POST" or url != "/api/applications":
                    self.assertEqual(self.request(method, url, self.headers(user_id=12), {}).status_code, 403)
            applications.assert_not_called()
            students.assert_not_called()

    def test_expired_tokens_are_rejected(self):
        with patch("security.TOKEN_MAX_AGE", -1), patch("routes.admin.get_db_connection") as database:
            self.assertEqual(self.client.get("/api/admin/dashboard", headers=self.headers("admin")).status_code, 401)
            self.assertEqual(self.client.get("/api/applications/student/11", headers=self.headers()).status_code, 401)
            database.assert_not_called()

    def test_application_cannot_impersonate_another_student(self):
        with patch("routes.applications.get_db_connection") as database:
            for student_id in (12, "11", True, None):
                response = self.client.post("/api/applications", headers=self.headers(),
                                            json={"student_id": student_id, "scholarship_id": 7})
                self.assertEqual(response.status_code, 403)
            database.assert_not_called()

    def test_application_uses_signed_student_identity_with_or_without_legacy_body_id(self):
        for payload in ({"scholarship_id": 7}, {"student_id": 11, "scholarship_id": 7}):
            connection = MagicMock()
            cursor = connection.cursor.return_value
            cursor.fetchone.side_effect = [{"user_id": 11}, {"scholarship_id": 7, "sponsor_id": 8, "title": "Award"}, None,
                                          {"application_id": 9, "student_id": 11}]
            with patch("routes.applications.get_db_connection", return_value=connection):
                response = self.client.post("/api/applications", headers=self.headers(), json=payload)
            self.assertEqual(response.status_code, 201)
            insert = next(call for call in cursor.execute.call_args_list if "insert into application" in call.args[0])
            self.assertEqual(insert.args[1], (11, 7, "pending", None))
            connection.commit.assert_called_once()

    def test_owner_can_read_application_history(self):
        connection = MagicMock()
        cursor = connection.cursor.return_value
        cursor.fetchall.return_value = []
        with patch("routes.applications.get_db_connection", return_value=connection):
            response = self.client.get("/api/applications/student/11", headers=self.headers())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(cursor.execute.call_args.args[1], (11,))

    def test_owner_can_read_save_and_remove_favourites(self):
        for method, suffix in (("GET", ""), ("POST", "/7"), ("DELETE", "/7")):
            connection = MagicMock()
            cursor = connection.cursor.return_value
            cursor.fetchall.return_value = []
            cursor.fetchone.side_effect = [{"student_id": 11}, {"scholarship_id": 7}, {"scholarship_id": 7}]
            with patch("routes.students.get_db_connection", return_value=connection):
                response = self.request(method, "/api/students/11/saved-scholarships" + suffix, self.headers())
            self.assertEqual(response.status_code, 200)
            if method != "GET":
                connection.commit.assert_called_once()

    def test_admin_reaches_newly_protected_handlers(self):
        # Missing records and invalid input are handled normally after authorization.
        for method, url in (("GET", "/api/admin/dashboard"), ("GET", "/api/admin/scholarships"),
                            ("GET", "/api/admin/applications"),
                            ("PATCH", "/api/admin/scholarships/7/status"),
                            ("PATCH", "/api/admin/applications/7/status")):
            with patch("routes.admin.get_db_connection", side_effect=RuntimeError("test database unavailable")) as database:
                response = self.request(method, url, self.headers("admin"), {})
            with self.subTest(url=url):
                self.assertNotIn(response.status_code, (401, 403))
                if method == "GET":
                    database.assert_called_once()


if __name__ == "__main__":
    unittest.main()
