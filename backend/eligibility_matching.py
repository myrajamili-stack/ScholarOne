"""Conservative eligibility checks: unknown requirements never become positive matches."""
from academic_results import check_academic_requirements
import math
import re
from scholarship_availability import intake_status


def number(value):
    if value is None or isinstance(value, bool) or value == '':
        return None
    try:
        value = float(value)
        return value if math.isfinite(value) and value >= 0 else None
    except (TypeError, ValueError):
        return None


def normalize(value):
    value = str(value or '').strip().lower().replace('’', "'")
    aliases = {"master": "master's", 'masters': "master's", 'bachelor': 'undergraduate',
               "bachelor's degree": 'undergraduate', 'penang': 'pulau pinang', 'malacca': 'melaka', 'nationwide': 'all states'}
    return aliases.get(value, value)


def check_eligibility(profile, scholarship, context=None, today=None, now=None):
    context = context or {}
    metadata = scholarship.get('import_metadata') or {}
    rules = metadata.get('eligibility_rules') or {}
    if not isinstance(rules, dict): rules = {}
    checks = []
    def add(criterion, status, reason):
        checks.append(dict(criterion=criterion, status=status, reason=reason))
    availability = intake_status(scholarship, now=now, today=today)
    if availability == 'closed':
        add('Application availability', 'mismatch', 'Applications are closed for this listing.')
    elif availability in ('dated', 'open'):
        add('Application availability', 'matched', 'The published application window is open; verify any provider-specific conditions.')
    else:
        add('Application availability', 'unknown', 'The application deadline or current intake is not confirmed.')

    criteria = scholarship.get('eligibility_criteria') or ''
    cgpa_lines = re.findall(r'(?im)^\s*[-•]?\s*Minimum CGPA:\s*(\d+(?:\.\d+)?)\s*$', criteria)
    if 'academic_requirements' in rules:
        academic_rule = rules['academic_requirements']
        check_academic_requirements(profile, academic_rule, add)
        if isinstance(academic_rule, dict) and 'minimum_cgpa' not in academic_rule and (number(rules.get('minimum_cgpa')) is not None or cgpa_lines):
            add('CGPA', 'unknown', 'The listing gives a CGPA minimum without linking it to a qualification. Confirm the requirement with the provider.')
    else:
        levels = metadata.get('study_levels') or ([scholarship['study_level']] if scholarship.get('study_level') else [])
        level = normalize(profile.get('education_level'))
        if not levels:
            add('Academic qualification', 'unknown', 'The listing does not specify an eligible study level.')
        elif not level:
            add('Academic qualification', 'unknown', 'Add your education level to your student profile.')
        elif 'all study levels' in map(normalize, levels) or level in map(normalize, levels):
            add('Academic qualification', 'matched', f"Your profile study level ({profile['education_level']}) matches the published study-level requirement. Entry grades and equivalencies still need verification.")
        else:
            add('Academic qualification', 'mismatch', f"Your profile study level ({profile['education_level']}) differs from the eligible levels: {', '.join(levels)}.")

        # Only a complete, explicit label is safe to interpret in legacy free text.
        threshold = number(rules.get('minimum_cgpa'))
        conflicting_cgpa = len(set(cgpa_lines)) > 1 or (threshold is not None and any(float(value) != threshold for value in cgpa_lines))
        if threshold is None and cgpa_lines and len(set(cgpa_lines)) == 1:
            threshold = number(cgpa_lines[0])
        cgpa = number(profile.get('cgpa'))
        if threshold is None or threshold > 4 or conflicting_cgpa:
            add('CGPA', 'unknown', 'No unambiguous minimum CGPA on the 0–4 scale is available. Check the full academic requirements.')
        elif cgpa is None or cgpa > 4:
            add('CGPA', 'unknown', 'Add a valid CGPA on the 0–4 scale to your student profile.')
        else:
            add('CGPA', 'matched' if cgpa >= threshold else 'mismatch', f'Your CGPA is {cgpa:.2f}; the published minimum is {threshold:.2f}.')

    states = metadata.get('eligible_states') or ([scholarship['eligible_state']] if scholarship.get('eligible_state') else [])
    state = context.get('residency_state')
    if not states:
        add('State', 'unknown', 'The listing does not specify state eligibility.')
    elif 'all states' in map(normalize, states):
        add('State', 'matched', 'The listing accepts all states. Other citizenship or residency conditions may still apply.')
    elif not state:
        add('State', 'unknown', 'Select your state to compare the published state restrictions.')
    else:
        add('State', 'matched' if normalize(state) in map(normalize, states) else 'mismatch',
            f"Your stated state is {state}; eligible states: {', '.join(states)}. Birthplace, domicile and residency evidence must be checked separately.")

    maximum = number(rules.get('maximum_income'))
    period = rules.get('income_period')
    income = number(context.get('household_income'))
    if maximum is None:
        add('Household income', 'unknown', 'No structured income limit is available. Review the provider’s published financial criteria.')
    elif period not in ('monthly', 'annual'):
        add('Household income', 'unknown', 'The income limit does not specify whether it is monthly or annual; it cannot be compared safely.')
    elif income is None or context.get('income_period') not in ('monthly', 'annual'):
        add('Household income', 'unknown', f'Enter your household income and its period to compare the {period} limit of RM{maximum:,.2f}.')
    else:
        comparable = income if context['income_period'] == period else income * 12 if period == 'annual' else income / 12
        add('Household income', 'matched' if comparable <= maximum else 'mismatch',
            f'Your stated {context["income_period"]} household income is RM{income:,.2f}; the published {period} limit is RM{maximum:,.2f}.')

    # Never infer religion, nationality, grades, disability, birthplace or course
    # eligibility from names, locations, category labels, or vague prose.
    remaining = []
    for line in criteria.splitlines():
        if not re.fullmatch(r'\s*[-•]?\s*(?:Eligible (?:study level|state):.+|Minimum CGPA:\s*\d+(?:\.\d+)?|Maximum household income \(MYR\):\s*\d+(?:\.\d+)?)\s*', line, re.I):
            if line.strip(): remaining.append(line.strip())
    add('Other eligibility criteria', 'unknown',
        'These published requirements need manual verification: ' + '\n'.join(remaining) if remaining
        else 'Additional academic, course, citizenship or documentary conditions are not fully specified. Check the official source.')
    failed = any(check['status'] == 'mismatch' for check in checks)
    unknown = any(check['status'] == 'unknown' for check in checks)
    return dict(status='mismatch' if failed else 'needs_verification' if unknown else 'matches_checked_rules',
                checks=checks, matched_count=sum(c['status'] == 'matched' for c in checks),
                mismatch_count=sum(c['status'] == 'mismatch' for c in checks),
                unknown_count=sum(c['status'] == 'unknown' for c in checks),
                has_additional_requirements=bool(remaining),
                disclaimer='This is a preliminary check, not an eligibility decision or award guarantee. Verify the complete requirements with the provider.')
