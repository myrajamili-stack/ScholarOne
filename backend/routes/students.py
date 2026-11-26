import math
import json
import re
from datetime import date
from functools import wraps
from contextlib import closing
from flask import Blueprint, jsonify, request, g, current_app, send_from_directory
from psycopg2.errors import UndefinedColumn, UndefinedTable
from academic_results import validate_qualifications
from security import student_access_required

from db import get_db_connection
from responses import error_response, internal_error_response
from scholarship_availability import PUBLISHED_SCHOLARSHIP

students_bp = Blueprint("students", __name__, url_prefix="/api/students")


@students_bp.route("/settings/notifications", methods=["GET", "PATCH"])
@student_access_required
def notification_preferences():
    preferences = ("appointment_alerts", "pathway_updates")
    if request.method == "PATCH":
        payload = request.get_json(silent=True)
        if (not isinstance(payload, dict) or not payload or set(payload) - set(preferences)
                or any(type(value) is not bool for value in payload.values())):
            return error_response("Send appointment and pathway preferences as true or false.")
    try:
        with closing(get_db_connection()) as connection, connection, connection.cursor() as cursor:
            if request.method == "PATCH":
                values = tuple(payload.get(key) for key in preferences)
                cursor.execute("""
                    insert into public.student_notification_preference (student_id, appointment_alerts, pathway_updates)
                    values (%s, coalesce(%s, true), coalesce(%s, true))
                    on conflict (student_id) do update set
                        appointment_alerts=coalesce(%s, student_notification_preference.appointment_alerts),
                        pathway_updates=coalesce(%s, student_notification_preference.pathway_updates)
                    returning appointment_alerts, pathway_updates
                """, (g.student_id, *values, *values))
            else:
                cursor.execute("""
                    select appointment_alerts, pathway_updates
                    from public.student_notification_preference where student_id=%s
                """, (g.student_id,))
            saved = cursor.fetchone()
        return jsonify(preferences=saved if saved is not None else dict.fromkeys(preferences, True))
    except UndefinedTable:
        return error_response("Notification preferences are unavailable until the database is updated.", 503)
    except Exception as error:
        return internal_error_response(error, 503)


def profile_owner_required(function):
    @student_access_required
    @wraps(function)
    def wrapped(student_id):
        if g.student_id != student_id:
            return error_response("You can only manage your own profile.", 403)
        return function(student_id)
    return wrapped


def validate_student_profile(data):
    if not isinstance(data, dict):
        return "Send a profile object."
    name = data.get('full_name', '')
    if not isinstance(name, str) or not 2 <= len(name.strip()) <= 100:
        return "Enter your full name (2–100 characters)."
    phone = data.get('phone_number') or ''
    if not isinstance(phone, str):
        return "Enter a valid phone number."
    if phone and (not re.fullmatch(r'\+?[0-9 ()-]+', phone.strip()) or not re.fullmatch(r'\+?[0-9]{7,15}', re.sub(r'[ ()-]', '', phone.strip()))):
        return "Phone number must contain 7–15 digits, with an optional leading +."
    dob = data.get('date_of_birth')
    if dob:
        try:
            if date.fromisoformat(dob) > date.today():
                return "Date of birth cannot be in the future."
        except (ValueError, TypeError):
            return "Choose a valid date of birth."
    cgpa = data.get('cgpa')
    field = data.get('field_of_study')
    if field is not None and (not isinstance(field, str) or len(field.strip()) > 100 or field.strip().casefold() == "other"):
        return "Enter your field of study using up to 100 characters."
    if cgpa not in (None, ''):
        try:
            if not math.isfinite(float(cgpa)) or not 0 <= float(cgpa) <= 4:
                return "CGPA must be between 0.00 and 4.00."
        except (ValueError, TypeError):
            return "CGPA must be a valid number."
    return None


def _scholarship_select_query(where_clause):
    return f"""
        select
            ss.saved_id,
            ss.saved_at,
            s.scholarship_id,
            s.sponsor_id,
            sp.organization_name,
            s.title,
            s.description,
            s.amount,
            s.category,
            s.eligibility_criteria,
            s.deadline,
            s.funding_type,
            s.status,
            s.created_at
        from saved_scholarship ss
        join scholarship s on s.scholarship_id = ss.scholarship_id
        left join sponsor sp on sp.sponsor_id = s.sponsor_id
        {where_clause}
        order by ss.saved_at desc
    """


def read_student_profile(cursor, student_id):
    cursor.execute("""
            select
                u.user_id,
                u.full_name,
                u.email,
                u.phone_number,
                u.role,
                u.profile_picture,
                u.status,
                u.created_at,
                st.date_of_birth,
                st.gender,
                st.nationality,
                st.education_level,
                st.cgpa,
                st.field_of_study,
                st.university,
                coalesce(to_jsonb(st)->'academic_qualifications', '{}'::jsonb) as academic_qualifications
            from app_user u
            join student st on st.student_id = u.user_id
            where st.student_id = %s
    """, (student_id,))
    profile = cursor.fetchone()
    if profile and profile.get("date_of_birth"):
        profile["date_of_birth"] = profile["date_of_birth"].isoformat()
    return profile


@students_bp.route("/<int:student_id>/profile", methods=["GET"])
@profile_owner_required
def get_student_profile(student_id):
    try:
        with closing(get_db_connection()) as connection, closing(connection.cursor()) as cursor:
            profile = read_student_profile(cursor, student_id)
        if not profile:
            return error_response("Student profile not found", 404)
        return jsonify(profile)
    except Exception as e:
        return internal_error_response(e)


@students_bp.route("/<int:student_id>/profile", methods=["PUT"])
@profile_owner_required
def update_student_profile(student_id):
    data = request.get_json(silent=True)
    validation_error = validate_student_profile(data)
    if validation_error:
        return error_response(validation_error, 400)
    try:
        qualifications = validate_qualifications(data.get("academic_qualifications", {}))
    except ValueError as error:
        return error_response(str(error), 400)
    connection = None
    cursor = None
    saving_qualifications = False

    try:
        cgpa = data.get("cgpa")

        if cgpa not in [None, ""]:
            cgpa = float(cgpa)
            if cgpa < 0 or cgpa > 4:
                return error_response("CGPA must be between 0.00 and 4.00")
        else:
            cgpa = None

        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            update app_user
            set
                full_name = %s,
                phone_number = %s
            where user_id = %s
        """, (
            data["full_name"].strip(),
            data.get("phone_number"),
            student_id,
        ))

        cursor.execute("""
            update student
            set
                date_of_birth = %s,
                gender = %s,
                nationality = %s,
                education_level = %s,
                cgpa = case when %s then %s else cgpa end,
                field_of_study = %s,
                university = %s
            where student_id = %s
        """, (
            data.get("date_of_birth") or None,
            data.get("gender"),
            data.get("nationality"),
            data.get("education_level"),
            "cgpa" in data,
            cgpa,
            (data.get("field_of_study") or "").strip() or None,
            data.get("university"),
            student_id,
        ))

        if qualifications:
            saving_qualifications = True
            cursor.execute("""update student set academic_qualifications = academic_qualifications || (
                                  select jsonb_object_agg(kind, coalesce(academic_qualifications->kind, '{}'::jsonb) || result)
                                  from jsonb_each(%s::jsonb) as changes(kind, result)
                              ) where student_id = %s""", (json.dumps(qualifications), student_id))
        profile = read_student_profile(cursor, student_id)
        if not profile:
            connection.rollback()
            return error_response("Student profile not found", 404)
        response = jsonify(profile)
        connection.commit()
        return response
    except UndefinedColumn as error:
        if connection:
            connection.rollback()
        if saving_qualifications:
            return error_response("Academic qualification storage is not enabled yet. Your profile changes were not saved.", 503)
        return internal_error_response(error)
    except ValueError:
        if connection:
            connection.rollback()
        return error_response("CGPA must be a valid number")
    except Exception as e:
        if connection:
            connection.rollback()
        return internal_error_response(e)
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


@students_bp.route("/<int:student_id>/saved-scholarships", methods=["GET"])
@student_access_required
def get_saved_scholarships(student_id):
    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        cursor.execute(_scholarship_select_query(f"""
            where ss.student_id = %s
              and {PUBLISHED_SCHOLARSHIP}
        """), (student_id,))
        saved_scholarships = cursor.fetchall()
        cursor.close()
        connection.close()

        return jsonify(saved_scholarships)
    except Exception as e:
        return internal_error_response(e)


@students_bp.route("/<int:student_id>/saved-scholarships/<int:scholarship_id>", methods=["POST"])
@student_access_required
def save_scholarship(student_id, scholarship_id):
    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("select student_id from student where student_id = %s", (student_id,))
        if not cursor.fetchone():
            cursor.close()
            connection.close()
            return error_response("Student profile not found", 404)

        cursor.execute(f"""
            select scholarship_id
            from scholarship s
            where scholarship_id = %s
              and {PUBLISHED_SCHOLARSHIP}
        """, (scholarship_id,))
        if not cursor.fetchone():
            cursor.close()
            connection.close()
            return error_response("Scholarship not found", 404)

        cursor.execute("""
            insert into saved_scholarship (student_id, scholarship_id)
            values (%s, %s)
            on conflict (student_id, scholarship_id) do nothing
        """, (student_id, scholarship_id))
        connection.commit()

        cursor.execute(_scholarship_select_query("""
            where ss.student_id = %s
              and ss.scholarship_id = %s
        """), (student_id, scholarship_id))
        saved_scholarship = cursor.fetchone()

        cursor.close()
        connection.close()

        return jsonify({"saved": True, "scholarship": saved_scholarship})
    except Exception as e:
        if connection:
            connection.rollback()
        if cursor:
            cursor.close()
        if connection:
            connection.close()
        return internal_error_response(e)


@students_bp.route("/<int:student_id>/saved-scholarships/<int:scholarship_id>", methods=["DELETE"])
@student_access_required
def remove_saved_scholarship(student_id, scholarship_id):
    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        cursor.execute("""
            delete from saved_scholarship
            where student_id = %s and scholarship_id = %s
        """, (student_id, scholarship_id))
        connection.commit()
        cursor.close()
        connection.close()

        return jsonify({"saved": False, "scholarship_id": scholarship_id})
    except Exception as e:
        if connection:
            connection.rollback()
        if cursor:
            cursor.close()
        if connection:
            connection.close()
        return internal_error_response(e)


def student_photo_directory():
    from pathlib import Path
    return Path(current_app.config.get('STUDENT_PHOTO_DIR', Path(current_app.instance_path) / 'student_profile_photos'))


@students_bp.route('/<int:student_id>/profile/photo', methods=['POST'])
@profile_owner_required
def upload_student_photo(student_id):
    from uuid import uuid4
    from werkzeug.exceptions import RequestEntityTooLarge
    from profile_photos import MAX_PHOTO_BYTES, prepare_photo
    saved_path = None
    try:
        request.max_content_length = MAX_PHOTO_BYTES + 1024 * 1024
        upload = request.files.get('photo')
        if not upload or not upload.filename:
            return error_response('Choose a photo to upload.', 400)
        try:
            photo = prepare_photo(upload.read(MAX_PHOTO_BYTES + 1))
        except ValueError as exc:
            return error_response(str(exc), 400)
        with closing(get_db_connection()) as connection, connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT user_id FROM app_user WHERE user_id=%s AND role='student' AND coalesce(status,'active')='active' FOR UPDATE", (student_id,))
                if not cursor.fetchone():
                    return error_response('Student account not found.', 404)
                filename = uuid4().hex + '.jpg'
                directory = student_photo_directory()
                directory.mkdir(parents=True, exist_ok=True)
                saved_path = directory / filename
                saved_path.write_bytes(photo)
                url = request.host_url.rstrip('/') + '/api/students/profile-photos/' + filename
                cursor.execute('UPDATE app_user SET profile_picture=%s WHERE user_id=%s', (url, student_id))
        return jsonify(profile_picture=url)
    except RequestEntityTooLarge:
        return error_response('Choose a photo smaller than 5 MB.', 413)
    except Exception:
        if saved_path:
            saved_path.unlink(missing_ok=True)
        current_app.logger.exception('Unable to save student photo')
        return error_response('Unable to save your photo. Please try again.', 503)


@students_bp.route('/profile-photos/<filename>', methods=['GET'])
def get_student_photo(filename):
    if not re.fullmatch(r'[a-f0-9]{32}\.jpg', filename):
        return error_response('Photo not found.', 404)
    response = send_from_directory(student_photo_directory(), filename, mimetype='image/jpeg', max_age=31536000)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    return response
