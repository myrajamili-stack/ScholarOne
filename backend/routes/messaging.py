"""Private, two-person student/advisor conversations using existing message tables."""
from contextlib import closing
from datetime import timezone
from functools import wraps

from flask import Blueprint, current_app, g, jsonify, request

from db import get_db_connection
from responses import error_response
from security import messaging_access_required
from advisor_scheduling import malaysia_now

messaging_bp = Blueprint('messaging', __name__, url_prefix='/api/messages')
MAX_MESSAGE_LENGTH = 5000
PAGE_SIZE = 100


def messaging_endpoint(function):
    """Authenticate the account and provide a transaction for each messaging action."""
    @wraps(function)
    @messaging_access_required
    def wrapped(*args, **kwargs):
        try:
            with closing(get_db_connection()) as connection, connection:
                with connection.cursor() as cursor:
                    user = g.messaging_user
                    cursor.execute("""SELECT user_id FROM app_user WHERE user_id = %s AND role = %s
                        AND coalesce(status, 'active') = 'active'""", (user['user_id'], user['role']))
                    if not cursor.fetchone():
                        return error_response('Your account is unavailable. Please sign in again.', 403)
                    g.messaging_cursor = cursor
                    return function(*args, **kwargs)
        except Exception:
            current_app.logger.error('Messaging operation failed')
            return error_response('Messages are temporarily unavailable. Please try again.', 503)
    return wrapped


def opposite_role():
    return 'advisor' if g.messaging_user['role'] == 'student' else 'student'


def serialize_times(row):
    # Existing messaging columns use CURRENT_TIMESTAMP in the database session's local time.
    # Queries convert those values to timestamptz before serializing an explicit UTC offset.
    for key in ('sent_at', 'created_at', 'latest_message_at'):
        if row.get(key):
            row[key] = row[key].astimezone(timezone.utc).isoformat()
    return row


def conversation_for_user(conversation_id):
    cursor = g.messaging_cursor
    cursor.execute("""SELECT c.conversation_id, other.user_id AS contact_id,
        other.full_name AS contact_name, other.role AS contact_role,
        coalesce(other.status, 'active') = 'active' AS contact_active,
        a.specialization AS contact_specialization, a.qualification AS contact_qualification,
        a.experience_years AS contact_experience_years, s.education_level AS contact_education_level,
        s.field_of_study AS contact_field_of_study, s.university AS contact_university
        FROM conversation c
        JOIN conversation_participant mine ON mine.conversation_id = c.conversation_id AND mine.user_id = %s
        JOIN conversation_participant theirs ON theirs.conversation_id = c.conversation_id AND theirs.user_id <> %s
        JOIN app_user other ON other.user_id = theirs.user_id AND other.role = %s
        LEFT JOIN advisor a ON a.advisor_id = other.user_id
        LEFT JOIN student s ON s.student_id = other.user_id
        WHERE c.conversation_id = %s
          AND (SELECT count(*) FROM conversation_participant WHERE conversation_id = c.conversation_id) = 2""",
        (g.messaging_user['user_id'], g.messaging_user['user_id'], opposite_role(), conversation_id))
    return cursor.fetchone()


@messaging_bp.route('/contacts', methods=['GET'])
@messaging_endpoint
def get_contacts():
    g.messaging_cursor.execute("""SELECT user_id, full_name, role FROM app_user
        WHERE role = %s AND coalesce(status, 'active') = 'active' ORDER BY full_name, user_id""", (opposite_role(),))
    return jsonify(g.messaging_cursor.fetchall())


@messaging_bp.route('/conversations', methods=['GET'])
@messaging_endpoint
def get_conversations():
    user_id = g.messaging_user['user_id']
    g.messaging_cursor.execute("""SELECT c.conversation_id,
        c.created_at AT TIME ZONE current_setting('TimeZone') AS created_at,
        other.user_id AS contact_id, other.full_name AS contact_name, other.role AS contact_role,
        coalesce(other.status, 'active') = 'active' AS contact_active,
        latest.message_text AS latest_message,
        latest.sent_at AT TIME ZONE current_setting('TimeZone') AS latest_message_at,
        latest.sender_id AS latest_sender_id,
        (SELECT count(*) FROM message m WHERE m.conversation_id = c.conversation_id
            AND m.sender_id <> %s AND coalesce(m.is_read, false) = false) AS unread_count
        FROM conversation c
        JOIN conversation_participant mine ON mine.conversation_id = c.conversation_id AND mine.user_id = %s
        JOIN conversation_participant theirs ON theirs.conversation_id = c.conversation_id AND theirs.user_id <> %s
        JOIN app_user other ON other.user_id = theirs.user_id AND other.role = %s
        LEFT JOIN LATERAL (SELECT message_text, sent_at, sender_id, message_id FROM message
            WHERE conversation_id = c.conversation_id ORDER BY message_id DESC LIMIT 1) latest ON true
        WHERE (SELECT count(*) FROM conversation_participant WHERE conversation_id = c.conversation_id) = 2
        ORDER BY latest.message_id DESC NULLS LAST, c.conversation_id DESC""",
        (user_id, user_id, user_id, opposite_role()))
    conversations = [serialize_times(dict(row)) for row in g.messaging_cursor.fetchall()]
    # These column names come from the signed role, never from request input.
    owner_column, contact_column = ('student_id', 'advisor_id') if g.messaging_user['role'] == 'student' else ('advisor_id', 'student_id')
    g.messaging_cursor.execute(f"""SELECT {contact_column} AS contact_id,
        count(*) FILTER (WHERE appointment_datetime >= %s
            AND lower(coalesce(appointment_status, 'pending')) IN ('pending', 'confirmed')) AS upcoming_count
        FROM appointment WHERE {owner_column} = %s GROUP BY {contact_column}""", (malaysia_now(), user_id))
    appointment_rows = g.messaging_cursor.fetchall()
    appointment_contacts = {row['contact_id'] for row in appointment_rows}
    for conversation in conversations:
        conversation['has_appointment'] = conversation['contact_id'] in appointment_contacts
    return jsonify({
        'conversations': conversations,
        'unread_count': sum(row['unread_count'] for row in conversations),
        'appointment_count': sum(row['upcoming_count'] for row in appointment_rows),
    })


@messaging_bp.route('/conversations', methods=['POST'])
@messaging_endpoint
def start_conversation():
    data = request.get_json(silent=True)
    contact_id = data.get('contact_id') if isinstance(data, dict) else None
    if type(contact_id) is not int or contact_id <= 0:
        return error_response('Choose a valid recipient.', 400)
    cursor = g.messaging_cursor
    cursor.execute("""SELECT user_id FROM app_user WHERE user_id = %s AND role = %s
        AND coalesce(status, 'active') = 'active'""", (contact_id, opposite_role()))
    if not cursor.fetchone():
        return error_response('Recipient not found or unavailable.', 404)
    user_id = g.messaging_user['user_id']
    # Repeated clicks and simultaneous starts from either role must reuse one direct thread.
    pair = sorted((user_id, contact_id))
    cursor.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))', (f'scholarone:messages:{pair[0]}:{pair[1]}',))
    cursor.execute("""SELECT mine.conversation_id FROM conversation_participant mine
        JOIN conversation_participant theirs ON theirs.conversation_id = mine.conversation_id
        WHERE mine.user_id = %s AND theirs.user_id = %s
          AND (SELECT count(*) FROM conversation_participant WHERE conversation_id = mine.conversation_id) = 2
        ORDER BY mine.conversation_id LIMIT 1""", (user_id, contact_id))
    conversation = cursor.fetchone()
    if conversation:
        return jsonify(conversation), 200
    cursor.execute('INSERT INTO conversation DEFAULT VALUES RETURNING conversation_id')
    conversation = cursor.fetchone()
    cursor.execute('INSERT INTO conversation_participant (conversation_id, user_id) VALUES (%s, %s), (%s, %s)',
                   (conversation['conversation_id'], user_id, conversation['conversation_id'], contact_id))
    return jsonify(conversation), 201


@messaging_bp.route('/conversations/<int:conversation_id>', methods=['GET'])
@messaging_endpoint
def get_thread(conversation_id):
    conversation = conversation_for_user(conversation_id)
    if not conversation:
        return error_response('Conversation not found.', 404)
    before = request.args.get('before')
    if before is not None and (not before.isdigit() or int(before) <= 0 or len(before) > 18):
        return error_response('Invalid message cursor.', 400)
    g.messaging_cursor.execute("""SELECT m.message_id, m.conversation_id, m.sender_id, m.message_text,
        m.sent_at AT TIME ZONE current_setting('TimeZone') AS sent_at,
        coalesce(m.is_read, false) AS is_read, coalesce(u.full_name, 'User') AS sender_name
        FROM message m LEFT JOIN app_user u ON u.user_id = m.sender_id
        WHERE m.conversation_id = %s AND (%s IS NULL OR m.message_id < %s)
        ORDER BY m.message_id DESC LIMIT %s""", (conversation_id, before, before, PAGE_SIZE + 1))
    rows = g.messaging_cursor.fetchall()
    messages = [serialize_times(dict(row)) for row in reversed(rows[:PAGE_SIZE])]
    return jsonify({'conversation': conversation, 'messages': messages, 'has_more': len(rows) > PAGE_SIZE})


@messaging_bp.route('/conversations/<int:conversation_id>/messages', methods=['POST'])
@messaging_endpoint
def send_message(conversation_id):
    data = request.get_json(silent=True)
    message_text = data.get('message_text') if isinstance(data, dict) else None
    if not isinstance(message_text, str) or not message_text.strip() or len(message_text) > MAX_MESSAGE_LENGTH:
        return error_response(f'Enter a message between 1 and {MAX_MESSAGE_LENGTH} characters.', 400)
    conversation = conversation_for_user(conversation_id)
    if not conversation:
        return error_response('Conversation not found.', 404)
    if not conversation['contact_active']:
        return error_response('This recipient is currently unavailable.', 409)
    cursor = g.messaging_cursor
    cursor.execute("""INSERT INTO message (conversation_id, sender_id, message_text, is_read)
        VALUES (%s, %s, %s, false)
        RETURNING message_id, conversation_id, sender_id, message_text,
            sent_at AT TIME ZONE current_setting('TimeZone') AS sent_at, is_read""",
        (conversation_id, g.messaging_user['user_id'], message_text.strip()))
    return jsonify({'message': serialize_times(dict(cursor.fetchone()))}), 201


@messaging_bp.route('/conversations/<int:conversation_id>/read', methods=['PATCH'])
@messaging_endpoint
def mark_read(conversation_id):
    data = request.get_json(silent=True)
    last_seen = data.get('up_to_message_id') if isinstance(data, dict) else None
    if type(last_seen) is not int or not 0 < last_seen <= 9223372036854775807:
        return error_response('Choose the last displayed message.', 400)
    if not conversation_for_user(conversation_id):
        return error_response('Conversation not found.', 404)
    g.messaging_cursor.execute("""UPDATE message SET is_read = true WHERE conversation_id = %s
        AND sender_id <> %s AND message_id <= %s AND coalesce(is_read, false) = false""",
        (conversation_id, g.messaging_user['user_id'], last_seen))
    return jsonify({'message': 'Messages marked as read.'})
