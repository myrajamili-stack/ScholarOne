"""Allowed administrator profile edits. Roles, passwords and status are separate workflows."""
import re
from datetime import date
from decimal import Decimal, InvalidOperation
from urllib.parse import urlsplit

COMMON_FIELDS = {"full_name": 150, "email": 254, "phone_number": 25}
ROLE_FIELDS = {
    "student": ("student", "student_id", {"education_level": 100, "field_of_study": 100, "university": 150, "date_of_birth": 10, "gender": 30, "nationality": 100, "cgpa": 10}),
    "advisor": ("advisor", "advisor_id", {"specialization": 100, "qualification": 150, "experience_years": 10, "institution": 150, "professional_title": 100, "bio": 300}),
    "sponsor": ("sponsor", "sponsor_id", {"organization_name": 200, "organization_type": 100, "website": 500}),
    "admin": ("admin", "admin_id", {"department": 100}),
}
ORGANIZATION_TYPES = {"Government Agency", "Foundation", "Private Company", "NGO", "Educational Institution", "Corporate", "University", "Non-Profit Organization"}


def validate_user_update(data, role=None):
    if not isinstance(data, dict) or not data:
        return {}, "Send the user information to update as a JSON object."
    fields = dict(COMMON_FIELDS)
    if role is None:
        for _, _, details in ROLE_FIELDS.values():
            fields.update(details)
    elif role in ROLE_FIELDS:
        fields.update(ROLE_FIELDS[role][2])
    else:
        return {}, "This account role cannot be edited."
    if set(data) - fields.keys():
        return {}, "Only editable profile fields for this account role can be updated."
    clean = {}
    for key, value in data.items():
        if key in {'cgpa','experience_years'}:
            if value is None or value=='': clean[key]=None; continue
            upper=4 if key=='cgpa' else 60
            try:
                if isinstance(value,bool): raise ValueError
                number=Decimal(str(value))
                upper=4 if key=='cgpa' else 60
                if not number.is_finite() or not 0<=number<=upper or (key=='experience_years' and number!=number.to_integral_value()) or (key=='cgpa' and number.as_tuple().exponent < -2): raise ValueError
                clean[key]=float(number) if key=='cgpa' else int(number)
                continue
            except (InvalidOperation,ValueError,TypeError): return {},f'Enter a valid {key.replace("_"," ")} from 0 to {upper}.'
        if key=='date_of_birth' and value:
            try:
                if not isinstance(value,str) or date.fromisoformat(value)>date.today(): raise ValueError
            except (TypeError,ValueError): return {},'Choose a valid date of birth that is not in the future.'
        if value is None and key not in {"full_name", "email", "organization_name", "organization_type"}:
            clean[key] = None
            continue
        if not isinstance(value, str) or len(value.strip()) > fields[key]:
            return {}, f"Enter a valid {key.replace('_', ' ')} (up to {fields[key]} characters)."
        value = value.strip()
        if key in {"full_name", "email", "organization_name", "organization_type"} and not value:
            return {}, f"{key.replace('_', ' ').capitalize()} is required."
        if key == "full_name" and re.search(r"\d", value):
            return {}, "Full name must not contain numbers."
        if key == "email":
            value = value.lower()
            if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
                return {}, "Enter a valid email address."
        if key == "phone_number" and value:
            if not re.fullmatch(r"\+?[0-9 ()-]+", value):
                return {}, "Enter a valid phone number."
            value = re.sub(r"[ ()-]", "", value)
            if not re.fullmatch(r"\+?[0-9]{8,15}", value):
                return {}, "Phone number must contain 8–15 digits, with an optional leading +."
        if key == "organization_type" and value not in ORGANIZATION_TYPES:
            return {}, "Select a valid organisation type."
        if key == "website" and value:
            try:
                parsed = urlsplit(value)
                valid = parsed.scheme in {"http", "https"} and parsed.hostname and not parsed.username and not parsed.password and not any(c.isspace() for c in value)
                _ = parsed.port
            except ValueError:
                valid = False
            if not valid:
                return {}, "Enter a valid website starting with https:// or http://."
        clean[key] = value or None
    return clean, None
