from contextlib import closing
from datetime import timezone
from flask import Blueprint, jsonify, request, g
from db import get_db_connection
from security import notification_access_required, verify_active_account
from responses import error_response
from notification_delivery import deliver_due_reminders

notifications_bp = Blueprint('notifications', __name__, url_prefix='/api/notifications')


@notifications_bp.route('', methods=['GET'])
@notifications_bp.route('/<int:notification_id>', methods=['PATCH'])
@notification_access_required
def notifications(notification_id=None):
    user = g.notification_user
    account_error = verify_active_account(user['user_id'], user['role'])
    if account_error is not None: return account_error
    try:
        with closing(get_db_connection()) as connection, connection:
            with connection.cursor() as cursor:
                if request.method == 'PATCH':
                    data = request.get_json(silent=True)
                    if not isinstance(data, dict) or type(data.get('is_read')) is not bool:
                        return error_response('Specify whether the notification is read.', 400)
                    cursor.execute('update notification set is_read=%s where notification_id=%s and user_id=%s returning notification_id',
                                   (data['is_read'],notification_id,user['user_id']))
                    if not cursor.fetchone(): return error_response('Notification not found.', 404)
                    return jsonify(message='Notification updated.')
                if user['role'] == 'student':
                    deliver_due_reminders(cursor, user['user_id'])
                cursor.execute('select count(*) as total from notification where user_id=%s and is_read=false', (user['user_id'],))
                unread = cursor.fetchone()['total']
                cursor.execute('''select notification_id,message,notification_type,is_read,created_at from notification
                    where user_id=%s order by created_at desc,notification_id desc limit 50''', (user['user_id'],))
                rows = cursor.fetchall()
                for row in rows:
                    created_at = row.get("created_at")
                    if created_at is not None:
                        # The existing timestamp column stores UTC without a timezone.
                        row["created_at"] = (created_at.replace(tzinfo=timezone.utc) if created_at.tzinfo is None
                                             else created_at.astimezone(timezone.utc)).isoformat()
        return jsonify(unread=unread, notifications=rows)
    except Exception:
        return error_response('Unable to load or update notifications.', 503)
