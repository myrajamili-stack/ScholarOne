"""Owner-scoped provider listing edits and deletion, with reapproval after edits."""
import json
import re
from decimal import Decimal
from flask import Blueprint, jsonify, request
from psycopg2.errors import ForeignKeyViolation
from db import get_db_connection
from security import sponsor_access_required
from responses import error_response
from listing_information import DETAIL_SECTIONS, validate_listing_submission
from account_deletion import has_linked_records
from scholarship_availability import closing_instant

sponsor_listings_bp = Blueprint('sponsor_listings', __name__, url_prefix='/api/sponsors')


def editable_listing(row):
    data = dict(row)
    metadata = data.pop('import_metadata', None) or {}
    deadline = data.get('deadline')
    if deadline:
        data['deadline'] = deadline.isoformat() if hasattr(deadline, 'isoformat') else str(deadline)
    description = data.get('description') or ''
    # Separate only explicit link lines; preserve all other original content.
    for key, heading in [('source_url', 'Official Source'), ('application_url', 'Application Portal')]:
        match = re.search(rf'(?im)^{heading}:[ \t]*(https?://\S+)[ \t]*\r?$', description)
        data[key] = metadata.get(key) or (match.group(1) if match else '')
        if match and match.group(1) == data[key]:
            description = description[:match.start()] + description[match.end():]
    data['description'] = description.strip()
    data['amount_note'] = metadata.get('amount_note') or ''
    data['deadline_note'] = metadata.get('deadline_note') or ''
    data['opening_date'] = metadata.get('opening_date')
    data['deadline_time'] = ''
    if metadata.get('deadline_at'):
        try:
            data['deadline_time'] = closing_instant(metadata['deadline_at']).strftime('%H:%M:%S')
        except (TypeError, ValueError, OverflowError):
            pass
    rules = metadata.get('eligibility_rules') or {}
    for field in ('minimum_cgpa', 'maximum_income', 'income_period'):
        data[field] = rules.get(field) if rules.get(field) is not None else ''
    data['deadline_status'] = 'closed' if metadata.get('declared_closed') else 'open' if metadata.get('declared_open') else 'dated' if deadline else 'unconfirmed'
    data['study_levels'] = metadata.get('study_levels') or ([data['study_level']] if data.get('study_level') else [])
    data['eligible_states'] = metadata.get('eligible_states') or ([data['eligible_state']] if data.get('eligible_state') else [])
    return data


@sponsor_listings_bp.route('/<int:sponsor_id>/scholarships/<int:scholarship_id>', methods=['GET', 'PUT', 'DELETE'])
@sponsor_access_required
def manage_listing(sponsor_id, scholarship_id):
    connection = None
    cursor = None
    committed = False
    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        cursor.execute('select * from scholarship where scholarship_id = %s and sponsor_id = %s for update', (scholarship_id, sponsor_id))
        original = cursor.fetchone()
        if not original:
            return error_response('Scholarship not found in your listings.', 404)
        if request.method == 'GET':
            return jsonify(scholarship=editable_listing(original))
        data = request.get_json(silent=True)
        if request.method == 'DELETE':
            if not isinstance(data, dict) or type(data.get('confirm_scholarship_id')) is not int or data['confirm_scholarship_id'] != scholarship_id:
                return error_response('Confirm the listing before deleting it.', 400)
            if has_linked_records(cursor, 'scholarship', scholarship_id):
                return error_response('This listing has linked records and cannot be deleted. Mark it Closed instead to preserve its history.', 409)
            cursor.execute('delete from scholarship where scholarship_id = %s and sponsor_id = %s', (scholarship_id, sponsor_id))
            action = 'delete_scholarship'
        else:
            previous_metadata = original.get('import_metadata') or {}
            current = editable_listing(original)
            old_deadline = original.get('deadline')
            if hasattr(old_deadline, 'isoformat'):
                old_deadline = old_deadline.isoformat()
            retained_cutoff = (previous_metadata.get('deadline_at')
                               if isinstance(data, dict) and 'deadline_time' not in data
                               and (data.get('deadline') or None) == old_deadline else None)
            if isinstance(data, dict) and 'opening_date' not in data and previous_metadata.get('opening_date'):
                data = {**data, 'opening_date': previous_metadata['opening_date']}
            try:
                validation_data = ({**data, 'amount': 0}
                                   if isinstance(data, dict) and data.get('amount') is None and 'amount' in data
                                   else data)
                amount, filters, metadata, description, deadline = validate_listing_submission(
                    validation_data, retained_deadline_at=retained_cutoff,
                    allow_missing_source=not current['source_url'])
            except ValueError as error:
                return error_response(str(error), 400)
            if data.get('amount') is None:
                amount = None
            elif original.get('amount') is not None and Decimal(str(data['amount'])) == Decimal(str(original['amount'])):
                amount = original['amount']
            previous_rules = previous_metadata.get('eligibility_rules') or {}
            metadata['eligibility_rules'] = {
                **previous_rules,
                **{key: value for key, value in metadata['eligibility_rules'].items()
                   if key in data and (key in previous_rules or value is not None)},
            }
            for plural, single in (('study_levels', 'study_level'), ('eligible_states', 'eligible_state')):
                selected = data.get(plural)
                if selected == current[plural] and filters[single] == (selected[0] if selected else None):
                    filters[single] = original.get(single)
                    if plural in previous_metadata:
                        metadata[plural] = previous_metadata[plural]
                    else:
                        metadata.pop(plural, None)
            for key in ('amount_note', 'deadline_note', 'application_url', 'source_url'):
                if key in previous_metadata and (key not in data or data[key] == current[key]):
                    metadata[key] = previous_metadata[key]
            if (deadline == old_deadline and current['deadline_time']
                    and data.get('deadline_time') == current['deadline_time']):
                metadata['deadline_at'] = previous_metadata['deadline_at']
            if (data['description'].strip() == current['description']
                    and all(key not in data or (data[key] or '').strip() == current[key] for key in ('source_url', 'application_url'))
                    and not any(data.get(key) for key, _ in DETAIL_SECTIONS)):
                description = original['description']
            # Preserve provenance, unknown metadata and externally managed application flow.
            metadata = {**previous_metadata, **metadata, 'external_listing': previous_metadata.get('external_listing', bool(previous_metadata))}
            if not data.get('deadline_time') and ('deadline_time' in data or deadline != old_deadline):
                metadata.pop('deadline_at', None)
            eligibility = data['eligibility_criteria'].strip()
            if eligibility == (original.get('eligibility_criteria') or '').strip():
                eligibility = original['eligibility_criteria']
            cursor.execute("""update scholarship set title=%s, description=%s, amount=%s, category=%s,
                eligibility_criteria=%s, deadline=%s, funding_type=%s, study_level=%s, eligible_state=%s,
                import_metadata=%s::jsonb, status='pending', rejection_reason=null
                where scholarship_id=%s and sponsor_id=%s""",
                (data['title'].strip(), description, amount, data['category'].strip(), eligibility,
                 deadline, data['funding_type'].strip(), filters['study_level'], filters['eligible_state'], json.dumps(metadata), scholarship_id, sponsor_id))
            cursor.execute("""insert into notification (user_id, message, notification_type, is_read)
                select user_id, %s, 'scholarship_review', false from app_user where role='admin' and status='active'""",
                (f'Updated scholarship {scholarship_id} requires review: {data["title"].strip()}',))
            action = 'update_scholarship'
        cursor.execute('insert into audit_log (user_id, action, description) values (%s, %s, %s)',
                       (sponsor_id, action, f'Scholarship {scholarship_id}'))
        connection.commit()
        committed = True
        return jsonify(message='Scholarship deleted.' if request.method == 'DELETE' else 'Changes saved and submitted for administrator review.', scholarship_id=scholarship_id)
    except ForeignKeyViolation:
        return error_response('This listing has linked records and cannot be deleted. Mark it Closed instead.', 409)
    except Exception:
        return error_response('Unable to manage this listing. No changes were saved.', 503)
    finally:
        if connection and not committed:
            connection.rollback()
        if cursor:
            cursor.close()
        if connection:
            connection.close()
