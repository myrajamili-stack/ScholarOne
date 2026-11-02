STUDY_LEVELS = {
    "All Study Levels", "Matriculation", "Foundation", "Diploma", "Undergraduate",
    "Master's", "PhD", "TVET", "Postgraduate", "Professional Certification",
    "Certificate", "Advanced Diploma", "Secondary School",
}
ELIGIBLE_STATES = {
    "All States", "Johor", "Melaka", "Negeri Sembilan", "Pahang", "Selangor",
    "Kuala Lumpur", "Terengganu", "Kelantan", "Perak", "Kedah", "Pulau Pinang",
    "Perlis", "Sabah", "Sarawak",
}


def validate_filter_metadata(data):
    result = {}
    for field, allowed in [("study_level", STUDY_LEVELS), ("eligible_state", ELIGIBLE_STATES)]:
        value = data.get(field)
        if value is not None and not isinstance(value, str):
            raise ValueError(f"Invalid {field}")
        value = value.strip() if value else None
        if value and value not in allowed:
            raise ValueError(f"Invalid {field}")
        result[field] = value or None
    return result
