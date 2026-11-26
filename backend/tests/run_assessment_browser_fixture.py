"""Run the advisor draft browser regression against a disposable local database schema."""
from contextlib import closing
import os
from pathlib import Path
import subprocess
import sys
from threading import Thread
from unittest.mock import patch
from uuid import uuid4

from psycopg2 import connect, sql
from psycopg2.extensions import make_dsn, parse_dsn
from werkzeug.serving import make_server

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

SCHEMA = """
create table app_user (user_id bigint primary key, full_name text, role text, status text);
create table advisor (advisor_id bigint primary key references app_user, specialization text);
create table student (student_id bigint primary key references app_user);
create table quiz (quiz_id bigserial primary key, advisor_id bigint references advisor,
    title text, description text, status text, revision integer default 1,
    created_at timestamp default now(), creation_id uuid, assessment_definition jsonb,
    unique(advisor_id, creation_id));
create table quiz_question (question_id bigserial primary key, quiz_id bigint references quiz,
    question_text text, question_type text);
create table quiz_option (option_id bigserial primary key, question_id bigint references quiz_question,
    option_text text, pathway_result text);
create table quiz_attempt (attempt_id bigserial primary key, quiz_id bigint references quiz, student_id bigint references student,
    score numeric, result_pathway text, attempt_date timestamp default now(), assessment_answers jsonb,
    assessment_result jsonb, assessment_version integer, submission_id uuid, unique (student_id,quiz_id,submission_id));
create table quiz_answer (attempt_id bigint references quiz_attempt, question_id bigint references quiz_question,
    selected_option_id bigint references quiz_option);
create table academic_pathway (pathway_id bigint primary key, title text, status text);
insert into app_user values (11,'Fixture Advisor','advisor','active');
insert into app_user values (12,'Fixture Student','student','active');
insert into advisor (advisor_id) values (11);
insert into student values (12);
"""


def run(browser, mode='--draft-repair-real'):
    if mode not in ('--draft-repair-real', '--appa-real'):
        raise ValueError('Choose a supported local browser fixture mode.')
    dsn = os.environ["SCHOLARONE_TEST_POSTGRES_DSN"]
    params = parse_dsn(dsn)
    if params.get("host") != "127.0.0.1" or params.get("port") != "55432" or any(
        key in params for key in ("hostaddr", "service", "options")
    ):
        raise ValueError("Use the disposable PostgreSQL instance on localhost port 55432.")
    os.environ.update(PYTHON_DOTENV_DISABLED="1", CORS_ALLOWED_ORIGINS="http://127.0.0.1:5178")
    from app import create_app
    from security import issue_access_token

    schema = f"scholarone_browser_{uuid4().hex}"
    with closing(connect(dsn)) as connection, connection, connection.cursor() as cursor:
        cursor.execute(sql.SQL("create schema {}").format(sql.Identifier(schema)))
    try:
        fixture_dsn = make_dsn(dsn, options=f"-c search_path={schema}")
        with closing(connect(fixture_dsn)) as connection, connection, connection.cursor() as cursor:
            cursor.execute(SCHEMA)
        with patch("db.DATABASE_URL", fixture_dsn):
            app = create_app()
            with app.app_context():
                token = issue_access_token({"user_id": 11, "role": "advisor"})
                student_token = issue_access_token({"user_id": 12, "role": "student"})
            server = make_server("127.0.0.1", 5501, app, threaded=True)
            thread = Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                subprocess.run(
                    ["node", "frontend/tests/browser-scholarships.mjs", browser, mode],
                    cwd=BACKEND.parent, env={**os.environ, "SCHOLARONE_FIXTURE_ADVISOR_TOKEN": token,
                                             "SCHOLARONE_FIXTURE_STUDENT_TOKEN": student_token}, check=True,
                )
            finally:
                server.shutdown()
                server.server_close()
                thread.join()
    finally:
        with closing(connect(dsn)) as connection, connection, connection.cursor() as cursor:
            cursor.execute(sql.SQL("drop schema {} cascade").format(sql.Identifier(schema)))


if __name__ == "__main__":
    run(*sys.argv[1:])
