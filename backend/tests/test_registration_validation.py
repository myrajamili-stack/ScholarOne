"""Registration validation tests; all database interactions are mocked."""
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

import psycopg2
from werkzeug.security import check_password_hash

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import create_app
from security import issue_access_token


class RegistrationValidationTests(unittest.TestCase):
    def setUp(self):
        # Business-logic tests assume an active account; restriction tests cover the real lookup.
        self.enterContext(patch("security.verify_active_account", return_value=None))
        self.client = create_app().test_client()
        self.payload = dict(full_name="Student Example", email="student@example.com",
                            password="Student123", confirm_password="Student123", role="student")

    @patch("routes.auth.get_db_connection")
    def test_names_containing_numbers_are_rejected_before_database(self, connect):
        for name in ("Ali123", "123", "Ali 2 Ahmad", "Ali\u0661", "Ali\uff11"):
            with self.subTest(name=name):
                response = self.client.post("/api/auth/register", json={**self.payload, "full_name": name})
                self.assertEqual(response.status_code, 400)
                self.assertIn("Full name must not contain numbers.", response.get_data(as_text=True))
        connect.assert_not_called()

    @patch("routes.auth.get_db_connection")
    def test_names_with_accents_and_punctuation_remain_valid(self, connect):
        for name in ("Nur Aisyah", "Anne-Marie O'Neill", "Jos\u00e9", "\u674e\u660e", "Ahmad A/L Kumar"):
            cursor = connect.return_value.cursor.return_value
            cursor.fetchone.side_effect = [None, {"user_id": 11, "full_name": name}]
            with self.subTest(name=name):
                self.assertEqual(self.client.post("/api/auth/register", json={**self.payload, "full_name": name}).status_code, 201)

    @patch("routes.auth.get_db_connection")
    def test_invalid_student_fields_never_reach_database(self, connect):
        for changes in ({"full_name": "  "}, {"full_name": 42}, {"full_name": "x" * 151},
                        {"email": "bad"}, {"email": ["student@example.com"]}, {"email": "a b@example.com"},
                        {"email": "a" * 250 + "@example.com"}, {"password": "short"},
                        {"password": 12345678}, {"password": "        ", "confirm_password": "        "},
                        {"confirm_password": "Different123"}, {"confirm_password": None},
                        {"phone_number": 12345678}, {"phone_number": "abc123"}, {"role": ["admin"]}):
            with self.subTest(changes=changes):
                self.assertEqual(self.client.post("/api/auth/register", json={**self.payload, **changes}).status_code, 400)
        payload = {key: value for key, value in self.payload.items() if key != "confirm_password"}
        self.assertEqual(self.client.post("/api/auth/register", json=payload).status_code, 400)
        connect.assert_not_called()

    @patch("routes.auth.get_db_connection")
    def test_malformed_or_non_object_json_is_rejected(self, connect):
        for raw in ("null", "[]", '"text"', "{", ""):
            self.assertEqual(self.client.post("/api/auth/register", data=raw, content_type="application/json").status_code, 400)
        connect.assert_not_called()

    @patch("routes.auth.get_db_connection")
    def test_normalizes_identity_and_hashes_password_for_valid_student(self, connect):
        cursor = connect.return_value.cursor.return_value
        cursor.fetchone.side_effect = [None, dict(user_id=11, full_name="Student Example", email="student@example.com", role="student")]
        response = self.client.post("/api/auth/register", json={**self.payload,
                                    "full_name": " Student Example ", "email": " Student@Example.COM "})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(cursor.execute.call_args_list[0].args[1], ("student@example.com",))
        values = cursor.execute.call_args_list[1].args[1]
        self.assertEqual(values[:2], ("Student Example", "student@example.com"))
        self.assertNotEqual(values[2], self.payload["password"])
        self.assertTrue(check_password_hash(values[2], self.payload["password"]))
        self.assertNotIn("password", response.json["user"])
        connect.return_value.commit.assert_called_once()

    @patch("routes.auth.get_db_connection")
    def test_duplicate_email_is_rejected_before_insert(self, connect):
        cursor = connect.return_value.cursor.return_value
        cursor.fetchone.return_value = {"user_id": 11}
        self.assertEqual(self.client.post("/api/auth/register", json=self.payload).status_code, 409)
        cursor.execute.assert_called_once()
        self.assertIn("lower(trim(email))", cursor.execute.call_args.args[0])
        connect.return_value.commit.assert_not_called()

    @patch("routes.auth.get_db_connection")
    def test_database_unique_violation_remains_a_conflict(self, connect):
        cursor = connect.return_value.cursor.return_value
        cursor.fetchone.return_value = None
        cursor.execute.side_effect = [None, psycopg2.errors.UniqueViolation()]
        self.assertEqual(self.client.post("/api/auth/register", json=self.payload).status_code, 409)
        connect.return_value.rollback.assert_called_once()

    @patch("routes.auth.get_db_connection")
    def test_staff_creation_still_requires_admin(self, connect):
        for role in ("admin", "advisor"):
            payload = {**self.payload, "role": role}
            self.assertEqual(self.client.post("/api/auth/register", json=payload).status_code, 401)
            headers = {"Authorization": "Bearer " + issue_access_token({"user_id": 11, "role": "student"})}
            self.assertEqual(self.client.post("/api/auth/register", json=payload, headers=headers).status_code, 403)
        connect.assert_not_called()

    @patch("routes.auth.get_db_connection")
    def test_admin_form_can_create_staff_without_confirmation_field(self, connect):
        cursor = connect.return_value.cursor.return_value
        cursor.fetchone.side_effect = [None, {"user_id": 12, "role": "advisor"}]
        payload = {key: value for key, value in self.payload.items() if key != "confirm_password"}
        headers = {"Authorization": "Bearer " + issue_access_token({"user_id": 1, "role": "admin"})}
        self.assertEqual(self.client.post("/api/auth/register", json={**payload, "role": "advisor"}, headers=headers).status_code, 201)

    @patch("routes.auth.get_db_connection")
    def test_provider_confirmation_is_required(self, connect):
        payload = {key: value for key, value in self.payload.items() if key != "confirm_password"}
        self.assertEqual(self.client.post("/api/auth/register", json={**payload, "role": "sponsor"}).status_code, 400)
        connect.assert_not_called()


if __name__ == "__main__":
    unittest.main()
