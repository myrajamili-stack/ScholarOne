import re
from urllib.parse import urlparse

import psycopg2
from flask import Blueprint, jsonify, request
from werkzeug.security import check_password_hash, generate_password_hash

from db import get_db_connection
from responses import error_response
from security import admin_access_required, issue_access_token

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json() or {}
    full_name = data.get("full_name")
    email = data.get("email")
    password = data.get("password")
    phone_number = data.get("phone_number")
    role = data.get("role", "student")

    if not full_name or not email or not password:
        return error_response("full_name, email, and password are required")

    if role not in ["student", "sponsor", "advisor", "admin"]:
        return error_response("Invalid role")

    if role in {"admin", "advisor"}:
        authorization_error = admin_access_required(lambda: None)()
        if authorization_error is not None:
            return authorization_error

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
        if not isinstance(password, str) or len(password) < 8:
            return error_response("Use at least 8 characters for your password.", 400)
        if data.get("confirm_password", password) != password:
            return error_response("Passwords do not match.", 400)
        parsed_website = urlparse(website)
        if website and (len(website) > 500 or parsed_website.scheme not in {"http", "https"} or not parsed_website.hostname or any(character.isspace() for character in website)):
            return error_response("Enter a valid website starting with https:// or http://.", 400)
        data.update(organization_name=organization_name, organization_type=organization_type, website=website or None)

    password_hash = generate_password_hash(password, method="pbkdf2:sha256")
    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()

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
        return error_response(str(e), 500)


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    email = data.get("email")
    password = data.get("password")

    if not email or not password:
        return error_response("email and password are required")

    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        cursor.execute("""
            select user_id, full_name, email, password, phone_number, role, profile_picture, status, created_at
            from app_user
            where email = %s
        """, (email,))
        user = cursor.fetchone()
        cursor.close()
        connection.close()

        if not user or not check_password_hash(user["password"], password):
            return error_response("Invalid email or password", 401)

        status = str(user.get("status") or "active").lower()
        if status == "pending":
            return error_response("Your account is pending administrator verification. Please check again after your account has been reviewed.", 403)
        if status != "active":
            return error_response("Your account is currently unavailable. Please contact ScholarOne support.", 403)

        user.pop("password", None)
        return jsonify({"message": "Login successful", "user": user, "access_token": issue_access_token(user)})
    except Exception as e:
        return error_response(str(e), 500)
