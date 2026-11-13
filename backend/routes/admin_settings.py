"""Administrator workspace configuration and own-account details."""
import json
import re

from flask import Blueprint, g, jsonify, request
from db import get_db_connection
from responses import error_response
from security import admin_access_required

admin_settings_bp = Blueprint('admin_settings', __name__, url_prefix='/api/admin')
DEFAULTS = {
    'platform_name': 'ScholarOne',
    'platform_tagline': 'Your Pathway. Your Future.',
    'support_email': '',
    'support_phone': '',
    'platform_description': 'A centralized platform for scholarship opportunities and academic pathway guidance.',
}


def ensure_settings(cursor):
    cursor.execute('''create table if not exists platform_configuration (
        configuration_key text primary key,
        configuration_value jsonb not null,
        updated_at timestamptz not null default now()
    )''')


def validate_phone(value):
    return not value or (bool(re.fullmatch(r'\+?[0-9 ()-]+', value)) and 7 <= len(re.sub(r'\D', '', value)) <= 15)


@admin_settings_bp.route('/settings', methods=['GET'])
@admin_access_required
def get_settings():
    connection = cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        ensure_settings(cursor)
        cursor.execute("select configuration_value from platform_configuration where configuration_key = 'general'")
        record = cursor.fetchone()
        general = {**DEFAULTS, **(record['configuration_value'] if record else {})}
        cursor.execute('select user_id, full_name, email, phone_number, role, status from app_user where user_id = %s and role = %s', (g.admin_id, 'admin'))
        account = cursor.fetchone()
        if not account:
            connection.rollback()
            return error_response('Administrator account not found.', 404)
        connection.commit()
        return jsonify({'general': general, 'account': account, 'notification_preferences_available': False})
    except Exception:
        if connection:
            connection.rollback()
        return error_response('Unable to load system settings. Please try again.', 500)
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


@admin_settings_bp.route('/settings', methods=['PATCH'])
@admin_access_required
def update_settings():
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or data.get('section') not in ('general', 'account'):
        return error_response('Choose a valid settings section.', 400)
    section = data['section']
    limits = {'platform_name': 60, 'platform_tagline': 120, 'support_email': 254,
              'support_phone': 40, 'platform_description': 500} if section == 'general' else {'full_name': 100, 'phone_number': 40}
    values = {}
    errors = {}
    for key, limit in limits.items():
        value = data.get(key, '')
        if not isinstance(value, str):
            errors[key] = 'Enter a text value.'
            continue
        value = value.strip()
        values[key] = value
        if len(value) > limit:
            errors[key] = f'Use no more than {limit} characters.'
    required = ('platform_name', 'platform_tagline', 'platform_description') if section == 'general' else ('full_name',)
    for key in required:
        if not values.get(key):
            errors[key] = 'This field is required.'
    phone = 'support_phone' if section == 'general' else 'phone_number'
    if not validate_phone(values.get(phone, '')):
        errors[phone] = 'Enter a valid phone number using 7–15 digits and an optional +, spaces, parentheses or hyphens.'
    email = values.get('support_email', '')
    if email and not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email):
        errors['support_email'] = 'Enter a valid email address.'
    if errors:
        return jsonify({'error': 'Please correct the highlighted fields.', 'errors': errors}), 400
    connection = cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        if section == 'general':
            ensure_settings(cursor)
            cursor.execute('''insert into platform_configuration (configuration_key, configuration_value)
                values ('general', %s::jsonb) on conflict (configuration_key) do update
                set configuration_value = excluded.configuration_value, updated_at = now()''', (json.dumps(values),))
            result = {'general': values}
        else:
            cursor.execute('''update app_user set full_name = %s, phone_number = %s
                where user_id = %s and role = 'admin'
                returning user_id, full_name, email, phone_number, role, status''', (values['full_name'], values['phone_number'] or None, g.admin_id))
            account = cursor.fetchone()
            if not account:
                connection.rollback()
                return error_response('Administrator account not found.', 404)
            result = {'account': account}
        connection.commit()
        return jsonify({'message': 'Settings saved successfully.', **result})
    except Exception:
        if connection:
            connection.rollback()
        return error_response('Unable to save settings. Your changes have not been saved.', 500)
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()
