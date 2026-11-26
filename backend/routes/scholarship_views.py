from contextlib import closing
from flask import Blueprint,g,jsonify
from db import get_db_connection
from security import student_access_required
from responses import error_response
from scholarship_availability import PUBLISHED_SCHOLARSHIP

scholarship_views_bp=Blueprint('scholarship_views',__name__,url_prefix='/api/scholarships')


@scholarship_views_bp.route('/<int:scholarship_id>/view',methods=['POST'])
@student_access_required
def record_view(scholarship_id):
    try:
        with closing(get_db_connection()) as connection,connection:
            with connection.cursor() as cursor:
                cursor.execute(f'''with published as (
                    select s.scholarship_id from scholarship s where s.scholarship_id=%s and {PUBLISHED_SCHOLARSHIP}
                    for share of s
                ), inserted as (
                    insert into scholarship_view(scholarship_id,student_id)
                    select scholarship_id,%s from published
                    on conflict do nothing returning scholarship_id
                )
                select exists(select 1 from published) as published, exists(select 1 from inserted) as recorded''',
                               (scholarship_id, g.student_id))
                result = cursor.fetchone()
                if not result['published']:
                    return error_response('Scholarship not found.', 404)
        return jsonify(recorded=result['recorded'])
    except Exception:
        return error_response('Unable to record this view.',503)
