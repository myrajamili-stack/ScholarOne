"""Live API verification using temporary accounts; always cleans only its fixtures.

Run explicitly: python -B scripts/verify_appointment_workflows.py --run
No existing appointments, accounts, reviews or notifications are changed.
"""
from pathlib import Path
import sys
from uuid import uuid4
from contextlib import closing
from datetime import timedelta
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from werkzeug.security import generate_password_hash
from db import get_db_connection
from app import create_app
from advisor_scheduling import empty_schedule, malaysia_now


def verify():
    nonce = uuid4().hex[:16]
    password = uuid4().hex
    fixtures = []
    client = create_app().test_client()

    def expect(response, status=200):
        assert response.status_code == status, f'Expected {status}; got {response.status_code}: {response.get_json()}'
        return response.get_json()

    def login(email):
        data = expect(client.post('/api/auth/login', json={'email': email, 'password': password}))
        return {'Authorization': 'Bearer ' + data['access_token']}

    try:
        with closing(get_db_connection()) as connection, connection:
            with connection.cursor() as cursor:
                for index, role in enumerate(('student', 'student', 'advisor', 'advisor')):
                    email = f'appointment-check-{nonce}-{index}@example.invalid'
                    cursor.execute("""insert into app_user (full_name,email,password,role,status)
                        values (%s,%s,%s,%s,'active') returning user_id""",
                        ('ScholarOne Verification Account', email, generate_password_hash(password, method='pbkdf2:sha256'), role))
                    user_id = cursor.fetchone()['user_id']
                    fixtures.append((user_id, email, role))
                    if role == 'student':
                        cursor.execute('insert into student (student_id) values (%s)', (user_id,))
                    else:
                        cursor.execute('insert into advisor (advisor_id) values (%s)', (user_id,))
        first, second, advisor, other_advisor = [login(row[1]) for row in fixtures]
        advisor_id, other_id = fixtures[2][0], fixtures[3][0]
        schedule = empty_schedule()
        for day in schedule['availability']:
            day.update(enabled=True, start_time='09:00', end_time='12:00')
        for identity, headers in [(advisor_id, advisor), (other_id, other_advisor)]:
            expect(client.put(f'/api/advisors/{identity}/schedule', json=schedule, headers=headers))
        day = (malaysia_now() + timedelta(days=2)).date().isoformat()
        slot, moved, spare = [f'{day}T{time}' for time in ['09:00','09:30','10:00']]

        def book(headers, when, identity=advisor_id, code=201):
            return expect(client.post(f'/api/advisors/{identity}/appointments', headers=headers,
                          json={'appointment_datetime': when, 'consultation_topic': 'Temporary verification'}), code)

        def status(appointment_id, value, reason='', code=200):
            return expect(client.patch(f'/api/advisors/{advisor_id}/appointments/{appointment_id}/status',
                          headers=advisor, json={'status': value, 'rejection_reason': reason}), code)

        booked = book(first, slot)['appointment_id']
        book(second, slot, code=409)
        book(first, slot, identity=other_id, code=409)
        expect(client.post(f'/api/appointments/{booked}/cancel', headers=second), 404)
        status(booked, 'confirmed')
        status(booked, 'completed', code=409)
        expect(client.post(f'/api/appointments/{booked}/review', headers=first, json={'rating': 5}), 409)
        blocker = book(second, moved)['appointment_id']
        expect(client.patch(f'/api/advisors/{advisor_id}/appointments/{booked}/reschedule', headers=advisor,
                            json={'appointment_datetime': moved}), 409)
        expect(client.post(f'/api/appointments/{blocker}/cancel', headers=second))
        expect(client.patch(f'/api/advisors/{advisor_id}/appointments/{booked}/reschedule', headers=advisor,
                            json={'appointment_datetime': moved}))
        reloaded = expect(client.get('/api/advisors/my-appointments', headers=first))
        current = next(row for row in reloaded if row['appointment_id'] == booked)
        assert current['appointment_status'] == 'confirmed' and current['appointment_datetime'].startswith(moved)
        assert slot in expect(client.get(f'/api/advisors/{advisor_id}/availability?date={day}', headers=first))['slots']
        print('Booking, advisor/student conflicts, confirmation and reschedule save/reload passed.', flush=True)

        rejected = book(second, slot)['appointment_id']
        status(rejected, 'rejected', code=400)
        status(rejected, 'rejected', 'Please select a different day.')
        current = next(row for row in expect(client.get('/api/advisors/my-appointments', headers=second)) if row['appointment_id'] == rejected)
        assert current['rejection_reason'] == 'Please select a different day.'
        assert current['appointment_status'] == 'rejected'
        again = book(second, slot)['appointment_id']
        expect(client.post(f'/api/appointments/{again}/cancel', headers=second))
        before_retry = expect(client.get('/api/notifications', headers=second))
        expect(client.post(f'/api/appointments/{again}/cancel', headers=second))
        assert len(expect(client.get('/api/notifications', headers=second))['notifications']) == len(before_retry['notifications'])
        status(again, 'confirmed', code=409)
        book(second, spare)
        student_notices = expect(client.get('/api/notifications', headers=second))
        assert any('Please select a different day.' in row['message'] for row in student_notices['notifications'])
        notice_id = student_notices['notifications'][0]['notification_id']
        expect(client.patch(f'/api/notifications/{notice_id}', headers=first, json={'is_read': True}), 404)
        expect(client.patch(f'/api/notifications/{notice_id}', headers=second, json={'is_read': True}))
        assert expect(client.get('/api/notifications', headers=second))['unread'] == student_notices['unread'] - 1
        assert any('Rescheduled' in row['message'] for row in expect(client.get('/api/notifications', headers=advisor))['notifications'])
        print('Rejection reason, cancellation, released slots and owner-only notifications passed.', flush=True)

        # Move only this temporary fixture into the past to verify session completion without waiting.
        with closing(get_db_connection()) as connection, connection:
            with connection.cursor() as cursor:
                cursor.execute('update appointment set appointment_datetime=%s where appointment_id=%s and student_id=%s and advisor_id=%s',
                               (malaysia_now()-timedelta(days=1), booked, fixtures[0][0], advisor_id))
                assert cursor.rowcount == 1
        status(booked, 'completed')
        expect(client.post(f'/api/appointments/{booked}/review', headers=second, json={'rating': 5}), 404)
        review = expect(client.post(f'/api/appointments/{booked}/review', headers=first,
                        json={'rating': 5, 'comment': 'Helpful temporary verification.'}), 201)['review']
        assert expect(client.get(f'/api/appointments/{booked}/review', headers=first))['review'] == review
        expect(client.post(f'/api/appointments/{booked}/review', headers=first, json={'rating': 4}), 409)
        feedback = expect(client.get(f'/api/advisors/{advisor_id}/feedback', headers=advisor))
        assert int(feedback['summary']['total_reviews']) == 1
        assert float(feedback['summary']['average_rating']) == 5
        print('Completion, one review per session, persisted review and advisor feedback passed.', flush=True)
    finally:
        if fixtures:
            with closing(get_db_connection()) as connection, connection:
                with connection.cursor() as cursor:
                    ids = [row[0] for row in fixtures]
                    cursor.execute('select user_id,email from app_user where user_id=any(%s)', (ids,))
                    expected = {row[0]:row[1] for row in fixtures}
                    assert all(expected[row['user_id']] == row['email'] for row in cursor.fetchall())
                    cursor.execute('delete from review where student_id=any(%s) or advisor_id=any(%s)', (ids,ids))
                    cursor.execute('delete from notification where user_id=any(%s)', (ids,))
                    cursor.execute('delete from appointment where student_id=any(%s) or advisor_id=any(%s)', (ids,ids))
                    cursor.execute('delete from advisor_schedule where advisor_id=any(%s)', (ids,))
                    cursor.execute('delete from student where student_id=any(%s)', (ids,))
                    cursor.execute('delete from advisor where advisor_id=any(%s)', (ids,))
                    cursor.execute('delete from app_user where user_id=any(%s)', (ids,))
            print('All temporary accounts, bookings, reviews and notifications removed; existing records preserved.', flush=True)


if __name__ == '__main__':
    if sys.argv[1:] != ['--run']:
        raise SystemExit('Use --run to allow temporary test fixtures and their cleanup.')
    verify()
