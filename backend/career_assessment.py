"""Validate and score against the versioned definition stored in PostgreSQL."""
RIASEC_LABELS = {
    "R": "Realistic", "I": "Investigative", "A": "Artistic",
    "S": "Social", "E": "Enterprising", "C": "Conventional",
}


def calculate_result(definition, answers, rankings):
    data = definition["data"]
    questions = [q for section in ("aptitude", "riasec", "ocean") for q in data[section]]
    if not isinstance(answers, dict) or set(answers) != {q["id"] for q in questions}:
        raise ValueError("Answer every assessment question before saving.")
    for section in ("aptitude", "riasec", "ocean"):
        for question in data[section]:
            answer = answers[question["id"]]
            valid = range(len(question["options"])) if section == "aptitude" else range(1, 6)
            if type(answer) is not int or answer not in valid:
                raise ValueError("One or more answers are invalid.")
    value_ids = {value["id"] for value in data["values"]}
    if not isinstance(rankings, list) or len(rankings) != 3 or any(type(value) is not str for value in rankings):
        raise ValueError("Rank three different work values.")
    if len(set(rankings)) != 3 or not set(rankings).issubset(value_ids):
        raise ValueError("Rank three different work values.")

    aptitude = []
    for domain in dict.fromkeys(q["domain"] for q in data["aptitude"]):
        grouped = [q for q in data["aptitude"] if q["domain"] == domain]
        score = sum(answers[q["id"]] == q["correct"] for q in grouped)
        aptitude.append({"label": domain, "score": score, "maximum": len(grouped), "percentage": score / len(grouped) * 100})
    riasec = []
    for code, label in RIASEC_LABELS.items():
        grouped = [q for q in data["riasec"] if q["group"] == code]
        score = sum(answers[q["id"]] for q in grouped)
        maximum = len(grouped) * 5
        riasec.append({"code": code, "label": label, "score": score, "maximum": maximum, "percentage": score / maximum * 100})
    ocean = []
    for trait in dict.fromkeys(q["group"] for q in data["ocean"]):
        grouped = [q for q in data["ocean"] if q["group"] == trait]
        score = sum(6 - answers[q["id"]] if q["reverse"] else answers[q["id"]] for q in grouped)
        maximum = len(grouped) * 5
        ocean.append({"label": trait, "score": score, "maximum": maximum, "percentage": score / maximum * 100})
    sorted_interests = sorted(riasec, key=lambda item: -item["score"])
    values = []
    for value in data["values"]:
        index = rankings.index(value["id"]) if value["id"] in rankings else None
        values.append({**value, "rank": index + 1 if index is not None else None, "score": 3 - index if index is not None else 0})
    return {
        "aptitude": aptitude, "riasec": riasec, "ocean": ocean,
        "hollandCode": "-".join(item["code"] for item in sorted_interests[:3]),
        "hasHollandTie": any(a["score"] == b["score"] for a, b in zip(sorted_interests, sorted_interests[1:])),
        "workValues": values,
    }


def answer_rows(definition, answers, rankings, attempt_id):
    rows = []
    for section in ("aptitude", "riasec", "ocean"):
        for question in definition["data"][section]:
            mapping = definition["database_ids"][question["id"]]
            index = answers[question["id"]] - (0 if section == "aptitude" else 1)
            rows.append((attempt_id, mapping["question_id"], mapping["option_ids"][index], None))
    mapping = definition["database_ids"]["work-values-ranking"]
    ids = [value["id"] for value in definition["data"]["values"]]
    for rank, value_id in enumerate(rankings, 1):
        rows.append((attempt_id, mapping["question_id"], mapping["option_ids"][ids.index(value_id)], rank))
    return rows
