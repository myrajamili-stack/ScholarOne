"""Signed bearer tokens for student assessment persistence.

Uses SECRET_KEY when configured. Without it, tokens last only for this server
process and students must sign in again after a restart. No secrets are written.
"""
from functools import wraps
import os
import secrets

from flask import g, request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from responses import error_response

_serializer = URLSafeTimedSerializer(os.getenv("SECRET_KEY") or secrets.token_hex(32), salt="scholarone-access-v1")
TOKEN_MAX_AGE = 8 * 60 * 60


def issue_access_token(user):
    return _serializer.dumps({"user_id": user["user_id"], "role": user["role"]})


def student_access_required(function):
    @wraps(function)
    def wrapped(*args, **kwargs):
        authorization = request.headers.get("Authorization", "")
        if not authorization.startswith("Bearer "):
            return error_response("Please sign in again to save or load your assessment.", 401)
        try:
            user = _serializer.loads(authorization[7:], max_age=TOKEN_MAX_AGE)
        except (BadSignature, SignatureExpired):
            return error_response("Your sign-in has expired. Please sign in again.", 401)
        if not isinstance(user, dict) or type(user.get("user_id")) is not int or user.get("role") != "student":
            return error_response("Student access is required.", 403)
        g.student_id = user["user_id"]
        return function(*args, **kwargs)
    return wrapped


def advisor_access_required(function):
    @wraps(function)
    def wrapped(*args, **kwargs):
        authorization = request.headers.get('Authorization', '')
        if not authorization.startswith('Bearer '):
            return error_response('Please sign in again to manage your schedule.', 401)
        try:
            user = _serializer.loads(authorization[7:], max_age=TOKEN_MAX_AGE)
        except (BadSignature, SignatureExpired):
            return error_response('Your sign-in has expired. Please sign in again.', 401)
        if (not isinstance(user, dict) or type(user.get('user_id')) is not int
                or user.get('role') != 'advisor' or user['user_id'] != kwargs.get('advisor_id')):
            return error_response('You can only manage your own advisor schedule.', 403)
        return function(*args, **kwargs)
    return wrapped


def messaging_access_required(function):
    @wraps(function)
    def wrapped(*args, **kwargs):
        authorization = request.headers.get('Authorization', '')
        if not authorization.startswith('Bearer '):
            return error_response('Please sign in to use messages.', 401)
        try:
            user = _serializer.loads(authorization[7:], max_age=TOKEN_MAX_AGE)
        except (BadSignature, SignatureExpired):
            return error_response('Your sign-in has expired. Please sign in again.', 401)
        if (not isinstance(user, dict) or type(user.get('user_id')) is not int
                or user.get('role') not in ('student', 'advisor')):
            return error_response('Student or advisor access is required.', 403)
        g.messaging_user = user
        return function(*args, **kwargs)
    return wrapped


def admin_access_required(function):
    @wraps(function)
    def wrapped(*args, **kwargs):
        authorization = request.headers.get('Authorization', '')
        if not authorization.startswith('Bearer '):
            return error_response('Please sign in to access administrator records.', 401)
        try:
            user = _serializer.loads(authorization[7:], max_age=TOKEN_MAX_AGE)
        except (BadSignature, SignatureExpired):
            return error_response('Your sign-in has expired. Please sign in again.', 401)
        if not isinstance(user, dict) or user.get('role') != 'admin' or type(user.get('user_id')) is not int:
            return error_response('Administrator access is required.', 403)
        g.admin_id = user['user_id']
        return function(*args, **kwargs)
    return wrapped


def sponsor_access_required(function):
    @wraps(function)
    def wrapped(*args, **kwargs):
        if request.method == 'OPTIONS':
            return function(*args, **kwargs)
        authorization = request.headers.get('Authorization', '')
        if not authorization.startswith('Bearer '):
            return error_response('Please sign in to access your provider workspace.', 401)
        try:
            user = _serializer.loads(authorization[7:], max_age=TOKEN_MAX_AGE)
        except (BadSignature, SignatureExpired):
            return error_response('Your sign-in has expired. Please sign in again.', 401)
        sponsor_id = (request.view_args or {}).get('sponsor_id')
        if not isinstance(user, dict) or user.get('role') != 'sponsor' or type(user.get('user_id')) is not int or user['user_id'] != sponsor_id:
            return error_response('You can only access your own provider workspace.', 403)
        from db import get_db_connection
        connection = None
        try:
            connection = get_db_connection()
            with connection.cursor() as cursor:
                cursor.execute("select status from app_user where user_id = %s and role = 'sponsor'", (sponsor_id,))
                account = cursor.fetchone()
            if not account or str(account.get('status') or 'active').lower() != 'active':
                return error_response('Your provider account must be approved by an administrator before you can access this workspace.', 403)
        except Exception:
            return error_response('Unable to verify your provider account. Please try again.', 503)
        finally:
            if connection:
                connection.close()
        return function(*args, **kwargs)
    return wrapped
