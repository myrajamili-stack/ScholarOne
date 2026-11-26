from decimal import Decimal, InvalidOperation
import unicodedata


GRADES = {
    "spm": "A+ A A- B+ B C+ C D E G".split(),
    "igcse_letters": "A* A B C D E F G U".split(),
    "igcse_numeric": "9 8 7 6 5 4 3 2 1 U".split(),
    "o_level": "A* A B C D E U".split(),
    "stpm": "A A- B+ B B- C+ C C- D+ D F".split(),
    "a_level": "A* A B C D E U".split(),
}
SCALES = {
    "spm": ("spm",), "igcse_o_level": ("igcse_letters", "igcse_numeric", "o_level"),
    "stpm": ("stpm",), "a_level": ("a_level",),
}
CGPA_TYPES = {"stpm", "matriculation", "foundation", "diploma", "bachelors"}
QUALIFICATIONS = CGPA_TYPES | SCALES.keys()
MUET_BANDS = "1.0 2.0 2.5 3.0 3.5 4.0 4.5 5.0 5+".split()


def subject_key(value):
    return " ".join(unicodedata.normalize("NFKC", value).casefold().split())


def clean_text(value, limit=150):
    if not isinstance(value, str) or len(value) > limit or any(ord(char) < 32 for char in value):
        raise ValueError(f"Enter text of at most {limit} characters.")
    return " ".join(value.split())


def cgpa_value(value):
    if type(value) not in (str, int, float) or len(str(value)) > 16:
        raise ValueError("Enter a CGPA between 0.00 and 4.00.")
    try:
        number = Decimal(str(value))
    except InvalidOperation:
        raise ValueError("Enter a CGPA between 0.00 and 4.00.") from None
    if not number.is_finite() or not 0 <= number <= 4:
        raise ValueError("Enter a CGPA between 0.00 and 4.00.")
    return float(number)


def validate_qualifications(records):
    if not isinstance(records, dict) or records.keys() - QUALIFICATIONS:
        raise ValueError("Select a supported academic qualification.")
    clean = {}
    for qualification, record in records.items():
        allowed = set()
        if qualification in SCALES:
            allowed.update(("subjects", "grading_scale"))
        if qualification in CGPA_TYPES:
            allowed.add("cgpa")
        if qualification in CGPA_TYPES - {"stpm"} or qualification == "a_level":
            allowed.add("institution")
        if qualification in CGPA_TYPES - {"stpm"}:
            allowed.add("field_of_study")
        if qualification in {"diploma", "bachelors"}:
            allowed.add("programme_name")
        if qualification == "stpm":
            allowed.add("muet_band")
        if not isinstance(record, dict) or not record or record.keys() - allowed:
            raise ValueError("Use the result fields for the selected qualification.")
        validated = {key: clean_text(record[key]) for key in ("institution", "field_of_study", "programme_name") if key in record}
        if "cgpa" in record:
            validated["cgpa"] = None if record["cgpa"] in (None, "") else cgpa_value(record["cgpa"])
        if "muet_band" in record:
            if record["muet_band"] not in ("", *MUET_BANDS):
                raise ValueError("Select a valid MUET band.")
            validated["muet_band"] = record["muet_band"]
        if qualification in SCALES:
            supported = SCALES[qualification]
            scale = record.get("grading_scale", supported[0] if len(supported) == 1 else None)
            grades = record.get("subjects")
            if scale not in supported:
                raise ValueError("Choose the grading format used on your certificate.")
            if not isinstance(grades, list) or len(grades) > 30:
                raise ValueError("Enter up to 30 subject results per qualification.")
            subjects = []
            seen = set()
            for index, result in enumerate(grades, 1):
                if not isinstance(result, dict) or set(result) != {"subject", "grade"}:
                    raise ValueError(f"Enter a subject and grade for result {index}.")
                name = clean_text(result["subject"], 100)
                if not name or result["grade"] not in GRADES[scale]:
                    raise ValueError(f"Enter a valid subject and grade for result {index}.")
                key = subject_key(name)
                if key in seen:
                    raise ValueError(f"Enter {name} only once for this qualification.")
                seen.add(key)
                subjects.append({"subject": name, "grade": result["grade"]})
            validated.update(grading_scale=scale, subjects=subjects)
        clean[qualification] = validated
    return clean


def validate_academic_requirements(rule):
    allowed = {"qualification", "grading_scale", "subject_minimums", "minimum_as", "minimum_cgpa", "fields_of_study"}
    if not isinstance(rule, dict) or rule.keys() - allowed:
        raise ValueError("Enter a structured academic requirements object.")
    qualification = rule.get("qualification")
    if not isinstance(qualification, str) or qualification not in QUALIFICATIONS:
        raise ValueError("Select a supported academic qualification for these requirements.")
    clean = {"qualification": qualification}
    if "minimum_cgpa" in rule:
        if qualification not in CGPA_TYPES:
            raise ValueError("This qualification uses grades for scholarship matching.")
        clean["minimum_cgpa"] = cgpa_value(rule["minimum_cgpa"])
    if "minimum_as" in rule:
        count = rule["minimum_as"]
        if qualification != "spm" or type(count) is not int or not 1 <= count <= 30:
            raise ValueError("A minimum number of As must be a whole number from 1 to 30 for SPM.")
        clean["minimum_as"] = count
    if "fields_of_study" in rule:
        fields = rule["fields_of_study"]
        if qualification not in CGPA_TYPES - {"stpm"} or not isinstance(fields, list) or not 1 <= len(fields) <= 30:
            raise ValueError("Enter the accepted fields of study for this qualification.")
        clean["fields_of_study"] = [clean_text(field) for field in fields]
        if not all(clean["fields_of_study"]):
            raise ValueError("Enter each accepted field of study.")
    if "subject_minimums" in rule or "grading_scale" in rule:
        supported = SCALES.get(qualification, ())
        scale = rule.get("grading_scale", supported[0] if len(supported) == 1 else None)
        subjects = rule.get("subject_minimums")
        if scale not in supported or not isinstance(subjects, dict) or not 1 <= len(subjects) <= 30:
            raise ValueError("Provide a valid grade scale and at least one subject minimum.")
        minimums = {subject_key(clean_text(name, 100)): grade for name, grade in subjects.items()}
        if len(minimums) != len(subjects) or any(not name or grade not in GRADES[scale] for name, grade in minimums.items()):
            raise ValueError("Enter unique subjects and grades from the selected scale.")
        clean.update(grading_scale=scale, subject_minimums=minimums)
    return clean


def check_academic_requirements(profile, rule, add):
    try:
        rule = validate_academic_requirements(rule)
    except ValueError:
        add("Academic qualification", "unknown", "The published academic rules need manual verification.")
        return
    qualification = rule["qualification"]
    record = (profile.get("academic_qualifications") or {}).get(qualification)
    label = {"igcse_o_level": "IGCSE / O-Level", "a_level": "A-Level", "bachelors": "Bachelor’s Degree"}.get(
        qualification, qualification.upper() if qualification in {"spm", "stpm"} else qualification.capitalize()
    )
    if not record:
        add("Academic qualification", "unknown", f"Add your completed {label} results to compare this scholarship’s academic requirements.")
        return
    if record.get("cgpa") is None and not record.get("subjects"):
        add("Academic qualification", "unknown", f"Add the results for your recorded {label} qualification.")
    else:
        add("Academic qualification", "matched", f"This listing accepts your recorded {label} qualification.")
    if "minimum_cgpa" in rule:
        value = record.get("cgpa")
        minimum = rule["minimum_cgpa"]
        if value is None:
            add("CGPA", "unknown", f"Add your {label} CGPA to compare the published minimum of {minimum:.2f}.")
        else:
            add("CGPA", "matched" if value >= minimum else "mismatch",
                f"Your {label} CGPA is {value:.2f}; the published minimum is {minimum:.2f}.")
    if "fields_of_study" in rule:
        field = record.get("field_of_study")
        allowed = {subject_key(value) for value in rule["fields_of_study"]}
        status = "unknown" if not field else "matched" if subject_key(field) in allowed else "mismatch"
        add("Field of study", status, f"Accepted fields for {label}: {', '.join(rule['fields_of_study'])}.")
    subjects = {subject_key(result["subject"]): result["grade"] for result in record.get("subjects", [])}
    if "minimum_as" in rule:
        count = sum(grade in {"A+", "A", "A-"} for grade in subjects.values())
        minimum = rule["minimum_as"]
        add("SPM As", "matched" if count >= minimum else "unknown",
            f"Your saved SPM results contain {count} As (A+, A or A-); the published minimum is {minimum}. Verify any missing grades.")
    if "subject_minimums" in rule:
        scale = rule["grading_scale"]
        if record.get("grading_scale") != scale:
            add("Subject grades", "unknown", "The published grade scale differs from your results. Verify equivalency with the provider.")
            return
        grades = GRADES[scale]
        for subject, minimum in rule["subject_minimums"].items():
            grade = subjects.get(subject)
            status = "unknown" if grade not in grades else "matched" if grades.index(grade) <= grades.index(minimum) else "mismatch"
            add(f"Grade for {subject}", status, f"Published minimum: {minimum}. Your {label} grade: {grade or 'not recorded'}.")
