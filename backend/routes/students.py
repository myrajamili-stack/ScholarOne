from flask import Blueprint, jsonify, request

from db import get_db_connection
from responses import error_response

students_bp = Blueprint("students", __name__, url_prefix="/api/students")


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


@students_bp.route("/<int:student_id>/profile", methods=["GET"])
def get_student_profile(student_id):
    try:
        connection = get_db_connection()
        cursor = connection.cursor()
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
                st.university
            from app_user u
            join student st on st.student_id = u.user_id
            where st.student_id = %s
        """, (student_id,))
        profile = cursor.fetchone()
        cursor.close()
        connection.close()

        if not profile:
            return error_response("Student profile not found", 404)

        return jsonify(profile)
    except Exception as e:
        return error_response(str(e), 500)


@students_bp.route("/<int:student_id>/profile", methods=["PUT"])
def update_student_profile(student_id):
    data = request.get_json() or {}
    connection = None
    cursor = None

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
            data.get("full_name"),
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
                cgpa = %s,
                field_of_study = %s,
                university = %s
            where student_id = %s
        """, (
            data.get("date_of_birth") or None,
            data.get("gender"),
            data.get("nationality"),
            data.get("education_level"),
            cgpa,
            data.get("field_of_study"),
            data.get("university"),
            student_id,
        ))

        connection.commit()
        cursor.close()
        connection.close()

        return get_student_profile(student_id)
    except ValueError:
        if connection:
            connection.rollback()
        return error_response("CGPA must be a valid number")
    except Exception as e:
        if connection:
            connection.rollback()
        if cursor:
            cursor.close()
        if connection:
            connection.close()
        return error_response(str(e), 500)


@students_bp.route("/<int:student_id>/saved-scholarships", methods=["GET"])
def get_saved_scholarships(student_id):
    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        cursor.execute(_scholarship_select_query("""
            where ss.student_id = %s
              and lower(coalesce(s.status, 'pending')) in ('approved', 'active')
        """), (student_id,))
        saved_scholarships = cursor.fetchall()
        cursor.close()
        connection.close()

        return jsonify(saved_scholarships)
    except Exception as e:
        return error_response(str(e), 500)


@students_bp.route("/<int:student_id>/saved-scholarships/<int:scholarship_id>", methods=["POST"])
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

        cursor.execute("""
            select scholarship_id
            from scholarship
            where scholarship_id = %s
              and lower(coalesce(status, 'pending')) in ('approved', 'active')
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
        return error_response(str(e), 500)


@students_bp.route("/<int:student_id>/saved-scholarships/<int:scholarship_id>", methods=["DELETE"])
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
        return error_response(str(e), 500)
