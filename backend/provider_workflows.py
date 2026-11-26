from contextlib import closing
from flask import jsonify
from werkzeug.security import check_password_hash
from db import get_db_connection
from responses import error_response
from notification_delivery import notify_admins


def resubmit_registration(data):
    """Use the existing password; rejected accounts receive no workspace access."""
    try:
        with closing(get_db_connection()) as connection,connection:
            with connection.cursor() as cursor:
                cursor.execute("select user_id,password,status from app_user where lower(email)=%s and role='sponsor' for update", (data['email'],))
                account=cursor.fetchone()
                if not account or not check_password_hash(account['password'],data['password']):
                    return error_response('Invalid email or password.',401)
                if account['status']!='rejected':
                    return error_response('Only rejected registrations can be resubmitted. Pending registrations are already awaiting review.',409)
                cursor.execute("""update app_user set full_name=%s,phone_number=%s,status='pending',provider_rejection_reason=null
                    where user_id=%s returning user_id,full_name,email,role,status""",(data['full_name'],data['phone_number'],account['user_id']))
                user=cursor.fetchone()
                cursor.execute('update sponsor set organization_name=%s,organization_type=%s,website=%s where sponsor_id=%s',
                    (data['organization_name'],data['organization_type'],data['website'],account['user_id']))
                notify_admins(cursor,f"Provider registration resubmitted for review: {data['organization_name']}.")
        return jsonify(message='Registration resubmitted for administrator review.',user=user)
    except Exception:
        return error_response('Unable to resubmit your registration. No changes were saved.',503)
