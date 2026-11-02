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
