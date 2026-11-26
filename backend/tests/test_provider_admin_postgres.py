"""Opt-in integration tests against an isolated local PostgreSQL fixture schema."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
import os
from pathlib import Path
from threading import Barrier
import time
from unittest import TestCase, skipUnless
from unittest.mock import MagicMock, patch
from uuid import uuid4

from psycopg2 import connect, sql
from psycopg2.extensions import make_dsn, parse_dsn
from werkzeug.security import generate_password_hash

from app import create_app
from advisor_scheduling import empty_schedule, malaysia_now
from db import get_db_connection
from pathway_seed import starter_pathways
from security import issue_access_token


DSN = os.getenv("SCHOLARONE_TEST_POSTGRES_DSN")
MIGRATIONS = Path(__file__).resolve().parents[1] / "migrations"
BASE_SCHEMA = """
create table app_user (user_id bigserial primary key, full_name text, email text unique, password text,
    phone_number text, profile_picture text, role text, status text, created_at timestamptz default now());
create table sponsor (sponsor_id bigint primary key references app_user, organization_name text, organization_type text,
    website text, subscription_status text);
create table student (student_id bigint primary key references app_user, field_of_study text,
    date_of_birth date, gender text, nationality text, education_level text, cgpa numeric, university text);
create table advisor (advisor_id bigint primary key references app_user, specialization text,
    qualification text, experience_years integer, average_rating numeric, institution text,
    professional_title text, bio text);
create table review (review_id bigserial primary key, advisor_id bigint references advisor, rating integer);
create table subscription_plan (plan_id bigserial primary key, plan_name text, price numeric,
    scholarship_limit integer, duration_month integer, benefits jsonb, is_active boolean default true);
create table subscription (subscription_id bigserial primary key, sponsor_id bigint references sponsor,
    plan_id bigint references subscription_plan, start_date timestamp, end_date timestamp, subscription_status text);
create table scholarship (scholarship_id bigserial primary key, sponsor_id bigint references sponsor, title text,
    description text, amount numeric, category text, eligibility_criteria text, deadline date, funding_type text,
    study_level text, eligible_state text, import_metadata jsonb, status text, created_at timestamptz default now());
create table application (application_id bigserial primary key, student_id bigint references student,
    scholarship_id bigint references scholarship, application_date date, application_status text, remarks text);
create table audit_log (log_id bigserial primary key, user_id bigint references app_user, action text,
    description text, action_time timestamptz default now());
create table notification (notification_id bigserial primary key, user_id bigint references app_user,
    message text, notification_type text, is_read boolean, created_at timestamptz default now());
insert into app_user (full_name,email,role,status) values
    ('Staging Admin','admin@example.invalid','admin','active'),
    ('Staging Student','student@example.invalid','student','active'),
    ('Second Student','second@example.invalid','student','active');
insert into student (student_id,field_of_study) values (2,'Computing'), (3,'Business');
insert into subscription_plan (plan_name,price,scholarship_limit,duration_month)
    values ('Free',0,1,1), ('Growth',49,4,1);
"""


@skipUnless(DSN, "Set SCHOLARONE_TEST_POSTGRES_DSN to run local PostgreSQL integration tests")
class ProviderAdminPostgresTests(TestCase):
    def setUp(self):
        params = parse_dsn(DSN)
        if params.get("host") != "127.0.0.1" or any(key in params for key in ("hostaddr", "service", "options")):
            self.fail("The integration fixture requires an explicit local 127.0.0.1 PostgreSQL target.")
        self.schema = f"scholarone_test_{uuid4().hex}"
        with closing(connect(DSN)) as connection, connection, connection.cursor() as cursor:
            cursor.execute(sql.SQL("create schema {}").format(sql.Identifier(self.schema)))
        self.addCleanup(self.drop_fixture)
        self.enterContext(patch("db.DATABASE_URL", make_dsn(DSN, options=f"-c search_path={self.schema}")))
        self.execute(BASE_SCHEMA)
        for name in ("20261113_stripe_billing.sql", "20261120_provider_workflows.sql", "20261120_notification_delivery.sql",
                     "20261124_login_rate_limit.sql", "20261124090100_platform_configuration_access.sql"):
            self.execute((MIGRATIONS / name).read_text(encoding="utf-8"))
        self.app = create_app()
        self.client = self.app.test_client()
        self.admin = self.headers(1, "admin")
        self.student = self.headers(2, "student")
        data = {"role": "sponsor", "full_name": "Staging Provider", "email": "provider@example.invalid",
                "password": "FixturePassword123", "confirm_password": "FixturePassword123",
                "phone_number": "+60123456789", "organization_name": "Staging Foundation",
                "organization_type": "Foundation"}
        response = self.client.post("/api/auth/register", json=data)
        self.assertEqual(response.status_code, 201, response.json)
        self.sponsor_id = response.json["user"]["user_id"]
        self.provider = self.headers(self.sponsor_id, "sponsor")
        self.root = f"/api/sponsors/{self.sponsor_id}"
        self.assertEqual(self.client.post(self.root + "/scholarships", headers=self.provider, json=self.listing()).status_code, 403)
        response = self.client.patch(f"/api/admin/users/{self.sponsor_id}/status", headers=self.admin,
                                     json={"status": "active", "admin_id": 99})
        self.assertEqual(response.status_code, 200, response.json)

    def drop_fixture(self):
        with closing(connect(DSN)) as connection, connection, connection.cursor() as cursor:
            cursor.execute(sql.SQL("drop schema {} cascade").format(sql.Identifier(self.schema)))

    @staticmethod
    def execute(query, params=None):
        with closing(get_db_connection()) as connection, connection, connection.cursor() as cursor:
            cursor.execute(query, params)
            return cursor.fetchall() if cursor.description else []

    @staticmethod
    def headers(user_id, role):
        return {"Authorization": "Bearer " + issue_access_token({"user_id": user_id, "role": role})}

    @staticmethod
    def listing(title="Staging award"):
        return {"title": title, "description": "Staging programme", "amount": 800, "category": "General",
                "funding_type": "Scholarship", "eligibility_criteria": "Diploma student", "deadline": "2099-12-31",
                "study_level": "Diploma", "eligible_state": "Johor", "source_url": "https://example.invalid/award"}

    def post_listing(self, title):
        return self.client.post(self.root + "/scholarships", headers=self.provider, json=self.listing(title))

    def test_notification_inboxes_are_owner_scoped_and_read_state_survives_login(self):
        password = "FixturePassword123"
        advisor_id = self.execute("""insert into app_user (full_name,email,role,status)
            values ('Staging Advisor','advisor@example.invalid','advisor','active') returning user_id""")[0]["user_id"]
        self.execute("""create table scholarship_reminder (student_id bigint references student,
            scholarship_id bigint references scholarship, primary key (student_id, scholarship_id))""")
        accounts = [
            (2, "student", "student@example.invalid", "pathway_update"),
            (advisor_id, "advisor", "advisor@example.invalid", "appointment"),
            (self.sponsor_id, "sponsor", "provider@example.invalid", "application_status"),
            (1, "admin", "admin@example.invalid", "scholarship_review"),
        ]
        password_hash = generate_password_hash(password, method="pbkdf2:sha256")
        inbox = "/api/notifications"
        notice_ids = {}
        for user_id, role, _, event_type in accounts:
            self.execute("update app_user set password=%s where user_id=%s", (password_hash, user_id))
            notice_ids[role] = self.execute("""insert into notification (user_id,message,notification_type,is_read,created_at)
                values (%s,%s,%s,false,'2099-11-01T23:20:00+00:00') returning notification_id""",
                (user_id, f"Fixture {role} update", event_type))[0]["notification_id"]

        self.assertEqual(self.client.get(inbox).status_code, 401)
        for user_id, role, email, event_type in accounts:
            with self.subTest(role=role):
                auth = self.headers(user_id, role)
                notice_id = notice_ids[role]
                result = self.client.get(inbox, headers=auth)
                self.assertEqual(result.status_code, 200, result.json)
                latest = result.json["notifications"][0]
                self.assertGreaterEqual(result.json["unread"], 1)
                self.assertEqual((latest["notification_id"], latest["notification_type"], latest["created_at"]),
                                 (notice_id, event_type, "2099-11-01T23:20:00+00:00"))
                other_ids = set(notice_ids.values()) - {notice_id}
                self.assertTrue(other_ids.isdisjoint(row["notification_id"] for row in result.json["notifications"]))
                for other in other_ids:
                    self.assertEqual(self.client.patch(f"{inbox}/{other}", headers=auth, json={"is_read": True}).status_code, 404)

                self.assertEqual(self.client.patch(f"{inbox}/{notice_id}", headers=auth, json={"is_read": True}).status_code, 200)
                new_login = self.client.post("/api/auth/login", json={"email": email, "password": password})
                self.assertEqual(new_login.status_code, 200, new_login.json)
                refreshed = {"Authorization": "Bearer " + new_login.json["access_token"]}
                after = self.client.get(inbox, headers=refreshed).json
                self.assertTrue(after["notifications"][0]["is_read"])
                self.assertEqual(after["unread"], result.json["unread"] - 1)
                self.assertEqual(self.client.patch(f"{inbox}/{notice_id}", headers=refreshed, json={"is_read": False}).status_code, 200)
                self.assertEqual(self.client.get(inbox, headers=refreshed).json["unread"], result.json["unread"])

    def test_advisor_likert_and_legacy_quiz_share_persisted_attempt_workflows(self):
        self.execute("""
            create table quiz (quiz_id bigserial primary key, advisor_id bigint references advisor,
                title text, description text, status text, revision integer default 1,
                created_at timestamp default now(), creation_id uuid, assessment_definition jsonb);
            create unique index quiz_creation_fixture_unique on quiz(advisor_id, creation_id);
            create table quiz_question (question_id bigserial primary key, quiz_id bigint references quiz, question_text text, question_type text);
            create table quiz_option (option_id bigserial primary key, question_id bigint references quiz_question, option_text text, pathway_result text);
            create table quiz_attempt (attempt_id bigserial primary key, quiz_id bigint references quiz, student_id bigint references student,
                attempt_date timestamp default now(), score numeric, result_pathway text, assessment_answers jsonb, assessment_result jsonb,
                assessment_version integer, submission_id uuid, unique(student_id, quiz_id, submission_id));
            create table quiz_answer (attempt_id bigint references quiz_attempt, question_id bigint references quiz_question, selected_option_id bigint references quiz_option);
            create table academic_pathway (pathway_id bigserial primary key, title text, field text, level text, status text, guidance jsonb);
            insert into academic_pathway (title, field, level, status, guidance) values
                ('Business degree route', 'Business', 'Undergraduate', 'active', '{"starting_qualifications":["Diploma"]}'),
                ('Postgraduate business route', 'Business', 'Postgraduate', 'active', '{"starting_qualifications":["Undergraduate"]}');
            update student set education_level='Diploma' where student_id=2;
        """)
        advisor_id = self.execute("""insert into app_user (full_name,email,role,status)
            values ('Assessment Advisor','likert-owner@example.invalid','advisor','active') returning user_id""")[0]["user_id"]
        another_id = self.execute("""insert into app_user (full_name,email,role,status)
            values ('Other Advisor','likert-other@example.invalid','advisor','active') returning user_id""")[0]["user_id"]
        advisor = self.headers(advisor_id, "advisor")
        other = self.headers(another_id, "advisor")
        root = f"/api/quizzes/advisor/{advisor_id}"
        config = self.client.get(root + "/assessment-templates", headers=advisor)
        self.assertEqual(config.status_code, 200)
        career = next(row for row in config.json["templates"] if row["code"] == "CIA-001")
        career_definition = dict(template="CIA-001", code="CIA-001", language="both", scale="interest",
                                 categories=career["categories"], questions=[])
        draft = dict(title=career["title"], description="Fixture.", status="draft")
        legacy = self.client.post(root, headers=advisor, json=draft)
        self.assertEqual(legacy.status_code, 201, legacy.json)
        draft_url = f"{root}/{legacy.json['quiz']['quiz_id']}"
        initial = self.client.get(draft_url, headers=advisor).json["quiz"]
        self.assertEqual(initial["assessment_type"], "multiple_choice")
        self.assertEqual(self.client.get(draft_url, headers=other).status_code, 403)
        converted = self.client.put(draft_url, headers=advisor, json={
            **draft, "revision": initial["revision"], "assessment_type": "likert", "assessment": career_definition,
        })
        self.assertEqual(converted.status_code, 200, converted.json)
        reopened = self.client.get(draft_url, headers=advisor).json["quiz"]
        self.assertEqual(reopened["assessment_type"], "likert")
        self.assertEqual(reopened["assessment"], {**career_definition, "key": "advisor-likert", "target_group": "", "next_question_number": 1})
        self.assertEqual(self.client.put(draft_url, headers=advisor, json={**draft, "revision": reopened["revision"]}).status_code, 409)
        self.assertEqual(self.client.put(draft_url, headers=advisor, json={
            **draft, "assessment_type": "multiple_choice", "revision": reopened["revision"],
        }).status_code, 409)
        switched = self.client.put(draft_url, headers=advisor, json={
            **draft, "assessment_type": "multiple_choice", "revision": reopened["revision"], "confirm_type_change": True,
        })
        self.assertEqual(switched.status_code, 200, switched.json)
        self.assertEqual(switched.json["quiz"]["assessment_type"], "multiple_choice")
        self.assertIsNone(switched.json["quiz"]["assessment"])
        question = dict(id="CIA001", en="Test prompt", ms="Soalan ujian", category="R", weight=1, order=1)
        saved_career = self.client.post(root, headers=advisor, json={
            **draft, "assessment_type": "likert", "assessment": career_definition,
        })
        self.assertEqual(saved_career.status_code, 201, saved_career.json)
        item = saved_career.json["quiz"]
        career_url = f"{root}/{item['quiz_id']}"
        updated = self.client.put(career_url, headers=advisor, json={
            **draft, "assessment_type": "likert", "revision": item["revision"],
            "assessment": {**career_definition, "questions": [question]},
        })
        self.assertEqual(updated.status_code, 200, updated.json)
        reopened = self.client.get(career_url, headers=advisor).json["quiz"]
        numbered_question = {**question, "display_number": 1}
        self.assertEqual(reopened["assessment"]["questions"], [numbered_question])
        self.assertEqual(self.client.put(career_url, headers=advisor, json={
            **draft, "assessment_type": "multiple_choice", "revision": reopened["revision"],
        }).status_code, 409)
        self.assertEqual(self.client.get(career_url, headers=advisor).json["quiz"]["assessment"]["questions"], [numbered_question])
        custom_questions = [
            dict(id=f"Q{str(uuid4()).upper()}", en=f"Prompt {order}", ms=f"Soalan {order}",
                 category="R", weight=order, order=order)
            for order in (1, 2)
        ]
        custom = {**draft, "title": "Custom draft", "assessment_type": "likert",
                  "assessment": {**career_definition, "template": "", "code": "", "questions": custom_questions}}
        response = self.client.post(root, headers=advisor, json=custom)
        self.assertEqual(response.status_code, 201, response.json)
        item = response.json["quiz"]
        custom_url = f"{root}/{item['quiz_id']}"
        before = self.client.get(custom_url, headers=advisor).json["quiz"]["assessment"]["questions"]
        self.assertEqual(before, [{**row, "display_number": row["order"]} for row in custom_questions])
        reordered = [{**before[0], "en": "Revised prompt", "order": 2}, {**before[1], "order": 1}]
        response = self.client.put(custom_url, headers=advisor, json={
            **custom, "revision": item["revision"], "assessment": {**custom["assessment"], "questions": reordered},
        })
        self.assertEqual(response.status_code, 200, response.json)
        after = self.client.get(custom_url, headers=advisor).json["quiz"]["assessment"]["questions"]
        self.assertEqual(after, list(reversed(reordered)))
        self.assertEqual(len({row["id"] for row in after}), 2)
        stale = self.client.put(custom_url, headers=advisor, json={**custom, "revision": item["revision"]})
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(stale.json["code"], "quiz_revision_conflict")
        self.assertEqual(self.client.get(custom_url, headers=advisor).headers["Cache-Control"], "no-store")
        self.assertEqual(self.client.get(custom_url, headers=advisor).json["quiz"]["assessment"]["questions"], after)
        revision = response.json["quiz"]["revision"]
        deleted = self.client.put(custom_url, headers=advisor, json={
            **custom, "revision": revision, "assessment": {**custom["assessment"], "questions": [after[1]]},
        })
        self.assertEqual(deleted.status_code, 200, deleted.json)
        self.assertEqual(deleted.json["quiz"]["assessment"]["next_question_number"], 3)
        new_question = dict(id=f"Q{str(uuid4()).upper()}", en="Replacement prompt", ms="Soalan ganti",
                            category="R", weight=1, order=1)
        save = {**custom, "revision": deleted.json["quiz"]["revision"]}
        reuse = self.client.put(custom_url, headers=advisor, json={
            **save, "assessment": {**custom["assessment"], "questions": [{**new_question, "display_number": 2}, after[1]]},
        })
        self.assertEqual(reuse.status_code, 400)
        replacement = self.client.put(custom_url, headers=advisor, json={
            **save, "assessment": {**custom["assessment"], "questions": [new_question, after[1]]},
        })
        self.assertEqual(replacement.status_code, 200, replacement.json)
        self.assertEqual(self.client.get(custom_url, headers=advisor).json["quiz"]["assessment"]["questions"],
                         [{**new_question, "display_number": 3}, after[1]])
        template = next(row for row in config.json["templates"] if row["code"] == "FSI-001")
        questions = [dict(id=f"FSI{index:03}", order=index, weight=1, category=category,
                          en=f"Test prompt {index}", ms=f"Soalan ujian {index}")
                     for index, category in enumerate(template["question_categories"], 1)]
        definition = dict(template="FSI-001", code="FSI-001", language="both", scale="interest",
                          target_group="Fixture students", categories=template["categories"], questions=questions)
        payload = dict(title=template["title"], description="Fixture for this test.", assessment_type="likert",
                       status="draft", assessment=definition, creation_id=str(uuid4()))
        self.assertEqual(self.client.post(root, headers=other, json=payload).status_code, 403)
        self.assertEqual(self.client.post(root, headers=advisor, json={**payload, "status": "published"}).status_code, 409)
        created = self.client.post(root, headers=advisor, json=payload)
        self.assertEqual(created.status_code, 201, created.json)
        self.assertEqual(self.client.post(root, headers=advisor, json=payload).status_code, 200)
        item = created.json["quiz"]
        self.assertEqual(item["question_count"], 30)
        self.assertEqual([row["display_number"] for row in item["assessment"]["questions"]], list(range(1, 31)))
        quiz_id = item["quiz_id"]
        self.assertEqual(self.client.get(f"/api/quizzes/{quiz_id}/take", headers=self.student).status_code, 404)
        self.assertEqual(self.client.get(f"/api/quizzes/advisor/{another_id}/{quiz_id}", headers=other).status_code, 404)
        self.assertEqual(self.client.put(f"{root}/{quiz_id}", headers=self.student, json=payload).status_code, 403)
        published = self.client.put(f"{root}/{quiz_id}", headers=advisor,
                                    json={**payload, "status": "published", "revision": item["revision"]})
        self.assertEqual(published.status_code, 200, published.json)
        revision = published.json["quiz"]["revision"]
        self.assertEqual(self.client.put(f"{root}/{quiz_id}", headers=advisor, json={
            **draft, "assessment_type": "multiple_choice", "revision": revision, "confirm_type_change": True,
        }).status_code, 409)
        catalogue = self.client.get("/api/quizzes").json
        self.assertEqual(next(row for row in catalogue if row["quiz_id"] == quiz_id)["question_count"], 30)
        quiz = self.client.get(f"/api/quizzes/{quiz_id}/take", headers=self.student).json["quiz"]
        public = quiz["assessment"]
        self.assertEqual(public["questions"][0]["ms"], "Soalan ujian 1")
        self.assertEqual([row["value"] for row in public["scale"]], [1, 2, 3, 4, 5])
        self.assertNotIn("category", public["questions"][0])
        self.assertNotIn("weight", public["questions"][0])
        self.assertNotIn("categories", public)
        self.assertEqual(self.client.get(f"/api/quizzes/{quiz_id}/take").status_code, 401)
        answers = {row["id"]: {"BMF": 5, "ET": 4}.get(row["category"], 2) for row in questions}
        submit_url = f"/api/quizzes/{quiz_id}/attempts"
        submission = dict(answers=answers, revision=revision, submission_id=str(uuid4()))
        for invalid in ({}, {**answers, "FSI001": 6}, {**answers, "FSI001": True}):
            self.assertEqual(self.client.post(submit_url, headers=self.student, json={**submission, "answers": invalid}).status_code, 400)
        saved = self.client.post(submit_url, headers=self.student, json=submission)
        self.assertEqual(saved.status_code, 201, saved.json)
        attempt = saved.json["attempt"]
        self.assertEqual(self.client.post(submit_url, headers=self.student, json=submission).json["attempt"], attempt)
        result = attempt["result"]
        self.assertEqual([row["code"] for row in result["category_scores"][:3]], ["BMF", "ET", "AMC"])
        self.assertEqual(result["category_scores"][0]["score"], 25)
        self.assertEqual(len(result["leading_outcomes"]), 3)
        self.assertEqual(len(result["answers"]), 30)
        self.assertEqual(self.client.get(f"{submit_url}/latest", headers=self.headers(3, "student")).json["attempt"], None)
        self.assertEqual(self.client.get(f"{root}/{quiz_id}/attempts", headers=advisor).json["attempts"][0]["result"], result)
        self.assertEqual(self.client.get(f"/api/quizzes/advisor/{another_id}/{quiz_id}/attempts", headers=other).status_code, 404)
        changed = {**definition, "questions": [{**questions[0], "en": "Edited"}, *questions[1:]]}
        self.assertEqual(self.client.put(f"{root}/{quiz_id}", headers=advisor,
            json={**payload, "revision": revision, "assessment": changed}).status_code, 409)
        renamed = self.client.put(f"{root}/{quiz_id}", headers=advisor,
                                  json={**payload, "status": "published", "title": "Updated label", "revision": revision})
        self.assertEqual(renamed.status_code, 200, renamed.json)
        self.assertEqual(self.client.post(submit_url, headers=self.student, json={**submission, "submission_id": str(uuid4())}).status_code, 409)
        self.execute("update app_user set password=%s where user_id=2", (generate_password_hash("AssessmentFixture123"),))
        reloaded = self.app.test_client()
        login = reloaded.post("/api/auth/login", json={"email": "student@example.invalid", "password": "AssessmentFixture123"})
        self.assertEqual(login.status_code, 200, login.json)
        new_session = {"Authorization": "Bearer " + login.json["access_token"]}
        self.assertEqual(reloaded.get(f"{submit_url}/latest", headers=new_session).json["attempt"], attempt)
        suggested = reloaded.get("/api/pathways/recommendations", headers=new_session).json["pathways"]
        self.assertEqual([row["title"] for row in suggested], ["Business degree route"])
        self.assertTrue(any("advisor interest assessment" in reason for reason in suggested[0]["reasons"]))
        unpublished = self.client.put(f"{root}/{quiz_id}", headers=advisor,
                                      json={**payload, "revision": renamed.json["quiz"]["revision"]})
        self.assertEqual(unpublished.status_code, 200, unpublished.json)
        self.assertEqual(self.client.put(f"{root}/{quiz_id}", headers=advisor, json={
            **draft, "assessment_type": "multiple_choice", "revision": unpublished.json["quiz"]["revision"], "confirm_type_change": True,
        }).status_code, 409)
        self.assertEqual(reloaded.get(f"{submit_url}/latest", headers=new_session).json["attempt"], attempt)

        legacy = self.client.post(root, headers=advisor, json=dict(title="Existing format", status="published",
            questions=[dict(question_text="Which route?", options=[dict(option_text="Business"), dict(option_text="Computing")])]))
        self.assertEqual(legacy.status_code, 201, legacy.json)
        legacy_id = legacy.json["quiz"]["quiz_id"]
        item = self.client.get(f"/api/quizzes/{legacy_id}/take", headers=new_session).json["quiz"]["questions"][0]
        scored = self.client.post(f"/api/quizzes/{legacy_id}/attempts", headers=new_session,
            json=dict(answers={str(item["question_id"]): item["options"][0]["option_id"]}, revision=1, submission_id=str(uuid4())))
        self.assertEqual(scored.status_code, 201, scored.json)
        self.assertEqual(scored.json["attempt"]["result"]["leading_outcomes"], ["Business"])
        self.assertEqual(len(self.execute("select * from quiz_answer")), 1)
        bilingual = dict(title="Bilingual MCQ", status="published", language="both", questions=[
            dict(question_text="Which route?", question_text_ms="Laluan mana?", options=[
                dict(option_text="Business", option_text_ms="Perniagaan", pathway_result="Business"),
                dict(option_text="Computing", option_text_ms="Pengkomputeran"),
            ]),
        ])
        created = self.client.post(root, headers=advisor, json=bilingual)
        self.assertEqual(created.status_code, 201, created.json)
        mcq_id = created.json["quiz"]["quiz_id"]
        loaded = self.client.get(f"{root}/{mcq_id}", headers=advisor).json["quiz"]
        self.assertEqual(loaded["language"], "both")
        self.assertEqual(loaded["questions"][0]["question_text_ms"], "Laluan mana?")
        take = self.client.get(f"/api/quizzes/{mcq_id}/take", headers=new_session).json["quiz"]
        question = take["questions"][0]
        self.assertNotIn("pathway_result", question["options"][0])
        self.assertEqual(question["options"][0]["option_text_ms"], "Perniagaan")
        scored = self.client.post(f"/api/quizzes/{mcq_id}/attempts", headers=new_session,
            json=dict(answers={str(question["question_id"]): question["options"][0]["option_id"]}, revision=1, submission_id=str(uuid4())))
        self.assertEqual(scored.status_code, 201, scored.json)
        result = scored.json["attempt"]["result"]
        self.assertEqual(result["leading_outcomes"], ["Business"])
        self.assertEqual(result["answers"][0]["answer_ms"], "Perniagaan")
        self.assertEqual(self.client.get(f"{root}/{mcq_id}/attempts", headers=advisor).status_code, 200)

    def test_advisor_dashboard_uses_only_persisted_consultation_ratings(self):
        self.execute("""
            create table appointment (appointment_id bigserial primary key, student_id bigint references student,
                advisor_id bigint references advisor, appointment_datetime timestamp, appointment_status text,
                duration_minutes integer, consultation_topic text, student_message text, rejection_reason text);
            alter table review add column student_id bigint references student,
                add column appointment_id bigint unique references appointment,
                add column comment text, add column created_at timestamp default now();
            create table advisor_schedule (advisor_id bigint primary key references advisor, availability jsonb,
                blocked_dates jsonb, slot_minutes integer, daily_breaks jsonb, updated_at timestamp);
            create table conversation_participant (conversation_id bigint, user_id bigint);
            create table message (message_id bigint, conversation_id bigint, sender_id bigint, is_read boolean);
            create table quiz (quiz_id bigint, advisor_id bigint);
            create table quiz_attempt (attempt_id bigint, quiz_id bigint, score numeric);
        """)
        password = "TestConsultationPassword123"
        password_hash = generate_password_hash(password, method="pbkdf2:sha256")
        self.execute("update app_user set password = %s where user_id in (2, 3)", (password_hash,))
        advisors = self.execute("""
            insert into app_user (full_name, email, password, role, status) values
                ('Advisor A', 'advisor-a@example.invalid', %s, 'advisor', 'active'),
                ('Advisor B', 'advisor-b@example.invalid', %s, 'advisor', 'active')
            returning user_id, email
        """, (password_hash, password_hash))
        advisor_a, advisor_b = (row["user_id"] for row in advisors)
        self.execute("insert into advisor (advisor_id, average_rating) values (%s, 4.8), (%s, 4.8)", (advisor_a, advisor_b))

        def login(client, email):
            response = client.post("/api/auth/login", json={"email": email, "password": password})
            self.assertEqual(response.status_code, 200, response.json)
            return {"Authorization": "Bearer " + response.json["access_token"]}

        def rating(client, advisor_id, headers):
            response = client.get(f"/api/advisors/{advisor_id}/dashboard", headers=headers)
            self.assertEqual(response.status_code, 200, response.json)
            self.assertEqual(response.json["summary"]["average_rating"], response.json["feedback"]["average_rating"])
            value = response.json["summary"]["average_rating"]
            return (None if value is None else float(value), response.json["feedback"]["total_reviews"])

        student = login(self.client, "student@example.invalid")
        other_student = login(self.client, "second@example.invalid")
        first, second = (login(self.client, row["email"]) for row in advisors)
        self.assertEqual(rating(self.client, advisor_a, first), (None, 0))
        self.assertEqual(self.client.get(f"/api/advisors/{advisor_a}/dashboard", headers=second).status_code, 403)
        self.assertEqual(self.client.get(f"/api/advisors/{advisor_a}/dashboard").status_code, 401)

        schedule = empty_schedule()
        for day in schedule["availability"]:
            day.update(enabled=True, start_time="09:00", end_time="12:00")
        for advisor_id, headers in ((advisor_a, first), (advisor_b, second)):
            response = self.client.put(f"/api/advisors/{advisor_id}/schedule", headers=headers, json=schedule)
            self.assertEqual(response.status_code, 200, response.json)

        day = (malaysia_now() + timedelta(days=2)).date()
        review_ids = []
        for index, (advisor_id, headers, stars) in enumerate(
            [(advisor_a, first, 4), (advisor_a, first, 5), (advisor_a, first, 3), (advisor_b, second, 5)]
        ):
            selected = f"{day.isoformat()}T{9 + index // 2:02}:{30 * (index % 2):02}"
            response = self.client.post(f"/api/advisors/{advisor_id}/appointments", headers=student,
                                        json={"appointment_datetime": selected, "consultation_topic": "Fixture consultation"})
            self.assertEqual(response.status_code, 201, response.json)
            appointment = response.json["appointment_id"]
            review = f"/api/appointments/{appointment}/review"
            state = f"/api/advisors/{advisor_id}/appointments/{appointment}/status"
            response = self.client.patch(state, headers=headers, json={"status": "confirmed"})
            self.assertEqual(response.status_code, 200, response.json)
            if index == 0:
                self.assertEqual(self.client.post(review, headers=student, json={"rating": stars}).status_code, 409)
                self.assertEqual(self.client.patch(state, headers=headers, json={"status": "completed"}).status_code, 409)

            after_session = datetime.fromisoformat(selected) + timedelta(hours=1)
            with patch("routes.advisors.malaysia_now", return_value=after_session), \
                 patch("routes.appointment_actions.malaysia_now", return_value=after_session):
                response = self.client.patch(state, headers=headers, json={"status": "completed"})
                self.assertEqual(response.status_code, 200, response.json)
                if index == 0:
                    self.assertEqual(self.client.post(review, json={"rating": stars}).status_code, 401)
                    self.assertEqual(self.client.post(review, headers=other_student, json={"rating": stars}).status_code, 404)
                    self.assertEqual(self.client.post(review, headers=student, json={"rating": 6}).status_code, 400)
                response = self.client.post(review, headers=student, json={"rating": stars})
                self.assertEqual(response.status_code, 201, response.json)
                review_ids.append(response.json["review"]["review_id"])
                self.assertEqual(self.client.get(review, headers=student).json["review"]["rating"], stars)
                self.assertEqual(self.client.post(review, headers=student, json={"rating": stars}).status_code, 409)
            if index == 0:
                self.assertEqual(rating(self.client, advisor_a, first), (4.0, 1))
                self.assertEqual(rating(self.client, advisor_b, second), (None, 0))
            elif index == 1:
                self.assertEqual(rating(self.client, advisor_a, first), (4.5, 2))

        # Legacy data can contain unlinked, out-of-range, incomplete or misattributed rows.
        for appointment_advisor, status, stars in (
            (advisor_a, "completed", 9), (advisor_a, "pending", 5), (advisor_b, "completed", 5)
        ):
            appointment = self.execute("""
                insert into appointment (student_id, advisor_id, appointment_datetime, appointment_status)
                values (2, %s, now() - interval '1 day', %s) returning appointment_id
            """, (appointment_advisor, status))[0]["appointment_id"]
            self.execute("insert into review (student_id, advisor_id, appointment_id, rating) values (2, %s, %s, %s)",
                         (advisor_a, appointment, stars))
        self.execute("insert into review (student_id, advisor_id, rating) values (2, %s, 5)", (advisor_a,))
        self.assertEqual(rating(self.client, advisor_a, first), (4.0, 3))
        self.assertEqual(rating(self.client, advisor_b, second), (5.0, 1))
        new_session = self.app.test_client()
        self.assertEqual(rating(new_session, advisor_a, login(new_session, advisors[0]["email"])), (4.0, 3))
        self.execute("delete from review where review_id = %s", (review_ids[2],))
        self.assertEqual(rating(self.client, advisor_a, first), (4.5, 2))

    def test_payment_reconciliation_and_concurrent_listing_quota(self):
        # An active legacy paid-plan row is deliberately missing Stripe payment evidence.
        self.execute("insert into subscription (sponsor_id,plan_id,subscription_status) values (%s,2,'active')", (self.sponsor_id,))
        start = Barrier(2, timeout=5)

        def submit(title):
            start.wait()
            with self.app.test_client() as client:
                return client.post(self.root + "/scholarships", headers=self.provider, json=self.listing(title)).status_code

        with ThreadPoolExecutor(2) as pool:
            self.assertEqual(sorted(pool.map(submit, ["Concurrent A", "Concurrent B"])), [201, 403])
        self.assertEqual(self.execute("select count(*) as count from scholarship")[0]["count"], 1)
        self.execute("update sponsor set stripe_customer_id='cus_fixture' where sponsor_id=%s", (self.sponsor_id,))

        now = datetime.now(timezone.utc)
        gateway = MagicMock()
        subscription = {"id": "sub_fixture", "customer": "cus_fixture", "livemode": False, "status": "active",
                        "cancel_at_period_end": False, "created": int(now.timestamp()),
                        "items": {"data": [{"current_period_start": int((now - timedelta(seconds=1)).timestamp()),
                                           "current_period_end": int((now + timedelta(days=30)).timestamp()),
                                           "price": {"id": "price_fixture", "currency": "myr", "unit_amount": 4900,
                                                     "recurring": {"interval": "month"}, "metadata": {"plan_id": "2"}}}]},
                        "latest_invoice": {"id": "in_fixture", "created": int(now.timestamp()), "status": "open",
                                           "currency": "myr", "amount_due": 4900}}
        gateway.v1.subscriptions.retrieve.return_value = subscription
        gateway.v1.subscriptions.list.return_value.data = [subscription]
        secret = "whsec_local_fixture"
        with (patch("routes.billing.stripe_client", return_value=gateway),
              patch.dict(os.environ, {"STRIPE_WEBHOOK_SECRET": secret})):
            self.assertEqual(self.client.post(self.root + "/billing/refresh", headers=self.provider).status_code, 200)
            self.assertEqual(self.post_listing("Unpaid plan").status_code, 403)
            subscription["latest_invoice"].update(status="paid", amount_paid=4900, status_transitions={"paid_at": int(now.timestamp())})
            event = json.dumps({"id": "evt_fixture", "livemode": False, "type": "invoice.paid",
                                "data": {"object": {"id": "in_fixture", "subscription": "sub_fixture"}}}).encode()
            stamp = str(int(time.time()))
            signature = hmac.new(secret.encode(), stamp.encode() + b"." + event, hashlib.sha256).hexdigest()
            for _ in range(2):
                result = self.client.post("/api/billing/stripe/webhook", data=event,
                                          headers={"Stripe-Signature": f"t={stamp},v1={signature}"})
                self.assertEqual(result.status_code, 200, result.json)
            allowed = self.post_listing("Paid plan")
            self.assertEqual(allowed.status_code, 201, allowed.json)
            subscription["cancel_at_period_end"] = True
            self.assertEqual(self.client.post(self.root + "/billing/refresh", headers=self.provider).status_code, 200)
            self.assertEqual(self.post_listing("Scheduled cancellation").status_code, 201)
            self.execute("update subscription set end_date=(now() at time zone 'UTC')-interval '1 second' where stripe_subscription_id='sub_fixture'")
            self.assertEqual(self.post_listing("Expired period").status_code, 403)
            subscription["status"] = "canceled"
            self.assertEqual(self.client.post(self.root + "/billing/refresh", headers=self.provider).status_code, 200)
            self.assertEqual(self.post_listing("Cancelled plan").status_code, 403)
        self.assertEqual(self.execute("select count(*) as count from subscription_payment")[0]["count"], 1)
        report = self.client.get("/api/admin/reports", headers=self.admin)
        self.assertEqual(report.status_code, 200, report.json)
        self.assertEqual(report.json["active_subscriptions"], 0)
        self.assertEqual(report.json["payments"]["revenue_by_currency"], [{"currency": "myr", "amount": "49.00", "invoice_count": 1}])

    def test_settings_show_only_current_entitled_plan_after_new_login(self):
        plan = self.execute("""insert into subscription_plan(plan_name,price,scholarship_limit,duration_month)
            values ('Professional',99,10,1) returning plan_id""")[0]["plan_id"]
        password = "FixtureEntitlementPassword"
        hashed = generate_password_hash(password)
        emails = ("provider@example.invalid", "professional@example.invalid", "no-active@example.invalid")
        provider_ids = [self.sponsor_id]
        self.execute("update app_user set password=%s where user_id=%s", (hashed, self.sponsor_id))
        for email in emails[1:]:
            uid = self.execute("""insert into app_user(full_name,email,password,role,status)
                values ('Fixture provider',%s,%s,'sponsor','active') returning user_id""", (email, hashed))[0]["user_id"]
            self.execute("insert into sponsor(sponsor_id) values (%s)", (uid,))
            provider_ids.append(uid)
        free, professional, none = provider_ids
        self.execute("update sponsor set subscription_status='professional' where sponsor_id in (%s,%s,%s)",
                     (free, professional, none))
        self.execute("""insert into subscription(sponsor_id,plan_id,subscription_status,start_date,end_date,
                                  stripe_subscription_id,stripe_status,payment_status)
            values (%s,1,'active',null,null,null,null,null),
                   (%s,%s,'active',null,null,null,null,null),
                   (%s,1,'active',null,null,null,null,null),
                   (%s,%s,'active',(now() at time zone 'UTC') - interval '1 day',(now() at time zone 'UTC') + interval '1 day',
                        'sub_fixture_professional','active','paid'),
                   (%s,1,'cancelled',null,null,null,null,null),
                   (%s,%s,'active',null,null,null,null,null)
        """, (free,free,plan,professional,professional,plan,none,none,plan))
        for i, (uid, email, expected) in enumerate(zip(provider_ids, emails, ("Free", "Professional", None))):
            existing = self.headers(uid, "sponsor")
            for client in (self.client, self.app.test_client()):
                login = client.post("/api/auth/login", json={"email":email,"password":password})
                self.assertEqual(login.status_code, 200)
                headers = {"Authorization":"Bearer "+login.json["access_token"]}
                settings = client.get(f"/api/sponsors/{uid}/settings", headers=headers)
                self.assertEqual(settings.status_code, 200, settings.json)
                self.assertEqual(settings.json["subscription_plan_name"], expected)
                self.assertEqual(settings.headers["Cache-Control"], "no-store")
                if expected:
                    subscriptions = client.get(f"/api/sponsors/{uid}/subscriptions", headers=headers)
                    self.assertEqual(subscriptions.json["current_subscription"]["plan_name"], expected)
                dashboard = client.get(f"/api/sponsors/{uid}/dashboard", headers=headers)
                self.assertEqual(dashboard.status_code, 200, dashboard.json)
                self.assertEqual(dashboard.json["subscription"]["plan_name"], expected or "Free")
            other = provider_ids[(i+1)%len(provider_ids)]
            for suffix in ("settings", "subscriptions"):
                self.assertEqual(self.client.get(f"/api/sponsors/{other}/{suffix}", headers=existing).status_code, 403)

    def test_provider_moderation_views_application_audit_and_reports(self):
        created = self.post_listing("Staging award")
        self.assertEqual(created.status_code, 201, created.json)
        identifier = created.json["scholarship"]["scholarship_id"]
        public, review = f"/api/scholarships/{identifier}", f"/api/admin/scholarships/{identifier}/status"
        self.assertEqual(self.client.post(public + "/view", headers=self.student).status_code, 404)
        rejected = self.client.patch(review, headers=self.admin, json={"status": "rejected", "rejection_reason": "Add entry criteria."})
        self.assertEqual(rejected.status_code, 200, rejected.json)
        appeal = self.client.post(self.root + "/appeals", headers=self.provider,
                                  json={"scholarship_id": identifier, "appeal_message": "Please reconsider the published entry criteria."})
        self.assertEqual(appeal.status_code, 201, appeal.json)
        self.assertEqual(self.client.patch(review, headers=self.admin, json={"status": "approved"}).status_code, 200)
        for recorded, auth in ((True, self.student), (False, self.student), (True, self.headers(3, "student"))):
            self.assertEqual(self.client.post(public + "/view", headers=auth).json, {"recorded": recorded})
        self.execute("insert into scholarship_view (scholarship_id, student_id, viewed_on) values (%s, 2, (now() at time zone 'Asia/Kuala_Lumpur')::date - 1)", (identifier,))
        stats = self.client.get(self.root + "/statistics", headers=self.provider)
        self.assertEqual(stats.status_code, 200, stats.json)
        self.assertEqual((stats.json["summary"]["total_views"], stats.json["summary"]["unique_viewers"]), (3, 2))
        submitted = self.client.post("/api/applications", headers=self.student, json={"scholarship_id": identifier})
        self.assertEqual(submitted.status_code, 201, submitted.json)
        application_id = submitted.json["application"]["application_id"]
        provider_status = f"{self.root}/applications/{application_id}"
        admin_status = f"/api/admin/applications/{application_id}/status"
        self.assertEqual(self.client.patch(admin_status, headers=self.provider, json={"status": "approved"}).status_code, 403)
        self.assertEqual(self.client.patch(provider_status, headers=self.provider, json={"status": "approved"}).status_code, 200)
        for _ in range(2):
            self.assertEqual(self.client.patch(admin_status, headers=self.admin, json={"status": "rejected", "actor_id": 99}).status_code, 200)
        note = {"status": "rejected", "remarks": "Please attach the missing transcript."}
        for _ in range(2):
            self.assertEqual(self.client.patch(admin_status, headers=self.admin, json=note).status_code, 200)
        log = self.execute("select user_id,description from audit_log where action='update_application_status' order by log_id")
        self.assertEqual([row["user_id"] for row in log], [self.sponsor_id, 1, 1])
        self.assertIn("approved to rejected", log[1]["description"])
        self.assertIn("remarks updated", log[2]["description"])
        self.assertNotIn(note["remarks"], log[2]["description"])
        self.assertEqual(self.client.get("/api/applications/student/2", headers=self.student).json[0]["application_status"], "rejected")
        report_date = self.execute("select application_date from application")[0]["application_date"]
        report = self.client.get(f"/api/admin/reports?start={report_date}&end={report_date}", headers=self.admin)
        self.assertEqual(report.status_code, 200, report.json)
        self.assertEqual(report.json["statuses"], [{"label": "rejected", "count": 1}])
        self.assertEqual(report.json["scholarships"][0]["count"], 1)
        setting = self.client.patch("/api/admin/settings", headers=self.admin, json={
            "section": "general", "platform_name": "Staging ScholarOne", "platform_tagline": "Staging tagline",
            "platform_description": "Temporary test settings.",
        })
        self.assertEqual(setting.status_code, 200, setting.json)
        staff = self.client.post("/api/auth/register", headers=self.admin, json={
            "role": "advisor", "full_name": "Staging Advisor", "email": "advisor@example.invalid",
            "password": "FixturePassword123", "actor_id": 99,
        })
        self.assertEqual(staff.status_code, 201, staff.json)
        audit = self.execute("""select action,user_id from audit_log
                                 where action in ('update_admin_settings','create_staff_account') order by log_id""")
        self.assertEqual(audit, [{"action": "update_admin_settings", "user_id": 1},
                                 {"action": "create_staff_account", "user_id": 1}])
        advisor = self.client.get("/api/advisors", headers=self.student)
        self.assertEqual(advisor.status_code, 200, advisor.json)
        self.assertEqual([row["full_name"] for row in advisor.json], ["Staging Advisor"])
        self.assertNotIn("email", advisor.json[0])
        self.assertNotIn("status", advisor.json[0])

    def test_shared_rate_limit_and_recovery_after_database_error(self):
        protected = self.execute("""select relname,relrowsecurity from pg_class
            where relnamespace=current_schema()::regnamespace
            and relname in ('login_rate_limit','platform_configuration') order by relname""")
        self.assertEqual(protected, [{"relname": "login_rate_limit", "relrowsecurity": True},
                                     {"relname": "platform_configuration", "relrowsecurity": True}])
        settings = {"SCHOLARONE_ENV": "production", "SECRET_KEY": "unit-test-key-A8s2G7h9Q1w5Z4j6E0r3",
                    "CORS_ALLOWED_ORIGINS": "https://scholarone.example.invalid"}
        with patch.dict(os.environ, settings):
            first, second = create_app(), create_app()
        for app in (first, second):
            app.extensions["login_throttle"].limit = 2
            app.extensions["login_throttle"].window_seconds = 3600
        start = Barrier(4, timeout=5)

        def attempt(app):
            start.wait()
            return app.test_client().post("/api/auth/login", json={}).status_code

        with ThreadPoolExecutor(4) as pool:
            self.assertEqual(sorted(pool.map(attempt, (first, second, first, second))), [400, 400, 429, 429])
        self.assertEqual(self.execute("select attempts from login_rate_limit"), [{"attempts": 2}])
        self.execute("alter table login_rate_limit rename to temporarily_unavailable")
        response = second.test_client().post("/api/auth/login", json={})
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("login_rate_limit", str(response.json))
        self.execute("alter table temporarily_unavailable rename to login_rate_limit")
        self.assertEqual(second.test_client().post("/api/auth/login", json={}).status_code, 429)
        login = first.test_client().post("/api/auth/login", environ_overrides={"REMOTE_ADDR": "192.0.2.3"},
                                         json={"email": "provider@example.invalid", "password": "FixturePassword123"})
        self.assertEqual(login.status_code, 200, login.json)
        auth = {"Authorization": "Bearer " + login.json["access_token"]}
        self.assertEqual(second.test_client().get(self.root + "/statistics", headers=auth).status_code, 200)

    def test_listing_lifecycle_filters_and_admin_appointment_total(self):
        other_sponsor = self.execute("""insert into app_user(full_name,email,role,status)
            values ('Other provider','other-provider@example.invalid','sponsor','active') returning user_id""")[0]["user_id"]
        self.execute("insert into sponsor(sponsor_id) values (%s)", (other_sponsor,))
        rows = self.execute("""
            insert into scholarship(sponsor_id,title,status,deadline,import_metadata) values
                (%s,'Active','approved','2026-11-25','{}'),
                (%s,'Expired','active','2026-11-25','{"deadline_at":"2026-11-25T17:00:00+08:00"}'),
                (%s,'Pending','pending','2026-11-26','{}'),
                (%s,'Unconfirmed','approved',null,'{}'),
                (%s,'Other sponsor','approved','2026-11-26','{}')
            returning scholarship_id""", (self.sponsor_id,)*4+(other_sponsor,))
        ids = [row["scholarship_id"] for row in rows]
        for identifier in (ids[0], ids[1], ids[4]):
            self.execute("""insert into scholarship_view(scholarship_id,student_id,viewed_on) values (%s,2,'2026-11-25');
                insert into application(student_id,scholarship_id,application_date,application_status)
                values (2,%s,'2026-11-25','pending')""", (identifier, identifier))
        path = self.root + "/statistics"
        now = datetime.fromisoformat("2026-11-25T17:00:00+08:00")
        with patch("routes.sponsors.malaysia_now", return_value=now):
            overall = self.client.get(path, headers=self.provider)
            self.assertEqual(overall.status_code, 200, overall.json)
            self.assertEqual(overall.json["listing_totals"],
                {"total": 4, "active": 1, "expired": 1, "closed": 0, "unconfirmed": 1, "unpublished": 1})
            self.assertEqual(overall.json["summary"]["total_applications"], 2)
            filtered = self.client.get(path + "?lifecycle=expired", headers=self.provider).json
            self.assertEqual(filtered["matched_listings"], 1)
            self.assertEqual(filtered["summary"]["total_views"], 1)
            self.assertEqual(filtered["summary"]["total_applications"], 1)
            for key in ("scholarship_breakdown", "view_breakdown"):
                self.assertEqual([row["scholarship_id"] for row in filtered[key]], [ids[1]])
            self.assertEqual(self.client.get(path + "?lifecycle=closed", headers=self.provider).json["matched_listings"], 0)
        self.assertEqual(self.client.get(path + "?lifecycle=wrong", headers=self.provider).status_code, 400)
        self.assertEqual(self.client.get(f"/api/sponsors/{other_sponsor}/statistics", headers=self.provider).status_code, 403)
        expired_listing = {**self.listing("Expired"), "deadline": "2026-11-25", "deadline_time": "17:00:00"}
        with patch("listing_information.malaysia_now", return_value=now):
            self.assertEqual(self.client.post(self.root + "/scholarships", headers=self.provider,
                                              json=expired_listing).status_code, 400)
            # A legacy editor retaining the saved same-day cutoff must also be rejected.
            expired_listing.pop("deadline_time")
            self.assertEqual(self.client.put(self.root + f"/scholarships/{ids[1]}", headers=self.provider,
                                             json=expired_listing).status_code, 400)
        self.assertEqual(self.execute("select count(*) as total from scholarship")[0]["total"], 5)
        self.execute("""create table appointment(appointment_id bigint, status text);
            insert into appointment values (1,'pending'),(2,'completed'),(3,'cancelled');
            create table academic_pathway (pathway_id bigint);
            create table quiz (quiz_id bigint);
            create table report (report_id bigint)""")
        dashboard = self.client.get("/api/admin/dashboard", headers=self.admin)
        self.assertEqual(dashboard.status_code, 200, dashboard.json)
        self.assertEqual(dashboard.json["summary"]["appointments"], 3)
        self.assertEqual(self.client.get("/api/admin/dashboard", headers=self.student).status_code, 403)

    def test_academic_qualifications_migrate_save_reload_and_match(self):
        self.execute("update student set education_level='Foundation', cgpa=3.2, university='Current College' where student_id=2")
        student_path = "/api/students/2/profile"
        legacy = self.client.get(student_path, headers=self.student)
        self.assertEqual(legacy.status_code, 200)
        self.assertEqual(legacy.json["academic_qualifications"], {})
        profile = {"full_name": "Staging Student", "education_level": "Foundation",
                   "field_of_study": "Computing", "university": "Current College"}
        spm = {"subjects": [{"subject": "Mathematics", "grade": "A"}]}
        response = self.client.put(student_path, headers=self.student,
                                   json={**profile, "university": "Should roll back", "academic_qualifications": {"spm": spm}})
        self.assertEqual(response.status_code, 503, response.json)
        self.assertEqual(self.client.get(student_path, headers=self.student).json["university"], "Current College")

        migration = (MIGRATIONS / "20261124090200_student_academic_qualifications.sql").read_text(encoding="utf-8")
        self.execute(migration)
        self.assertEqual(self.client.get(student_path, headers=self.student).json, legacy.json)
        for qualification, result in (("spm", spm), ("diploma", {"cgpa": 3.6, "institution": "Past College"})):
            response = self.client.put(student_path, headers=self.student,
                                       json={**profile, "academic_qualifications": {qualification: result}})
            self.assertEqual(response.status_code, 200, response.json)
        for invalid in ({"spm": {"subjects": [{"subject": "Mathematics", "grade": "9"}]}}, {"diploma": {"cgpa": 4.01}}):
            response = self.client.put(student_path, headers=self.student,
                                       json={**profile, "academic_qualifications": invalid})
            self.assertEqual(response.status_code, 400, response.json)
        self.assertEqual(self.client.put(student_path, headers=self.headers(3, "student"),
                                         json={**profile, "academic_qualifications": {"spm": spm}}).status_code, 403)
        self.execute(migration)
        password = "FixtureStudentPassword"
        self.execute("update app_user set password=%s where user_id=2", (generate_password_hash(password),))
        login = self.client.post("/api/auth/login", json={"email": "student@example.invalid", "password": password})
        self.assertEqual(login.status_code, 200, login.json)
        signed_in = {"Authorization": "Bearer " + login.json["access_token"]}
        saved = self.client.get(student_path, headers=signed_in).json
        self.assertEqual(saved["cgpa"], "3.2")
        self.assertEqual(saved["education_level"], "Foundation")
        self.assertEqual(saved["academic_qualifications"]["spm"]["subjects"], spm["subjects"])
        self.assertEqual(saved["academic_qualifications"]["diploma"]["cgpa"], 3.6)
        listing = {**self.listing(), "academic_requirements": {"qualification": "spm",
                                                             "subject_minimums": {"Mathematics": "B+"}}}
        created = self.client.post(self.root + "/scholarships", headers=self.provider, json=listing)
        self.assertEqual(created.status_code, 201, created.json)
        identifier = created.json["scholarship"]["scholarship_id"]
        self.assertEqual(self.client.patch(f"/api/admin/scholarships/{identifier}/status",
                                          headers=self.admin, json={"status": "approved"}).status_code, 200)
        result = self.client.post(f"/api/scholarships/{identifier}/eligibility", headers=signed_in, json={})
        self.assertEqual(result.status_code, 200, result.json)
        self.assertEqual(next(check for check in result.json["checks"] if check["criterion"] == "Grade for mathematics")["status"], "matched")
        ranked = self.client.post("/api/scholarships/recommendations", headers=self.student, json={})
        self.assertEqual(ranked.status_code, 200, ranked.json)
        self.assertEqual(ranked.json["recommendations"][0]["status"], "potentially_eligible")

    def test_security_migrations_revoke_public_table_and_column_grants(self):
        for table, column, name in (
            ("platform_configuration", "configuration_value", "20261124090100_platform_configuration_access.sql"),
            ("login_rate_limit", "attempts", "20261124_login_rate_limit.sql"),
        ):
            self.execute(sql.SQL("grant select on {} to public").format(sql.Identifier(table)))
            self.execute(sql.SQL("grant update ({}) on {} to public").format(sql.Identifier(column), sql.Identifier(table)))
            migration = (MIGRATIONS / name).read_text(encoding="utf-8")
            self.execute(migration)
            self.execute(migration)
            self.assertEqual(self.execute("""
                select c.relrowsecurity,
                    exists (select 1 from aclexplode(c.relacl) where grantee=0) as public_table_acl,
                    exists (select 1 from pg_attribute a cross join lateral aclexplode(a.attacl)
                        where a.attrelid=c.oid and grantee=0) as public_column_acl
                from pg_class c where c.oid=to_regclass(%s)
            """, (table,)), [{"relrowsecurity": True, "public_table_acl": False, "public_column_acl": False}])

        path = "/api/admin/settings"
        saved_settings = {"section": "general", "platform_name": "Staging ScholarOne",
                          "platform_tagline": "Scholarship support", "platform_description": "Fixture only"}
        self.assertEqual(self.client.patch(path, headers=self.admin, json=saved_settings).status_code, 200)
        self.assertEqual(self.client.get(path, headers=self.admin).json["general"]["platform_name"], "Staging ScholarOne")
        self.assertEqual(self.client.get(path, headers=self.student).status_code, 403)

    def test_rejected_provider_can_read_own_decision_and_resubmit_without_workspace_access(self):
        path = f"/api/admin/users/{self.sponsor_id}/status"
        reason = "Correct your organization details."
        self.assertEqual(self.client.patch(path, headers=self.admin, json={"status":"rejected",
            "rejection_reason":reason}).status_code, 200)
        credentials = {"email":"provider@example.invalid", "password":"FixturePassword123"}
        auth = "/api/auth/login"
        for incorrect in ({**credentials, "password":"IncorrectFixturePassword"},
                          {**credentials, "email":"missing@example.invalid"}):
            response = self.client.post(auth, json=incorrect)
            self.assertEqual(response.status_code, 401)
            self.assertNotIn("reason", response.json)
        rejected = self.client.post(auth, json=credentials)
        self.assertEqual(rejected.status_code, 403)
        self.assertEqual(rejected.json["code"], "provider_registration_rejected")
        self.assertEqual(rejected.json["reason"], reason)
        self.assertTrue(rejected.json["can_resubmit"])
        self.assertEqual(rejected.headers["Cache-Control"], "no-store")
        self.assertNotIn("access_token", rejected.json)
        self.assertEqual(self.client.get(self.root + "/statistics", headers=self.provider).status_code, 403)
        resubmitted = self.client.post("/api/auth/provider-resubmission", json={
            **credentials, "role":"sponsor", "full_name":"Staging Provider", "organization_name":"Corrected Foundation",
            "organization_type":"Foundation", "phone_number":"+60123456789",
            "confirm_password":credentials["password"]})
        self.assertEqual(resubmitted.status_code, 200, resubmitted.json)
        self.assertEqual(resubmitted.json["user"]["status"], "pending")
        pending = self.client.post(auth, json=credentials)
        self.assertEqual(pending.status_code, 403)
        self.assertNotIn("reason", pending.json)

    def test_opening_date_round_trips_and_legacy_edits_preserve_it(self):
        listing = self.listing("Opening Date Fixture")
        opening = "2099-12-01"
        self.assertEqual(self.client.post(self.root + "/scholarships", headers=self.provider,
            json={**listing, "opening_date":"2100-01-01"}).status_code, 400)
        created = self.client.post(self.root + "/scholarships", headers=self.provider,
            json={**listing, "opening_date":opening})
        self.assertEqual(created.status_code, 201, created.json)
        identifier = created.json["scholarship"]["scholarship_id"]
        edit = f"{self.root}/scholarships/{identifier}"
        review = f"/api/admin/scholarships/{identifier}/status"
        public = f"/api/scholarships/{identifier}"
        self.assertEqual(self.client.get(edit, headers=self.provider).json["scholarship"]["opening_date"], opening)
        self.assertEqual(self.client.put(edit, headers=self.provider, json=listing).status_code, 200)
        self.assertEqual(self.client.patch(review, headers=self.admin, json={"status":"approved"}).status_code, 200)
        self.assertEqual(self.client.get(public).json["opening_date"], opening)
        self.assertEqual(self.client.put(edit, headers=self.provider,
            json={**listing,"opening_date":""}).status_code, 200)
        self.assertEqual(self.client.patch(review, headers=self.admin, json={"status":"approved"}).status_code, 200)
        self.assertIsNone(self.client.get(public).json["opening_date"])

    def test_listing_details_survive_create_and_title_only_edit(self):
        listing = {
            **self.listing("Education Loan Fixture"),
            "funding_type": "Education Loan",
            "amount": "0",
            "deadline": "",
            "deadline_status": "unconfirmed",
            "deadline_note": "Apply within six months of registration.",
            "amount_note": "Diploma: RM800 annually. Degree: up to RM1,500 annually.",
            "residency_requirements": "Residents of Perak.",
            "application_method": "Submit the signed form at the office.",
            "repayment_conditions": "Repay after graduation.",
            "application_url": "https://example.com/apply",
        }
        created = self.client.post(self.root + "/scholarships", headers=self.provider, json=listing)
        self.assertEqual(created.status_code, 201, created.json)
        identifier = created.json["scholarship"]["scholarship_id"]
        edit = f"{self.root}/scholarships/{identifier}"
        review = f"/api/admin/scholarships/{identifier}/status"
        public = f"/api/scholarships/{identifier}"
        self.assertEqual(self.client.patch(review, headers=self.admin, json={"status": "approved"}).status_code, 200)
        original = self.client.get(public).json
        for key in ("residency_requirements", "application_method", "repayment_conditions"):
            self.assertIn(listing[key], original["description"])
        for key in ("amount_note", "deadline_note", "application_url"):
            self.assertEqual(original[key], listing[key])
        self.assertIsNone(original["opening_date"])
        self.assertIsNone(original["deadline"])
        form = self.client.get(edit, headers=self.provider).json["scholarship"]
        saved = self.client.put(edit, headers=self.provider, json={**form, "title": "Renamed Loan"})
        self.assertEqual(saved.status_code, 200, saved.json)
        self.assertEqual(self.client.patch(review, headers=self.admin, json={"status": "approved"}).status_code, 200)
        self.assertEqual(self.client.get(public).json, {**original, "title": "Renamed Loan"})

    def test_career_goal_persists_and_remains_student_visible(self):
        self.execute("""create table academic_pathway (
            pathway_id bigserial primary key,title text,description text,field text,level text)""")
        self.execute((MIGRATIONS / "20261120_academic_pathways.sql").read_text())
        route = starter_pathways()[0]
        goal = "Explore careers in software engineering."
        created = self.client.post("/api/admin/pathways", headers=self.admin,
            json={**route, "guidance":{**route["guidance"], "career_goal":" " + goal + " "}})
        self.assertEqual(created.status_code, 201, created.json)
        identifier = created.json["pathway"]["pathway_id"]
        admin_path = f"/api/admin/pathways/{identifier}"
        self.assertEqual(self.client.put(admin_path, headers=self.admin, json=route).status_code, 200)
        public = self.client.get(f"/api/pathways/{identifier}", headers=self.student)
        self.assertEqual(public.json["pathway"]["guidance"]["career_goal"], goal)
        self.assertEqual(self.client.put(admin_path, headers=self.student, json=route).status_code, 403)

    def test_private_messages_persist_across_sessions_and_academics_require_consultation(self):
        self.execute("""
            create table conversation(conversation_id bigserial primary key,created_at timestamp default now());
            create table conversation_participant(conversation_id bigint references conversation,user_id bigint references app_user,
                primary key(conversation_id,user_id));
            create table message(message_id bigserial primary key,conversation_id bigint references conversation,
                sender_id bigint references app_user,message_text text not null,sent_at timestamp default now(),is_read boolean);
            create table appointment(appointment_id bigserial primary key,student_id bigint references student,
                advisor_id bigint references advisor,appointment_datetime timestamp,appointment_status text,
                duration_minutes integer,consultation_topic text);
            update student set education_level='Diploma', university='Fixture College',cgpa=3.4 where student_id=2;
        """)
        password = "FixtureGuidancePassword"
        hashed = generate_password_hash(password)
        self.execute("update app_user set password=%s where user_id=2", (hashed,))
        advisor_id = self.execute("""insert into app_user(full_name,email,role,status,password)
            values ('Fixture Advisor','advisor@example.invalid','advisor','active',%s) returning user_id""", (hashed,))[0]["user_id"]
        self.execute("insert into advisor(advisor_id) values (%s)", (advisor_id,))
        advisor = self.headers(advisor_id, "advisor")
        base = "/api/messages/conversations"
        created = self.client.post(base, headers=advisor, json={"contact_id":2})
        self.assertEqual(created.status_code, 201, created.json)
        thread = f"{base}/{created.json['conversation_id']}"
        self.assertIsNone(self.client.get(thread, headers=advisor).json["conversation"]["contact_education_level"])
        self.execute("""insert into appointment(student_id,advisor_id,appointment_datetime,appointment_status,duration_minutes)
            values (2,%s,now(),'confirmed',30)""", (advisor_id,))
        guided = self.client.get(f"/api/advisors/{advisor_id}/students", headers=advisor)
        self.assertEqual(guided.status_code, 200, guided.json)
        self.assertEqual([(row["student_id"],row["cgpa"]) for row in guided.json["students"]], [(2,"3.4")])
        self.assertEqual(self.client.get(thread, headers=advisor).json["conversation"]["contact_education_level"], "Diploma")
        for headers, text in ((self.student,"Question about entry requirements"),(advisor,"Review your transcript")):
            response = self.client.post(thread+"/messages", headers=headers, json={"message_text":text,"sender_id":99})
            self.assertEqual(response.status_code, 201, response.json)
        stranger = self.headers(3, "student")
        self.assertEqual(self.client.get(thread, headers=stranger).status_code, 404)
        self.assertEqual(self.client.post(thread+"/messages", headers=stranger, json={"message_text":"No access"}).status_code, 404)
        self.assertEqual(self.client.patch(thread+"/read", headers=stranger, json={"up_to_message_id":2}).status_code, 404)
        self.assertEqual(self.client.get(f"/api/advisors/{advisor_id}/students", headers=self.student).status_code, 403)
        for email in ("student@example.invalid","advisor@example.invalid"):
            browser_session = self.app.test_client()
            login = browser_session.post("/api/auth/login", json={"email":email,"password":password})
            self.assertEqual(login.status_code, 200, login.json)
            auth = {"Authorization":"Bearer "+login.json["access_token"]}
            for _ in range(2):
                refreshed = browser_session.get(thread, headers=auth)
                self.assertEqual(refreshed.status_code, 200, refreshed.json)
                self.assertEqual([m["sender_id"] for m in refreshed.json["messages"]], [2,advisor_id])
        self.assertEqual(self.execute("select count(*) as total from message")[0]["total"], 2)
