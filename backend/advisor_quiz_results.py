"""Advisor quizzes map answer choices to outcomes; they are not graded exams."""
from collections import Counter
from pathway_preference import CATEGORIES, CODE as PREFERENCE_CODE, OPTION_COUNT, QUESTION_COUNT


def calculate_advisor_result(quiz, answers):
    questions = quiz.get('questions') or []
    if not questions or not isinstance(answers, dict):
        raise ValueError('Answer every question before submitting.')
    if set(answers) != {str(question['question_id']) for question in questions}:
        raise ValueError('Answer each current quiz question exactly once.')
    is_preference = quiz.get('assessment_code') == PREFERENCE_CODE
    if is_preference and (len(questions) != QUESTION_COUNT or any(
            len(question['options']) != OPTION_COUNT or any(
                option.get('pathway_result') not in CATEGORIES for option in question['options'])
            for question in questions)):
        raise ValueError('This pathway preference assessment is not ready to score.')
    counts = Counter()
    review = []
    for question in questions:
        selected = answers[str(question['question_id'])]
        if type(selected) is not int:
            raise ValueError('Select one valid answer for every question.')
        option = next((item for item in question['options'] if item['option_id'] == selected), None)
        if not option:
            raise ValueError('An answer does not belong to its question. Reload the quiz.')
        if is_preference:
            code = option['pathway_result']
            counts[code] += 1
            label = CATEGORIES[code]
        else:
            label = str(option.get('pathway_result') or option['option_text'])[:100].strip()
            counts[label] += 1
        review.append(dict(question_id=question['question_id'], question=question['question_text'],
                           selected_option_id=selected, answer=option['option_text'], outcome=label))
        if quiz.get('language') == 'both':
            review[-1].update(question_ms=question['question_text_ms'], answer_ms=option['option_text_ms'])
    if is_preference:
        outcomes = [dict(code=code, label=label, selections=counts[code]) for code, label in CATEGORIES.items()]
        leaders = [row['label'] for row in outcomes if row['selections'] == max(counts.values())]
        return dict(kind='advisor_quiz', assessment_code=PREFERENCE_CODE, quiz_id=quiz['quiz_id'], quiz_title=quiz['title'],
                    quiz_revision=quiz['revision'], question_count=len(questions), outcomes=outcomes, leading_outcomes=leaders,
                    has_tie=len(leaders) > 1, answers=review,
                    note='This result reflects your pathway preferences. It does not verify admission eligibility.')
    outcomes = [{'label': label, 'selections': count} for label, count in sorted(counts.items(), key=lambda pair: (-pair[1], pair[0].lower()))]
    highest = outcomes[0]['selections']
    return dict(kind='advisor_quiz', quiz_id=quiz['quiz_id'], quiz_title=quiz['title'], quiz_revision=quiz['revision'],
                question_count=len(questions), outcomes=outcomes, leading_outcomes=[row['label'] for row in outcomes if row['selections'] == highest],
                has_tie=sum(row['selections'] == highest for row in outcomes) > 1, answers=review,
                note='Outcomes reflect your selected answers, not a pass/fail grade or admission decision. Discuss them with your advisor.')


def matches_outcome(pathway, label):
    key = label.strip().casefold()
    guidance = pathway.get('guidance') or {}
    terms = [pathway.get('title', ''), pathway.get('field', ''), pathway.get('level', ''), *guidance.get('keywords', [])]
    return bool(key) and any(key == str(term).strip().casefold() for term in terms)


def matches_interest(pathway, term):
    if term.startswith('riasec:'):
        return term.removeprefix('riasec:') in (pathway.get('guidance') or {}).get('riasec_codes', [])
    return matches_outcome(pathway, term)
