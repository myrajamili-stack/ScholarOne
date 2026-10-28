import psycopg2
from flask import Blueprint, jsonify, request
from werkzeug.security import check_password_hash, generate_password_hash

from db import get_db_connection
from responses import error_response

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
        """, (full_name, email, password_hash, phone_number, role, "active"))
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
                data.get("subscription_status", "free"),
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

        connection.commit()
        cursor.close()
        connection.close()
        return jsonify({"message": "Registration successful", "user": user}), 201
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

        user.pop("password", None)
        return jsonify({"message": "Login successful", "user": user})
    except Exception as e:
        return error_response(str(e), 500)
