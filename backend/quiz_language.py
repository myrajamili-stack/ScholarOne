"""Display localized labels while retaining existing question and option identities."""


def apply_quiz_language(quiz, definition):
    if not definition or definition.get("key") != "advisor-mcq-language":
        return
    quiz["language"] = definition["language"]
    if definition.get("assessment_code"):
        quiz["assessment_code"] = definition["assessment_code"]
    for question, translation in zip(quiz["questions"], definition["translations"]):
        question["question_text_ms"] = translation["question"]
        for option, label in zip(question["options"], translation["options"]):
            option["option_text_ms"] = label
