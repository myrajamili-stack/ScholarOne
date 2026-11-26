import re
from contextlib import closing
from urllib.parse import urlparse

import psycopg2
from flask import Blueprint, current_app, g, jsonify, request
from werkzeug.exceptions import RequestEntityTooLarge
from werkzeug.security import check_password_hash, generate_password_hash

from db import get_db_connection
from login_throttle import LoginThrottle, PostgresLoginThrottle
from responses import error_response, internal_error_response
from security import admin_access_required, issue_access_token, student_access_required

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")
MAX_PASSWORD_LENGTH = 4096
MAX_LOGIN_BODY_BYTES = 32 * 1024
DUMMY_PASSWORD_HASH = generate_password_hash("unused login comparison", method="pbkdf2:sha256")


@auth_bp.post("/student/password")
@student_access_required
def change_student_password():
    request.max_content_length = MAX_LOGIN_BODY_BYTES
    try:
        payload = request.get_json(silent=True)
    except RequestEntityTooLarge:
        return error_response("Password change request is too large.", 413)
    fields = {"current_password", "new_password", "confirm_password"}
    if not isinstance(payload, dict) or set(payload) != fields:
        return error_response("Enter your current password, new password, and confirmation.")
    current, new, confirmation = (payload[key] for key in ("current_password", "new_password", "confirm_password"))
    if not isinstance(current, str) or not current.strip() or len(current) > MAX_PASSWORD_LENGTH:
        return error_response("Enter your current password.")
    if not isinstance(new, str) or not 8 <= len(new) <= MAX_PASSWORD_LENGTH or not new.strip():
        return error_response(f"Use between 8 and {MAX_PASSWORD_LENGTH} characters for your new password.")
    if new != confirmation:
        return error_response("New passwords do not match.")
    if current == new:
        return error_response("Choose a password different from your current password.")

    try:
        retry_after = current_app.extensions["login_throttle"].retry_after(f"student-password:{g.student_id}")
        if retry_after:
            return jsonify(error="Too many attempts. Please try again shortly."), 429, {"Retry-After": str(retry_after)}

        with closing(get_db_connection()) as connection, connection, connection.cursor() as cursor:
            cursor.execute("select password from app_user where user_id=%s and role='student' and lower(status)='active' for update",
                           (g.student_id,))
            account = cursor.fetchone()
            if not account:
                return error_response("Your account is unavailable.", 403)
            if not account["password"] or not check_password_hash(account["password"], current):
                return error_response("Current password is incorrect.")
            new_hash = generate_password_hash(new, method="pbkdf2:sha256")
            cursor.execute("update app_user set password=%s where user_id=%s", (new_hash, g.student_id))
        return jsonify(message="Password changed successfully.")
    except Exception as error:
        return internal_error_response(error, 503)


@auth_bp.record_once
def configure_login_throttle(state):
    config = state.app.config
    state.app.extensions["login_throttle"] = (
        PostgresLoginThrottle(config["SCHOLARONE_SIGNING_KEY"]) if config.get("SCHOLARONE_PRODUCTION") else LoginThrottle()
    )


def credential_attempt_limit():
    try:
        retry_after = current_app.extensions["login_throttle"].retry_after(request.remote_addr)
    except Exception as error:
        return internal_error_response(error, 503)
    if retry_after:
        response = jsonify(error="Too many login attempts. Please try again shortly.")
        response.headers["Retry-After"] = str(retry_after)
        return response, 429
    return None


@auth_bp.route("/register", methods=["POST"])
@auth_bp.route("/provider-resubmission", methods=["POST"])
def register():
    resubmitting = request.path.endswith("provider-resubmission")
    if resubmitting:
        limit = credential_attempt_limit()
        if limit is not None:
            return limit
        request.max_content_length = MAX_LOGIN_BODY_BYTES
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error_response("Send registration details as a JSON object.", 400)
    if resubmitting and data.get("role") != "sponsor":
        return error_response("Provider registration details are required.",400)
    full_name = data.get("full_name")
    email = data.get("email")
    password = data.get("password")
    phone_number = data.get("phone_number")
    role = data.get("role", "student")

    if not isinstance(role, str) or role not in ["student", "sponsor", "advisor", "admin"]:
        return error_response("Invalid role")

    if role in {"admin", "advisor"}:
        authorization_error = admin_access_required(lambda: None)()
        if authorization_error is not None:
            return authorization_error

    if not isinstance(full_name, str) or not full_name.strip() or len(full_name.strip()) > 150:
        return error_response("Enter your full name (up to 150 characters).", 400)
    full_name = full_name.strip()
    if re.search(r"\d", full_name):
        return error_response("Full name must not contain numbers.", 400)
    if not isinstance(email, str):
        return error_response("Enter a valid email address.", 400)
    email = email.strip().lower()
    if len(email) > 254 or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        return error_response("Enter a valid email address.", 400)
    if not isinstance(password, str) or not 8 <= len(password) <= MAX_PASSWORD_LENGTH or not password.strip():
        return error_response(f"Use between 8 and {MAX_PASSWORD_LENGTH} characters for your password.", 400)
    # Public signup must provide confirmation; the admin creation form has no
    # confirmation field, but any confirmation supplied there must also match.
    if role in {"student", "sponsor"} or "confirm_password" in data:
        if data.get("confirm_password") != password:
            return error_response("Passwords do not match. Please confirm your password.", 400)
    if phone_number is not None:
        if not isinstance(phone_number, str):
            return error_response("Enter a valid phone number.", 400)
        phone_number = phone_number.strip()
        if phone_number and not re.fullmatch(r"\+?[0-9]{8,15}", phone_number):
            return error_response("Enter a valid phone number using digits and an optional leading +.", 400)

    if role == "sponsor":
        full_name = str(full_name).strip()
        email = str(email).strip().lower()
        phone_number = str(phone_number or "").strip()
        organization_name = str(data.get("organization_name") or "").strip()
        organization_type = str(data.get("organization_type") or "").strip()
        website = str(data.get("website") or "").strip()
        if not full_name or len(full_name) > 150 or not organization_name or len(organization_name) > 200:
            return error_response("Enter a contact person name and organisation name.", 400)
        if len(email) > 254 or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
            return error_response("Enter a valid official email address.", 400)
        if not re.fullmatch(r"\+?[0-9]{8,15}", phone_number):
            return error_response("Enter a valid phone number using digits and an optional leading +.", 400)
        if organization_type not in {"Government Agency", "Foundation", "Private Company", "NGO", "Educational Institution", "Corporate", "University", "Non-Profit Organization"}:
            return error_response("Select a valid organisation type.", 400)
        parsed_website = urlparse(website)
        if website and (len(website) > 500 or parsed_website.scheme not in {"http", "https"} or not parsed_website.hostname or any(character.isspace() for character in website)):
            return error_response("Enter a valid website starting with https:// or http://.", 400)
        data.update(organization_name=organization_name, organization_type=organization_type, website=website or None)

    if resubmitting:
        from provider_workflows import resubmit_registration
        data.update(full_name=full_name,email=email,phone_number=phone_number)
        return resubmit_registration(data)
    password_hash = generate_password_hash(password, method="pbkdf2:sha256")
    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("select user_id from app_user where lower(trim(email)) = %s limit 1", (email,))
        if cursor.fetchone():
            return error_response("Email is already registered", 409)

        cursor.execute("""
            insert into app_user (full_name, email, password, phone_number, role, status)
            values (%s, %s, %s, %s, %s, %s)
            returning user_id, full_name, email, phone_number, role, status, created_at
        """, (full_name, email, password_hash, phone_number, role, "pending" if role == "sponsor" else "active"))
        user = cursor.fetchone()
        user_id = user["user_id"]

        if role == "student":
            cursor.execute("""
                insert into student (
                    student_id,
                    date_of_birth,
                    gender,
                    nationality,
                    education_level,
                    cgpa,
                    field_of_study,
                    university
                )
                values (%s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                user_id,
                data.get("date_of_birth"),
                data.get("gender"),
                data.get("nationality"),
                data.get("education_level"),
                data.get("cgpa"),
                data.get("field_of_study"),
                data.get("university"),
            ))
        elif role == "sponsor":
            cursor.execute("""
                insert into sponsor (
                    sponsor_id,
                    organization_name,
                    organization_type,
                    website,
                    subscription_status
                )
                values (%s, %s, %s, %s, %s)
            """, (
                user_id,
                data.get("organization_name"),
                data.get("organization_type"),
                data.get("website"),
                "free",
            ))
        elif role == "advisor":
            cursor.execute("""
                insert into advisor (
                    advisor_id,
                    specialization,
                    qualification,
                    experience_years,
                    average_rating
                )
                values (%s, %s, %s, %s, %s)
            """, (
                user_id,
                data.get("specialization"),
                data.get("qualification"),
                data.get("experience_years"),
                data.get("average_rating"),
            ))
        elif role == "admin":
            cursor.execute("""
                insert into admin (admin_id, department, role_level)
                values (%s, %s, %s)
            """, (
                user_id,
                data.get("department"),
                data.get("role_level", "admin"),
            ))

        if role in ("admin", "advisor"):
            cursor.execute("insert into audit_log (user_id, action, description) values (%s, %s, %s)",
                           (g.admin_id, 'create_staff_account', f'Created {role} account {user_id}'))
        if role == "sponsor":
            cursor.execute("""insert into notification (user_id, message, notification_type, is_read)
                select user_id, %s, 'provider_verification', false from app_user where role = 'admin'""",
                (f"Provider registration awaiting verification: {data['organization_name']} ({email}).",))
        connection.commit()
        cursor.close()
        connection.close()
        return jsonify({"message": "Your registration has been submitted successfully! Your account is pending administrator verification. You will be notified once your account has been reviewed." if role == "sponsor" else "Registration successful", "user": user}), 201
    except psycopg2.errors.UniqueViolation:
        if connection:
            connection.rollback()
        if cursor:
            cursor.close()
        if connection:
            connection.close()
        return error_response("Email is already registered", 409)
    except Exception as e:
        if connection:
            connection.rollback()
        if cursor:
            cursor.close()
        if connection:
            connection.close()
        return internal_error_response(e)
    finally:
        if cursor and not cursor.closed:
            cursor.close()
        if connection and not connection.closed:
            connection.close()


@auth_bp.route("/login", methods=["POST"])
def login():
    limit = credential_attempt_limit()
    if limit is not None:
        return limit

    request.max_content_length = MAX_LOGIN_BODY_BYTES
    try:
        data = request.get_json(silent=True)
    except RequestEntityTooLarge:
        return error_response("Login request is too large.", 413)
    if not isinstance(data, dict):
        return error_response("Send login details as a JSON object.")

    email = data.get("email")
    password = data.get("password")
    if not isinstance(email, str):
        return error_response("Enter a valid email address.")
    email = email.strip()
    if len(email) > 254 or not re.fullmatch(r"[^\s@\x00]+@[^\s@\x00]+\.[^\s@\x00]+", email):
        return error_response("Enter a valid email address.")
    if not isinstance(password, str) or not password.strip() or len(password) > MAX_PASSWORD_LENGTH:
        return error_response("Enter a valid password.")
    try:
        email.encode("utf-8")
        password.encode("utf-8")
    except UnicodeEncodeError:
        return error_response("Enter a valid email address and password.")

    try:
        with closing(get_db_connection()) as connection, closing(connection.cursor()) as cursor:
            cursor.execute("""
                select user_id, full_name, email, password, phone_number, role,
                       profile_picture, status, created_at, provider_rejection_reason
                from app_user
                where email in (%s, %s)
                order by (email = %s) desc
                limit 1
            """, (email, email.lower(), email))
            user = cursor.fetchone()

        password_hash = user.get("password") if user else None
        password_matches = check_password_hash(password_hash or DUMMY_PASSWORD_HASH, password)
        if not password_hash or not password_matches:
            return error_response("Invalid email or password", 401)

        status = str(user.get("status") or "").lower()
        if status == "pending":
            return error_response("Your account is pending administrator verification. Please check again after your account has been reviewed.", 403)
        if status == 'rejected' and user['role'] == 'sponsor':
            reason = user.get('provider_rejection_reason') or 'Contact ScholarOne support for the review details.'
            return jsonify(error=f"Provider registration rejected: {reason} You may correct your details and resubmit your registration.",
                           code="provider_registration_rejected",
                           reason=reason, can_resubmit=True), 403, {"Cache-Control": "no-store"}
        if status != "active" or user.get("role") not in ("student", "advisor", "sponsor", "admin"):
            return error_response("Your account is currently unavailable. Please contact ScholarOne support.", 403)

        user.pop("password", None)
        user["status"] = status
        return jsonify({"message": "Login successful", "user": user, "access_token": issue_access_token(user)})
    except Exception as e:
        return internal_error_response(e, 503)
