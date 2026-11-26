from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from threading import Barrier, Lock
from unittest import TestCase
from unittest.mock import MagicMock, patch

from advisor_scheduling import empty_schedule
from app import create_app
from security import issue_access_token


def headers(user_id, role):
    return {"Authorization": "Bearer " + issue_access_token({"user_id": user_id, "role": role})}


def monday_schedule():
    schedule = empty_schedule()
    schedule["availability"][0]["enabled"] = True
    return schedule


class ConsultationWorkflowTests(TestCase):
    def setUp(self):
        self.app = create_app()
        self.now = datetime(2026, 11, 8, 8)
        self.selected = "2026-11-09T09:00"
        self.enterContext(patch("security.verify_active_account", return_value=None))
        for module in ("advisor_scheduling", "routes.advisor_scheduling", "routes.advisor_students",
                       "routes.appointment_actions", "routes.advisors"):
            self.enterContext(patch(f"{module}.malaysia_now", side_effect=lambda: self.now))

    def test_simultaneous_requests_contend_for_advisor_or_student(self):
        payload = {"appointment_datetime": self.selected, "slot_minutes": 30}
        for direct_student, booking_advisor in ((12, 7), (11, 8)):
            with self.subTest(direct_student=direct_student, booking_advisor=booking_advisor):
                start = Barrier(2, timeout=5)
                locks = {("advisor", 7): Lock(), ("advisor", 8): Lock(),
                         ("student", 11): Lock(), ("student", 12): Lock()}
                appointments, notifications = [], []

                def connect():
                    connection = MagicMock()
                    cursor = connection.cursor.return_value.__enter__.return_value
                    start.wait()
                    held, pending, notices = [], [], []

                    def execute(sql, params):
                        sql = " ".join(sql.lower().split())
                        row, rows = None, []
                        if sql.startswith("select user_id from app_user"):
                            self.assertTrue(sql.endswith("for update"))
                            key = ("advisor", params[0])
                            self.assertTrue(locks[key].acquire(timeout=5))
                            held.append(key)
                            row = {"user_id": params[0]}
                        elif sql.startswith("select s.student_id"):
                            self.assertTrue(sql.endswith("for update of s"))
                            key = ("student", params[0])
                            self.assertTrue(locks[key].acquire(timeout=5))
                            held.append(key)
                            row = {"student_id": params[0], "status": "active"}
                        elif "from advisor_schedule" in sql:
                            row = monday_schedule()
                        elif sql.startswith("select appointment_datetime"):
                            self.assertEqual([role for role, _ in held], ["advisor", "student"])
                            key = "advisor_id" if "where advisor_id" in sql else "student_id"
                            rows = [item for item in appointments if item[key] == params[0]]
                        elif sql.startswith("insert into appointment"):
                            student_id, advisor_id, when, duration = params[:4]
                            pending.append(dict(student_id=student_id, advisor_id=advisor_id, appointment_datetime=when,
                                                duration_minutes=duration, appointment_status="confirmed" if "'confirmed'" in sql else "pending"))
                            row = {"appointment_id": 22}
                        elif sql.startswith("insert into notification"):
                            notices.append(params)
                        else:
                            self.fail(f"Unexpected SQL: {sql}")
                        cursor.fetchone.return_value = row
                        cursor.fetchall.return_value = rows

                    def finish(exc_type, exc, traceback):
                        if exc_type is None:
                            appointments.extend(pending)
                            notifications.extend(notices)
                        for key in reversed(held):
                            locks[key].release()
                        return False

                    cursor.execute.side_effect = execute
                    connection.__exit__.side_effect = finish
                    return connection

                def post(url, user_id, role):
                    with self.app.test_client() as client:
                        return client.post(url, json=payload, headers=headers(user_id, role)).status_code

                with (
                    patch("routes.advisor_students.get_db_connection", side_effect=connect),
                    patch("routes.advisor_scheduling.get_db_connection", side_effect=connect),
                    ThreadPoolExecutor(2) as pool,
                ):
                    direct = pool.submit(post, f"/api/advisors/7/students/{direct_student}/consultations", 7, "advisor")
                    booking = pool.submit(post, f"/api/advisors/{booking_advisor}/appointments", 11, "student")
                    self.assertEqual(sorted((direct.result(timeout=12), booking.result(timeout=12))), [201, 409])
                self.assertEqual(len(appointments), 1)
                self.assertEqual(len(notifications), 1)

    def test_advisor_booking_messaging_completion_and_review_across_roles(self):
        connection = MagicMock()
        cursor = connection.cursor.return_value
        cursor.__enter__.return_value = cursor
        appointment, participants, review = {}, set(), {}
        messages, notifications = [], []

        def execute(sql, params=()):
            sql = " ".join(sql.lower().split())
            row, rows = None, []
            if sql.startswith("select user_id from app_user"):
                row = {"user_id": params[0]}
            elif sql.startswith("select s.student_id"):
                row = {"student_id": 11, "status": "active"}
            elif "from advisor_schedule" in sql:
                row = monday_schedule()
            elif sql.startswith("insert into appointment"):
                student_id, advisor_id, when, duration, topic = params
                appointment.update(appointment_id=22, student_id=student_id, advisor_id=advisor_id,
                                   appointment_datetime=when, duration_minutes=duration,
                                   appointment_status="confirmed", consultation_topic=topic)
                row = {"appointment_id": 22}
            elif sql.startswith("select count(*) filter"):
                row = {"total": 1}
            elif sql.startswith("select ap.appointment_id"):
                owner = "student_id" if "where ap.student_id" in sql else "advisor_id"
                rows = [dict(appointment)] if appointment[owner] == params[0] else []
            elif sql.startswith("select student_id, appointment_datetime") and params == (22, 7):
                row = dict(appointment)
            elif sql.startswith("update appointment"):
                appointment["appointment_status"] = params[0]
                row = {"appointment_id": 22}
            elif sql.startswith("select advisor_id,appointment_status") and params == (22, 11):
                row = dict(appointment)
            elif sql.startswith("select review_id,rating,comment") and params == (22, 11):
                row = dict(review) or None
            elif sql.startswith("insert into review"):
                self.assertEqual(params[:3], (11, 7, 22))
                review.update(review_id=19, rating=params[3], comment=params[4], created_at=self.now)
                row = dict(review)
            elif sql.startswith("select r.review_id") and params[0] == 7:
                rows = [dict(review)]
            elif sql.startswith("select count(*) as total_reviews") and params == (7,):
                row = {"total_reviews": len(review) > 0}
            elif sql.startswith("insert into notification"):
                notifications.append(params)
            elif sql.startswith("select mine.conversation_id"):
                row = {"conversation_id": 4} if participants == set(params) else None
            elif sql.startswith("insert into conversation default"):
                row = {"conversation_id": 4}
            elif sql.startswith("insert into conversation_participant"):
                participants.update((params[1], params[3]))
            elif sql.startswith("select c.conversation_id"):
                if params[0] in participants and params[-1] == 4:
                    row = {"conversation_id": 4, "contact_active": True}
            elif sql.startswith("insert into message"):
                row = dict(message_id=len(messages) + 1, conversation_id=params[0], sender_id=params[1],
                           message_text=params[2], is_read=False)
                messages.append(row)
            elif sql.startswith("select m.message_id"):
                rows = list(reversed(messages))
            cursor.fetchone.return_value = row
            cursor.fetchall.return_value = rows

        cursor.execute.side_effect = execute
        for module in ("advisor_students", "advisor_scheduling", "advisors", "appointment_actions", "messaging"):
            self.enterContext(patch(f"routes.{module}.get_db_connection", return_value=connection))

        client = self.app.test_client()
        advisor, student = headers(7, "advisor"), headers(11, "student")
        booked = client.post("/api/advisors/7/students/11/consultations", headers=advisor,
                             json={"appointment_datetime": self.selected, "slot_minutes": 30, "consultation_topic": "Course selection"})
        self.assertEqual(booked.status_code, 201, booked.json)
        self.assertEqual((notifications[0][0], notifications[0][2]), (11, 7))

        def assert_status(status):
            student_rows = client.get("/api/advisors/my-appointments", headers=student).json
            advisor_rows = client.get("/api/advisors/7/appointments", headers=advisor).json["appointments"]
            for rows in (student_rows, advisor_rows):
                self.assertEqual([(row["appointment_id"], row["appointment_status"]) for row in rows], [(22, status)])

        assert_status("confirmed")
        conversation = "/api/messages/conversations"
        self.assertEqual(client.post(conversation, headers=student, json={"contact_id": 7}).json["conversation_id"], 4)
        thread = conversation + "/4"
        for auth, message in ((student, "What should I bring?"), (advisor, "Please bring your transcript.")):
            self.assertEqual(client.post(thread + "/messages", headers=auth, json={"message_text": message}).status_code, 201)
        for auth in (advisor, student):
            self.assertEqual([row["sender_id"] for row in client.get(thread, headers=auth).json["messages"]], [11, 7])

        status_url = "/api/advisors/7/appointments/22/status"
        review_url = "/api/appointments/22/review"
        status_payload, review_payload = {"status": "completed"}, {"rating": 5, "comment": "Helpful consultation."}
        self.assertEqual(client.patch(status_url, headers=advisor, json=status_payload).status_code, 409)
        self.assertEqual(client.post(review_url, headers=student, json=review_payload).status_code, 409)
        self.now = datetime(2026, 11, 9, 9, 30)
        self.assertEqual(client.patch(status_url, headers=advisor, json=status_payload).status_code, 200)
        assert_status("completed")
        self.assertEqual(client.post(review_url, headers=student, json=review_payload).status_code, 201)
        self.assertEqual(client.get(review_url, headers=student).json["review"]["rating"], 5)
        self.assertEqual(client.post(review_url, headers=student, json=review_payload).status_code, 409)
        self.assertEqual(client.get("/api/advisors/7/feedback", headers=advisor).json["reviews"][0]["comment"], review_payload["comment"])
        self.assertEqual(notifications[-1][0], 7)
