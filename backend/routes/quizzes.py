from flask import Blueprint, jsonify, request

from db import get_db_connection
from responses import error_response

quizzes_bp = Blueprint("quizzes", __name__, url_prefix="/api/quizzes")


@quizzes_bp.route("", methods=["GET"])
def get_quizzes():
    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        cursor.execute("""
            select
                q.quiz_id,
                q.title,
                q.description,
                q.created_at,
                q.advisor_id,
                u.full_name as advisor_name,
                a.specialization as advisor_specialization,
                count(qq.question_id) as question_count
            from quiz q
            left join advisor a on a.advisor_id = q.advisor_id
            left join app_user u on u.user_id = q.advisor_id
            left join quiz_question qq on qq.quiz_id = q.quiz_id
            group by
                q.quiz_id,
                q.title,
                q.description,
                q.created_at,
                q.advisor_id,
                u.full_name,
                a.specialization
            order by q.created_at desc
        """)
        quizzes = cursor.fetchall()
        cursor.close()
        connection.close()
        return jsonify(quizzes)
    except Exception as e:
        return error_response(str(e), 500)


@quizzes_bp.route("/advisor/<int:advisor_id>", methods=["GET"])
def get_advisor_quizzes(advisor_id):
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            select
                q.quiz_id,
                q.title,
                q.description,
                q.created_at,
                count(distinct qq.question_id) as question_count,
                count(distinct qa.attempt_id) as attempt_count,
                coalesce(round(avg(qa.score), 2), 0) as average_score
            from quiz q
            left join quiz_question qq on qq.quiz_id = q.quiz_id
            left join quiz_attempt qa on qa.quiz_id = q.quiz_id
            where q.advisor_id = %s
            group by q.quiz_id, q.title, q.description, q.created_at
            order by q.created_at desc
        """, (advisor_id,))
        quizzes = cursor.fetchall()

        cursor.execute("""
            select
                count(distinct q.quiz_id) as total_quizzes,
                count(distinct qa.attempt_id) as total_attempts,
                coalesce(round(avg(qa.score), 2), 0) as average_score
            from quiz q
            left join quiz_attempt qa on qa.quiz_id = q.quiz_id
            where q.advisor_id = %s
        """, (advisor_id,))
        summary = cursor.fetchone()

        cursor.close()
        connection.close()

        return jsonify({"summary": summary, "quizzes": quizzes})
    except Exception as e:
        return error_response(str(e), 500)


@quizzes_bp.route("/advisor/<int:advisor_id>", methods=["POST"])
def create_advisor_quiz(advisor_id):
    data = request.get_json() or {}
    title = data.get("title")
    description = data.get("description")
    questions = data.get("questions") or []

    if not title:
        return error_response("Quiz title is required", 400)

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            select advisor_id
            from advisor
            where advisor_id = %s
        """, (advisor_id,))
        if not cursor.fetchone():
            cursor.execute("""
                insert into advisor (advisor_id, specialization, qualification, experience_years, average_rating)
                values (%s, '', '', null, 0)
                on conflict (advisor_id) do nothing
            """, (advisor_id,))

        cursor.execute("""
            insert into quiz (advisor_id, title, description)
            values (%s, %s, %s)
            returning quiz_id, title, description, created_at
        """, (advisor_id, title, description))
        quiz = cursor.fetchone()

        for question in questions:
            question_text = question.get("question_text")
            if not question_text:
                continue

            cursor.execute("""
                insert into quiz_question (quiz_id, question_text, question_type)
                values (%s, %s, %s)
                returning question_id
            """, (quiz["quiz_id"], question_text, question.get("question_type", "multiple_choice")))
            created_question = cursor.fetchone()

            for option in question.get("options", []):
                option_text = option.get("option_text")
                if not option_text:
                    continue

                cursor.execute("""
                    insert into quiz_option (question_id, option_text, pathway_result)
                    values (%s, %s, %s)
                """, (
                    created_question["question_id"],
                    option_text,
                    option.get("pathway_result"),
                ))

        connection.commit()
        cursor.close()
        connection.close()

        return jsonify({"message": "Quiz created successfully", "quiz": quiz}), 201
    except Exception as e:
        if connection:
            connection.rollback()
        if cursor:
            cursor.close()
        if connection:
            connection.close()
        return error_response(str(e), 500)
