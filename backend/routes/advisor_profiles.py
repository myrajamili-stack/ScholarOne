"""Owner-scoped profile editing with atomic, validated updates."""
import re
import unicodedata
from contextlib import closing
from urllib.parse import urlsplit
from flask import Blueprint, jsonify, request, current_app
from psycopg2.errors import UniqueViolation
from db import get_db_connection
from security import advisor_access_required
from advisor_scheduling import read_schedule
from responses import error_response

profiles_bp = Blueprint('advisor_profiles', __name__, url_prefix='/api/advisors')
LIMITS = {'full_name': 100, 'email': 100, 'phone_number': 20, 'profile_picture': 255,
          'institution': 150, 'professional_title': 100, 'bio': 300, 'specialization': 100, 'qualification': 100}
REQUIRED = {'full_name', 'email', 'institution', 'professional_title', 'bio'}

def validate_profile(data):
    clean, errors = {}, {}
    if not isinstance(data, dict):
        return {}, {'form': 'Send a profile object.'}
    for key in data:
        if key not in LIMITS and key != 'experience_years':
            errors[key] = 'This field cannot be edited.'
    for key, limit in LIMITS.items():
        value = data.get(key, '')
        if value is None:
            value = ''
        if not isinstance(value, str):
            errors[key] = 'Enter text for this field.'
            continue
        value = value.strip()
        clean[key] = value
        if key in REQUIRED and len(value) < 2:
            errors[key] = 'This field is required (at least 2 characters).'
        elif len(value) > limit:
            errors[key] = f'Use at most {limit} characters.'
    name = clean.get('full_name', '')
    if name and (not any(c.isalpha() for c in name) or any(not (c.isalpha() or unicodedata.category(c).startswith("M") or c.isspace() or c in ".-'’") for c in name)):
        errors['full_name'] = 'Use letters, spaces, apostrophes, dots or hyphens for your name.'
    email = clean.get('email', '').lower()
    clean['email'] = email
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email):
        errors['email'] = 'Enter a valid email address.'
    phone = clean.get('phone_number', '')
    if phone:
        normalized = re.sub(r'[\s()\-]', '', phone)
        if not re.fullmatch(r'\+?[0-9]{7,15}', normalized) or not re.fullmatch(r'\+?[0-9\s()\-]+', phone):
            errors['phone_number'] = 'Enter 7–15 digits; only a leading +, spaces, hyphens and brackets are allowed.'
        else:
            clean['phone_number'] = normalized
            errors.pop('phone_number', None)
    picture = clean.get('profile_picture', '')
    if picture:
        try:
            url = urlsplit(picture)
            valid = url.scheme in ('http', 'https') and url.hostname and not url.username and not url.password and not any(c.isspace() for c in picture)
            _ = url.port
        except ValueError:
            valid = False
        if not valid:
            errors['profile_picture'] = 'Enter a valid http:// or https:// image URL.'
    years = data.get('experience_years')
    if years in (None, ''):
        clean['experience_years'] = None
    elif isinstance(years, bool) or not re.fullmatch(r'[0-9]{1,2}', str(years)) or not 0 <= int(years) <= 60:
        errors['experience_years'] = 'Enter a whole number from 0 to 60.'
    else:
        clean['experience_years'] = int(years)
    return clean, errors


def read_profile(cursor, advisor_id):
    cursor.execute('''SELECT u.user_id AS advisor_id, u.full_name, u.email, u.phone_number, u.profile_picture, u.status,
        coalesce(a.specialization, '') AS specialization, coalesce(a.qualification, '') AS qualification,
        a.experience_years, coalesce(a.institution, '') AS institution,
        coalesce(a.professional_title, '') AS professional_title, coalesce(a.bio, '') AS bio,
        coalesce((SELECT round(avg(rating),1) FROM review WHERE advisor_id=u.user_id), a.average_rating, 0) AS average_rating,
        (SELECT count(DISTINCT student_id) FROM appointment WHERE advisor_id=u.user_id) AS students_guided
        FROM app_user u LEFT JOIN advisor a ON a.advisor_id=u.user_id
        WHERE u.user_id=%s AND u.role='advisor' AND coalesce(u.status,'active')='active' ''', (advisor_id,))
    profile = cursor.fetchone()
    if profile:
        profile = dict(profile)
        schedule = read_schedule(cursor, advisor_id)
        profile['has_availability'] = schedule['published'] and any(day['enabled'] for day in schedule['availability'])
    return profile


@profiles_bp.route('/<int:advisor_id>/profile', methods=['GET', 'PUT'])
@advisor_access_required
def profile(advisor_id):
    try:
        with closing(get_db_connection()) as connection, connection:
            with connection.cursor() as cursor:
                current = read_profile(cursor, advisor_id)
                if not current:
                    return error_response('Advisor account not found.', 404)
                if request.method == 'GET':
                    return jsonify(current)
                data = request.get_json(silent=True)
                if not isinstance(data, dict):
                    return error_response('Send a valid profile object.', 400)
                clean, errors = validate_profile(data)
                if errors:
                    return jsonify(error='Please correct the highlighted fields.', fields=errors), 400
                cursor.execute('SELECT user_id FROM app_user WHERE lower(email)=lower(%s) AND user_id<>%s', (clean['email'], advisor_id))
                if cursor.fetchone():
                    return jsonify(error='This email is already registered.', fields={'email': 'This email is already registered.'}), 409
                cursor.execute('''UPDATE app_user SET full_name=%s,email=%s,phone_number=%s,profile_picture=%s WHERE user_id=%s''',
                    (clean['full_name'],clean['email'],clean['phone_number'],clean['profile_picture'],advisor_id))
                cursor.execute('''INSERT INTO advisor (advisor_id,specialization,qualification,experience_years,institution,professional_title,bio)
                    VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(advisor_id) DO UPDATE SET
                    specialization=excluded.specialization, qualification=excluded.qualification,experience_years=excluded.experience_years,
                    institution=excluded.institution,professional_title=excluded.professional_title,bio=excluded.bio''',
                    (advisor_id,clean['specialization'],clean['qualification'],clean['experience_years'],clean['institution'],clean['professional_title'],clean['bio']))
                return jsonify(read_profile(cursor, advisor_id))
    except UniqueViolation:
        return jsonify(error='This email is already registered.', fields={'email':'This email is already registered.'}), 409
    except Exception:
        current_app.logger.exception('Unable to load or save advisor profile')
        return error_response('Unable to load or save your profile. Please try again.', 503)


def photo_directory():
    from pathlib import Path
    return Path(current_app.config.get('PROFILE_PHOTO_DIR', Path(current_app.instance_path) / 'profile_photos'))


@profiles_bp.route('/<int:advisor_id>/profile/photo', methods=['POST'])
@advisor_access_required
def upload_photo(advisor_id):
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
                cursor.execute("SELECT user_id FROM app_user WHERE user_id=%s AND role='advisor' AND coalesce(status,'active')='active' FOR UPDATE", (advisor_id,))
                if not cursor.fetchone():
                    return error_response('Advisor account not found.', 404)
                filename = uuid4().hex + '.jpg'
                directory = photo_directory()
                directory.mkdir(parents=True, exist_ok=True)
                saved_path = directory / filename
                saved_path.write_bytes(photo)
                url = request.host_url.rstrip('/') + '/api/advisors/profile-photos/' + filename
                cursor.execute('UPDATE app_user SET profile_picture=%s WHERE user_id=%s', (url, advisor_id))
        return jsonify(profile_picture=url)
    except RequestEntityTooLarge:
        return error_response('Choose a photo smaller than 5 MB.', 413)
    except Exception:
        if saved_path:
            saved_path.unlink(missing_ok=True)
        current_app.logger.exception('Unable to save advisor photo')
        return error_response('Unable to save your photo. Please try again.', 503)


@profiles_bp.route('/profile-photos/<filename>', methods=['GET'])
def get_photo(filename):
    from flask import send_from_directory
    if not re.fullmatch(r'[a-f0-9]{32}\.jpg', filename):
        return error_response('Photo not found.', 404)
    response = send_from_directory(photo_directory(), filename, mimetype='image/jpeg', max_age=31536000)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    return response
