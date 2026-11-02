from contextlib import closing
from uuid import UUID

from flask import Blueprint, current_app, g, jsonify, request
from psycopg2.extras import Json

from career_assessment import answer_rows, calculate_result
from db import get_db_connection
from responses import error_response
from security import student_access_required

assessment_attempts_bp = Blueprint("assessment_attempts", __name__, url_prefix="/api/quizzes/career-assessment")


def student_exists(cursor):
    cursor.execute("SELECT st.student_id FROM student st JOIN app_user u ON u.user_id=st.student_id WHERE st.student_id=%s AND u.role=%s AND (u.status IS NULL OR u.status=%s)",
                   (g.student_id, "student", "active"))
    return cursor.fetchone() is not None


def attempt_response(row):
    return {"attempt_id": row["attempt_id"], "submitted_at": row["attempt_date"].isoformat(),
            "result": row["assessment_result"]}


@assessment_attempts_bp.route("/attempts/latest", methods=["GET"])
@student_access_required
def latest_attempt():
    try:
        with closing(get_db_connection()) as connection:
            with connection.cursor() as cursor:
                if not student_exists(cursor):
                    return error_response("Active student account not found.", 403)
                cursor.execute("""SELECT qa.attempt_id, qa.attempt_date, qa.assessment_result
                    FROM quiz_attempt qa JOIN quiz q ON q.quiz_id=qa.quiz_id
                    WHERE qa.student_id=%s AND q.assessment_definition->>'key'=%s
                    AND qa.assessment_result IS NOT NULL
                    ORDER BY qa.attempt_date DESC, qa.attempt_id DESC LIMIT 1""",
                               (g.student_id, "career-assessment"))
                row = cursor.fetchone()
        return jsonify({"attempt": attempt_response(row) if row else None})
    except Exception:
        current_app.logger.error("Could not load career assessment result")
        return error_response("Unable to load your saved assessment. Please try again.", 503)


@assessment_attempts_bp.route("/attempts", methods=["POST"])
@student_access_required
def save_attempt():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return error_response("A JSON assessment submission is required.")
    try:
        submission_id = str(UUID(payload.get("submission_id", "")))
    except (ValueError, TypeError, AttributeError):
        return error_response("A valid submission ID is required.")
    if type(payload.get("assessment_version")) is not int:
        return error_response("An assessment version is required.")
    answers, rankings = payload.get("answers"), payload.get("rankings")
    try:
        with closing(get_db_connection()) as connection:
            with connection:
                with connection.cursor() as cursor:
                    if not student_exists(cursor):
                        return error_response("Active student account not found.", 403)
                    cursor.execute("""SELECT quiz_id, assessment_definition FROM quiz
                        WHERE assessment_definition->>'key'=%s
                        AND assessment_definition->>'version'=%s ORDER BY quiz_id DESC LIMIT 1 FOR SHARE""",
                                   ("career-assessment", str(payload["assessment_version"])))
                    quiz = cursor.fetchone()
                    if not quiz:
                        return error_response("This assessment version is not available. Please reload the page.", 409)
                    definition = quiz["assessment_definition"]
                    result = calculate_result(definition, answers, rankings)
                    cursor.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))",
                                   (f"assessment:{g.student_id}:{quiz['quiz_id']}:{submission_id}",))
                    cursor.execute("""SELECT attempt_id,attempt_date,assessment_result,assessment_answers
                        FROM quiz_attempt WHERE student_id=%s AND quiz_id=%s AND submission_id=%s""",
                                   (g.student_id, quiz["quiz_id"], submission_id))
                    existing = cursor.fetchone()
                    submitted = {"answers": answers, "rankings": rankings}
                    if existing:
                        if existing["assessment_answers"] != submitted:
                            return error_response("This submission ID was already used for different answers.", 409)
                        return jsonify({"attempt": attempt_response(existing)}), 200
                    cursor.execute("""INSERT INTO quiz_attempt
                        (student_id,quiz_id,score,result_pathway,assessment_answers,assessment_result,assessment_version,submission_id)
                        VALUES (%s,%s,NULL,%s,%s,%s,%s,%s)
                        RETURNING attempt_id,attempt_date,assessment_result""",
                                   (g.student_id, quiz["quiz_id"], result["hollandCode"], Json(submitted), Json(result),
                                    definition["version"], submission_id))
                    saved = cursor.fetchone()
                    cursor.executemany("INSERT INTO quiz_answer (attempt_id,question_id,selected_option_id,selected_rank) VALUES (%s,%s,%s,%s)",
                                       answer_rows(definition, answers, rankings, saved["attempt_id"]))
        return jsonify({"attempt": attempt_response(saved)}), 201
    except ValueError as error:
        return error_response(str(error))
    except Exception:
        current_app.logger.error("Could not save career assessment attempt")
        return error_response("Unable to save your assessment. Your answers are still here; please try again.", 503)
