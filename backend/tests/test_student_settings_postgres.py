"""Student settings exercised on a disposable local database."""
from contextlib import closing
from datetime import datetime
import os
from pathlib import Path
from unittest import TestCase, skipUnless
from unittest.mock import patch
from uuid import uuid4

from psycopg2 import connect, sql
from psycopg2.extensions import make_dsn, parse_dsn
from werkzeug.security import check_password_hash, generate_password_hash

from app import create_app
from db import get_db_connection
from security import issue_access_token
from scripts.deliver_reminders import deliver_once


DSN = os.getenv("SCHOLARONE_TEST_POSTGRES_DSN")
MIGRATION = Path(__file__).resolve().parents[1] / "migrations" / "20261124090300_student_notification_preferences.sql"
SETTINGS = "/api/students/settings/notifications"
PASSWORD = "/api/auth/student/password"
LOGIN = "/api/auth/login"
OLD_PASSWORD = "FixtureOldPassword"
NEW_PASSWORD = "FixtureNewPassword"


@skipUnless(DSN, "Set SCHOLARONE_TEST_POSTGRES_DSN for local PostgreSQL integration tests")
class StudentSettingsTests(TestCase):
    def setUp(self):
        params = parse_dsn(DSN)
        self.assertEqual(params.get("host"), "127.0.0.1")
        self.assertFalse({"hostaddr", "service", "options"} & params.keys())
        database = sql.Identifier("settings_test_" + uuid4().hex)
        self.database_command(sql.SQL("create database {}").format(database))
        self.addCleanup(self.database_command, sql.SQL("drop database {}").format(database))
        self.enterContext(patch("db.DATABASE_URL", make_dsn(DSN, dbname=database.string)))
        self.execute("""
            create table app_user (user_id bigint primary key, full_name text, email text unique, password text,
                phone_number text, profile_picture text, role text, status text, created_at timestamptz,
                provider_rejection_reason text);
            create table student (student_id bigint primary key references app_user);
            create table notification (user_id bigint references app_user, message text,
                notification_type varchar(50), is_read boolean);
            create table quiz_attempt (student_id bigint references student, assessment_result jsonb);
            insert into app_user (user_id,email,password,role,status) values
                (1,'student@example.invalid',%s,'student','active'),
                (2,'other@example.invalid',null,'student','active'),
                (3,'advisor@example.invalid',null,'advisor','active');
            insert into student values (1),(2);
        """, (generate_password_hash(OLD_PASSWORD, method="pbkdf2:sha256"),))
        self.client = create_app().test_client()
        self.student = self.headers(1)

    @staticmethod
    def database_command(command):
        with closing(connect(DSN)) as connection:
            connection.autocommit = True
            with connection.cursor() as cursor:
                cursor.execute(command)

    @staticmethod
    def execute(query, params=None):
        with closing(get_db_connection()) as connection, connection, connection.cursor() as cursor:
            cursor.execute(query, params)
            return cursor.fetchall() if cursor.description else None

    @staticmethod
    def headers(user_id, role="student"):
        token = issue_access_token({"user_id": user_id, "role": role})
        return {"Authorization": "Bearer " + token}

    def test_preferences_persist_and_filter_only_matching_events(self):
        self.assertEqual(self.client.get(SETTINGS, headers=self.student).status_code, 503)
        self.execute(MIGRATION.read_text())
        self.assertEqual(self.client.get(SETTINGS).status_code, 401)
        self.assertEqual(self.client.get(SETTINGS, headers=self.headers(3, "advisor")).status_code, 403)
        self.assertEqual(self.client.get(SETTINGS, headers=self.student).json["preferences"],
                         {"appointment_alerts": True, "pathway_updates": True})
        for invalid in ({"appointment_alerts": "false"}, {"student_id": 2, "appointment_alerts": False}):
            self.assertEqual(self.client.patch(SETTINGS, headers=self.student, json=invalid).status_code, 400)
        for key in ("appointment_alerts", "pathway_updates"):
            self.assertEqual(self.client.patch(SETTINGS, headers=self.student, json={key: False}).status_code, 200)

        login = self.client.post(LOGIN, json={"email": "student@example.invalid", "password": OLD_PASSWORD})
        self.assertEqual(login.status_code, 200)
        refreshed = {"Authorization": "Bearer " + login.json["access_token"]}
        self.assertEqual(self.client.get(SETTINGS, headers=refreshed).json["preferences"],
                         {"appointment_alerts": False, "pathway_updates": False})
        self.assertEqual(self.client.get(SETTINGS, headers=self.headers(2)).json["preferences"],
                         {"appointment_alerts": True, "pathway_updates": True})
        self.execute("""
            insert into notification values (1,'A','appointment',false),(3,'A','appointment',false),
                (1,'Deadline','scholarship_deadline',false),(2,'B','appointment',false);
            insert into quiz_attempt values (1,'{"kind":"advisor_quiz"}'),(2,'{"hollandCode":"RIA"}'),(2,null);
        """)
        self.assertEqual([(row["user_id"], row["notification_type"]) for row in
                          self.execute("select * from notification order by user_id,notification_type")],
                         [(1, "scholarship_deadline"), (2, "appointment"), (2, "pathway_update"), (3, "appointment")])
        self.client.patch(SETTINGS, headers=refreshed, json={"pathway_updates": True})
        self.execute("""insert into quiz_attempt values (1,'{"hollandCode":"RIA"}')""")
        self.assertEqual(self.execute("select count(*) from notification where user_id=1 and notification_type='pathway_update'")[0]["count"], 1)

    def test_offline_worker_exclusions_overlap_and_deadline_changes(self):
        self.execute(MIGRATION.with_name("20261120_notification_delivery.sql").read_text())
        self.execute("""
            create table scholarship (scholarship_id bigint primary key, title text, status text,
                                       deadline date, import_metadata jsonb);
            create table scholarship_reminder (student_id bigint references student,
                scholarship_id bigint references scholarship, primary key (student_id, scholarship_id));
            insert into scholarship values
                (1,'Within three days','active','2026-11-27','{}'),
                (2,'Outside window','approved','2026-11-28','{}'),
                (3,'At cutoff','approved','2026-11-24','{"deadline_at":"2026-11-24T10:00:00+08:00"}'),
                (4,'Awaiting publication','pending','2026-11-26','{}'),
                (5,'Rejected','rejected','2026-11-26','{}'),
                (6,'Unknown date','approved',null,'{}'),
                (7,'Not selected','approved','2026-11-25','{}'),
                (8,'Closed by provider','approved','2026-11-26','{"declared_closed":true}');
            insert into scholarship_reminder select 1,scholarship_id from scholarship where scholarship_id<>7;
        """)
        instant = datetime.fromisoformat("2026-11-24T10:00:00+08:00")
        with patch("notification_delivery.malaysia_now", return_value=instant):
            with closing(get_db_connection()) as connection, connection, connection.cursor() as cursor:
                cursor.execute("select pg_advisory_xact_lock(hashtext('scholarone:scheduled-reminders'))")
                self.assertIsNone(deliver_once(get_db_connection))
            self.assertEqual(deliver_once(get_db_connection), 1)
            self.assertEqual(deliver_once(get_db_connection), 0)
            self.execute("""update scholarship set deadline='2026-11-26' where scholarship_id=1;
                delete from scholarship_reminder where scholarship_id=4;
                update scholarship set status='approved' where scholarship_id=4""")
            self.assertEqual(deliver_once(get_db_connection), 1)
            self.assertEqual(deliver_once(get_db_connection), 0)
        self.assertEqual(self.execute("select user_id,event_key from notification order by event_key"), [
            {"user_id": 1, "event_key": "scholarship-deadline:1:2026-11-26"},
            {"user_id": 1, "event_key": "scholarship-deadline:1:2026-11-27"},
        ])

    def test_password_change_works_before_migration_and_checks_credentials(self):
        payload = {"current_password": OLD_PASSWORD, "new_password": NEW_PASSWORD, "confirm_password": NEW_PASSWORD}
        self.assertEqual(self.client.post(PASSWORD, json=payload).status_code, 401)
        self.assertEqual(self.client.post(PASSWORD, headers=self.headers(3, "advisor"), json=payload).status_code, 403)
        for invalid in ({"current_password": "WrongPassword"}, {"confirm_password": "MismatchPassword"},
                        {"new_password": "short", "confirm_password": "short"}, {"student_id": 2}):
            self.assertEqual(self.client.post(PASSWORD, headers=self.student, json={**payload, **invalid}).status_code, 400)
        self.assertEqual(self.client.post(PASSWORD, headers=self.student, json=payload).status_code, 200)
        accounts = self.execute("select password from app_user where role='student' order by user_id")
        self.assertTrue(check_password_hash(accounts[0]["password"], NEW_PASSWORD))
        self.assertIsNone(accounts[1]["password"])
        for password, status in ((OLD_PASSWORD, 401), (NEW_PASSWORD, 200)):
            self.assertEqual(self.client.post(LOGIN, json={"email": "student@example.invalid", "password": password}).status_code, status)
