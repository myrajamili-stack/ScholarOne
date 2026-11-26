"""Academic progression validation and explainable, non-admissions recommendations."""
from urllib.parse import urlsplit
from advisor_quiz_results import matches_outcome, matches_interest


def validate_pathway(data):
    if not isinstance(data, dict):
        raise ValueError('Send a pathway object.')
    allowed = {'title', 'description', 'field', 'level', 'status', 'guidance'}
    if set(data) - allowed:
        raise ValueError('Only pathway information may be changed.')
    clean = {}
    for field, maximum in [('title', 200), ('description', 5000), ('field', 100), ('level', 100)]:
        value = data.get(field)
        if not isinstance(value, str) or not value.strip() or len(value) > maximum:
            raise ValueError(f'Enter {field} (up to {maximum} characters).')
        clean[field] = value.strip()
    if data.get('status') not in ('draft', 'active'):
        raise ValueError('Select Draft or Published.')
    clean['status'] = data['status']
    guidance = data.get('guidance')
    if not isinstance(guidance, dict) or set(guidance) - {'starting_qualifications', 'stages', 'career_goal', 'career_outcomes', 'next_steps', 'riasec_codes', 'keywords', 'sources', 'entry_requirements'}:
        raise ValueError('Enter valid progression information.')
    result = {}
    if 'career_goal' in guidance:
        goal = guidance['career_goal']
        if not isinstance(goal, str) or len(goal.strip()) > 500:
            raise ValueError('Enter a career goal using at most 500 characters.')
        result['career_goal'] = goal.strip()
    for key in ('starting_qualifications', 'career_outcomes', 'next_steps', 'riasec_codes', 'keywords'):
        values = guidance.get(key, [])
        if not isinstance(values, list) or len(values) > 30 or any(not isinstance(value, str) or not value.strip() or len(value) > 500 for value in values):
            raise ValueError(f'Enter valid {key.replace("_", " ")}.')
        result[key] = list(dict.fromkeys(value.strip() for value in values))
    if not result['starting_qualifications'] or not result['next_steps']:
        raise ValueError('Starting qualifications and next steps are required.')
    if set(result['riasec_codes']) - set('RIASEC'):
        raise ValueError('Interest codes must be R, I, A, S, E or C.')
    requirements = guidance.get('entry_requirements', '')
    if not isinstance(requirements, str) or not requirements.strip() or len(requirements) > 5000:
        raise ValueError('Describe the entry requirements and any conditions that need verification.')
    result['entry_requirements'] = requirements.strip()
    stages = guidance.get('stages')
    if not isinstance(stages, list) or not 2 <= len(stages) <= 12:
        raise ValueError('Provide 2–12 ordered progression stages.')
    result['stages'] = []
    for stage in stages:
        if not isinstance(stage, dict) or set(stage) != {'title', 'qualification', 'duration', 'description'}:
            raise ValueError('Each stage needs a title, qualification, duration and description.')
        if any(not isinstance(value, str) or not value.strip() or len(value) > 1500 for value in stage.values()):
            raise ValueError('Complete each stage. Use “Refer to provider” when duration is not published.')
        result['stages'].append({key: value.strip() for key, value in stage.items()})
    sources = guidance.get('sources')
    if not isinstance(sources, list) or not 1 <= len(sources) <= 10:
        raise ValueError('Provide at least one official source.')
    result['sources'] = []
    for source in sources:
        if not isinstance(source, dict) or set(source) != {'label', 'url'}:
            raise ValueError('Each source needs a label and URL.')
        if any(not isinstance(value, str) or not value.strip() or len(value) > 2000 for value in source.values()):
            raise ValueError('Enter valid source labels and URLs.')
        try:
            url = urlsplit(source['url'])
            valid = url.scheme in ('https', 'http') and url.hostname and not url.username and not url.password and not any(c.isspace() for c in source['url'])
            _ = url.port
        except ValueError:
            valid = False
        if not valid:
            raise ValueError('Source links must be valid HTTP(S) URLs.')
        result['sources'].append({key: value.strip() for key, value in source.items()})
    clean['guidance'] = result
    return clean


def qualification(value):
    key = str(value or '').strip().lower()
    return {'secondary school': 'spm', "bachelor's degree": 'undergraduate', 'bachelor': 'undergraduate',
            'bachelors': 'undergraduate', 'a_level': 'a-level', 'igcse_o_level': 'igcse/o-level',
            'master': "master's", 'masters': "master's"}.get(key, key)


def recommend_pathways(pathways, profile, assessment=None, advisor_outcomes=None, advisor_interests=None):
    level = qualification(profile.get('education_level'))
    saved = profile.get('academic_qualifications') or {}
    history = {qualification(name) for name, result in saved.items() if result} if isinstance(saved, dict) else set()
    field = str(profile.get('field_of_study') or '').strip().lower()
    interests = (assessment or {}).get('riasec') or []
    scores = {row.get('code'): row.get('score', 0) for row in interests if isinstance(row, dict) and row.get('code') in set('RIASEC')}
    # Do not invent leading interests when all six scores are tied.
    leaders = sorted(scores, key=lambda code: (-scores[code], code))[:3] if len(set(scores.values())) > 1 else []
    results = []
    for item in pathways:
        if item.get('status') != 'active': continue
        guidance = item.get('guidance') or {}
        entry = [qualification(value) for value in guidance.get('starting_qualifications', [])]
        if level and level not in entry: continue
        points = 0
        reasons = []
        if level:
            points += 4
            reasons.append(f"Your profile education level ({profile['education_level']}) is one of this route's starting points. Completion and entry requirements must still be verified.")
        elif history.intersection(entry):
            points += 4
            reasons.append('A qualification in your saved academic history matches a route starting point. Confirm completion and entry requirements with the institution.')
        else:
            reasons.append('Your education level is missing; this is a general exploration suggestion.')
        keywords = [item.get('field', ''), *guidance.get('keywords', [])]
        if field and any(word and (word.lower() in field or field in word.lower()) for word in keywords):
            points += 3
            reasons.append(f"This route relates to your profile field of study ({profile['field_of_study']}).")
        overlap = [code for code in leaders if code in guidance.get('riasec_codes', [])]
        if overlap:
            points += len(overlap)
            reasons.append(f"Your latest saved assessment includes {', '.join(overlap)} among your leading RIASEC interests; this route has related activities.")
        elif assessment:
            reasons.append('Your assessment did not add an interest preference for this route; interests do not determine admission or ability.')
        else:
            reasons.append('Complete and save the Career Assessment to include your interests in these suggestions.')
        related = [label for label in (advisor_outcomes or []) if matches_outcome(item, label)]
        if related:
            points += 2
            reasons.append(f"Your saved advisor quiz outcome ({', '.join(related)}) relates to this route. It is guidance rather than an entry qualification.")
        if any(matches_interest(item, term) for term in (advisor_interests or [])):
            points += 2
            reasons.append('This route relates to your saved advisor interest assessment. Confirm academic entry requirements separately.')
        results.append({**item, 'reasons': reasons, 'ranking_points': points})
    return sorted(results, key=lambda row: (-row['ranking_points'], row['title'].lower()))[:6]
