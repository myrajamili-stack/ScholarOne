"""Validation and scoring for advisor-created Likert assessments."""
import re

SCALES = {
    "interest": list(zip(
        ("Strongly Dislike", "Dislike", "Neutral", "Like", "Strongly Like"),
        ("Sangat Tidak Suka", "Tidak Suka", "Neutral", "Suka", "Sangat Suka"),
    )),
    "agreement": list(zip(
        ("Strongly Disagree", "Disagree", "Neutral", "Agree", "Strongly Agree"),
        ("Sangat Tidak Setuju", "Tidak Setuju", "Neutral", "Setuju", "Sangat Setuju"),
    )),
}
CIA = dict(R="Realistic", I="Investigative", A="Artistic", S="Social", E="Enterprising")
FSI = dict(SH="Science & Health Sciences", ET="Engineering & Technology",
           BMF="Business, Management & Finance", SE="Social Sciences, Education & Psychology",
           AMC="Arts, Media & Creative Studies", LCH="Law, Communication & Humanities")
TEMPLATES = {
    "CIA-001": ("Career Interest Assessment", CIA, list("RSAIE") * 6),
    "FSI-001": ("Further Study Interest Assessment", FSI, [code for code in FSI for _ in range(5)]),
}
FSI_TERMS = {
    "SH": ["Science", "Health Sciences"], "ET": ["Engineering", "Technology", "Computing", "TVET"],
    "BMF": ["Business", "Management", "Finance"], "SE": ["Social Sciences", "Education", "Psychology"],
    "AMC": ["Arts", "Media", "Creative Studies"], "LCH": ["Law", "Communication", "Humanities"],
}


def scale_choices(scale):
    return [{"value": index, "en": labels[0], "ms": labels[1]}
            for index, labels in enumerate(SCALES[scale], 1)]


def builder_config():
    return {
        "scales": {key: scale_choices(key) for key in SCALES},
        "templates": [{
            "code": code, "title": title, "categories": [{"code": key, "label": label} for key, label in categories.items()],
            "question_categories": order,
        } for code, (title, categories, order) in TEMPLATES.items()],
    }


def validate_definition(value, published):
    errors = {}

    def clean_text(obj, key, limit, path, required=False):
        text = obj.get(key, "")
        if not isinstance(text, str) or len(text.strip()) > limit or (required and not text.strip()):
            errors[path] = f"Enter valid text (up to {limit} characters)."
            return ""
        return text.strip()

    if not isinstance(value, dict):
        return None, {"assessment": "Choose a Likert assessment configuration."}
    template = value.get("template", "")
    if not isinstance(template, str) or template not in ("", *TEMPLATES):
        return None, {"assessment.template": "Choose a supported template or Custom."}
    code = clean_text(value, "code", 40, "assessment.code").upper()
    group = clean_text(value, "target_group", 200, "assessment.target_group")
    language = value.get("language")
    scale = value.get("scale")
    if language not in ("en", "ms", "both"):
        errors["assessment.language"] = "Choose English, Malay or both."
    if not isinstance(scale, str) or scale not in SCALES:
        errors["assessment.scale"] = "Choose a supported 1–5 scale."
    if template and (code != template or language != "both"):
        errors["assessment.template"] = "The supplied template requires its original code and both languages."
    categories = value.get("categories")
    questions = value.get("questions")
    if not isinstance(categories, list) or len(categories) > 20:
        return None, {**errors, "assessment.categories": "Use at most 20 categories."}
    if not isinstance(questions, list) or len(questions) > 50:
        return None, {**errors, "assessment.questions": "Use at most 50 questions."}
    if published and (not categories or not questions):
        errors["assessment.questions"] = "Add categories and questions before publication."
    category_map = {}
    for index, item in enumerate(categories):
        path = f"assessment.categories.{index}"
        if not isinstance(item, dict):
            errors[path] = "Enter a category code and label."
            continue
        key = clean_text(item, "code", 12, path + ".code", True).upper()
        label = clean_text(item, "label", 100, path + ".label", True)
        if not re.fullmatch(r"[A-Z][A-Z0-9_-]{0,11}", key) or key in category_map:
            errors[path + ".code"] = "Use a unique category code starting with a letter."
        category_map[key] = label

    rows, used_ids, orders = [], set(), set()
    for index, item in enumerate(questions):
        path = f"assessment.questions.{index}"
        if not isinstance(item, dict):
            errors[path] = "Enter a valid question."
            continue
        if item.get("question_type", "likert") != "likert" or "options" in item or "scale" in item:
            errors[path] = "Use the shared Likert scale without per-question options."
        question_id = clean_text(item, "id", 40, path + ".id", True).upper()
        category = clean_text(item, "category", 12, path + ".category", True).upper()
        english = clean_text(item, "en", 2000, path + ".en", published and language in ("en", "both"))
        malay = clean_text(item, "ms", 2000, path + ".ms", published and language in ("ms", "both"))
        order, weight = item.get("order"), item.get("weight", 1)
        if not re.fullmatch(r"[A-Z0-9][A-Z0-9_-]{0,39}", question_id) or question_id in used_ids:
            errors[path + ".id"] = "Use a unique question ID with letters, numbers, underscores or hyphens."
        used_ids.add(question_id)
        if category not in category_map:
            errors[path + ".category"] = "Choose a defined category."
        if type(order) is not int or not 1 <= order <= 50 or order in orders:
            errors[path + ".order"] = "Use a unique question order from 1 to 50."
        else:
            orders.add(order)
        if type(weight) is not int or not 1 <= weight <= 10:
            errors[path + ".weight"] = "Use a whole-number weight from 1 to 10."
        rows.append(dict(id=question_id, category=category, en=english, ms=malay, order=order, weight=weight))
        if "display_number" in item:
            number = item["display_number"]
            if type(number) is not int or not 1 <= number < 1_000_000_000:
                errors[path] = "Reload the assessment to restore its question numbering."
            else:
                rows[-1]["display_number"] = number

    if template:
        _, expected_categories, expected_order = TEMPLATES[template]
        if category_map != expected_categories:
            errors["assessment.categories"] = "Use the template’s original categories and labels."
        if published and (orders != set(range(1, 31)) or len(rows) != 30):
            errors["assessment.questions"] = "Import all 30 original questions before publishing this template."
        for index, row in enumerate(rows):
            number = row["order"]
            if type(number) is int and (not 1 <= number <= 30 or row["category"] != expected_order[number - 1] or row["weight"] != 1):
                errors[f"assessment.questions.{index}"] = "Use the template's category mapping and a weight of 1."
    if published and set(category_map) - {row["category"] for row in rows}:
        errors["assessment.categories"] = "Assign at least one question to every category."
    next_number = value.get("next_question_number", 1)
    if type(next_number) is not int or not 1 <= next_number <= 1_000_000_000:
        errors["assessment.questions"] = "Reload the assessment to restore its question numbering."
    if errors:
        return None, errors
    return dict(key="advisor-likert", template=template, code=code, target_group=group, language=language,
                scale=scale, categories=[{"code": key, "label": label} for key, label in category_map.items()],
                next_question_number=next_number, questions=sorted(rows, key=lambda item: item["order"])), {}


def number_questions(definition, previous=None, floor=1):
    """Fill missing display numbers without changing stable submission IDs."""
    previous_numbers = {row["id"]: row["display_number"] for row in previous["questions"]} if previous else {}
    rows = [dict(row) for row in definition["questions"]]
    seen = set()
    for row in rows:
        requested = row.get("display_number")
        existing = previous_numbers.get(row["id"])
        number = existing if existing is not None else requested
        if existing is not None and requested not in (None, existing):
            raise ValueError("Existing question IDs cannot be renumbered.")
        if number is not None:
            if number in seen or (existing is None and number < floor):
                raise ValueError("Question IDs cannot be duplicated or reused.")
            seen.add(number)
            row["display_number"] = number
    next_number = max(definition.get("next_question_number", 1), floor, max(seen, default=0) + 1)
    for row in rows:
        if "display_number" not in row:
            row["display_number"] = next_number
            next_number += 1
    return {**definition, "questions": rows, "next_question_number": next_number}


def public_definition(definition):
    return {
        **{key: definition[key] for key in ("code", "target_group", "language")},
        "scale": scale_choices(definition["scale"]),
        "questions": [{key: row[key] for key in ("id", "en", "ms", "order")} for row in definition["questions"]],
    }


def calculate_likert_result(quiz, answers):
    definition = quiz["assessment"]
    questions = definition["questions"]
    if not isinstance(answers, dict) or set(answers) != {row["id"] for row in questions}:
        raise ValueError("Answer each assessment question exactly once.")
    totals = {row["code"]: dict(row, score=0, minimum=0, maximum=0) for row in definition["categories"]}
    review = []
    for row in questions:
        value = answers[row["id"]]
        if type(value) is not int or not 1 <= value <= 5:
            raise ValueError("Choose an answer from 1 to 5 for every question.")
        total = totals[row["category"]]
        score = value * row["weight"]
        total["score"] += score
        total["minimum"] += row["weight"]
        total["maximum"] += row["weight"] * 5
        en, ms = SCALES[definition["scale"]][value - 1]
        language = definition["language"]
        answer = en if language == "en" else ms if language == "ms" else f"{en} / {ms}"
        review.append(dict(question_id=row["id"], question=row["en"] or row["ms"], question_ms=row["ms"],
                           answer=f"{value} – {answer}", outcome=total["label"], score=score, weight=row["weight"]))
    scores = sorted(totals.values(), key=lambda row: (-row["score"], row["code"]))
    highest = scores[0]["score"]
    leaders = [row for row in scores if row["score"] == highest]
    template = definition["template"]
    selected = scores[:3] if template == "FSI-001" else leaders
    terms = []
    if len({row["score"] for row in scores}) > 1:
        if template == "CIA-001":
            terms = ["riasec:" + row["code"] for row in selected]
        elif template == "FSI-001":
            terms = [term for row in selected for term in FSI_TERMS[row["code"]]]
    return dict(kind="advisor_quiz", assessment_type="likert", assessment_code=definition["code"], template=template,
                quiz_id=quiz["quiz_id"], quiz_title=quiz["title"], quiz_revision=quiz["revision"],
                question_count=len(questions), category_scores=scores, outcomes=[], answers=review,
                leading_outcomes=[row["label"] for row in selected], has_tie=len(leaders) > 1,
                pathway_terms=terms, note="Interest scores are guidance. They do not confirm academic eligibility or admission. Ties are ordered by category code.")
