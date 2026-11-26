"""Source-linked route guidance, reviewed 2026-11-20; not guaranteed admission offers.

National routes describe qualification progression. Interest tags, career examples
and action steps are ScholarOne editorial guidance, not official admission rules.
"""
def route(title, field, level, starts, stages, source, codes=(), keywords=(), careers=()):
    return dict(title=title, description=f'Explore {title.lower()} with conditional progression and official sources.',
                field=field, level=level, status='active', guidance=dict(
                    starting_qualifications=starts, stages=[dict(title=t, qualification=q, duration=d, description=text) for t,q,d,text in stages],
                    career_outcomes=list(careers), riasec_codes=list(codes), keywords=list(keywords),
                    next_steps=['Confirm completion of your current qualification and check current subject, grade and language requirements.',
                                'Check programme recognition and any credit-transfer conditions with the receiving institution.',
                                'Compare programmes and funding, then discuss your shortlist with an academic advisor.'],
                    entry_requirements='Progression is conditional on recognised qualifications and current provider requirements. This route does not establish eligibility, guaranteed credit transfer or admission. Check the linked source for the current intake.',
                    sources=[dict(label='Official route / programme information', url=source)]))


def starter_pathways():
    variable = 'Refer to the current provider programme'
    return [
        route('SPM → Form Six / STPM → Bachelor’s Degree', 'General', 'Undergraduate', ['SPM', 'Secondary School'], [
            ('School-leaving qualification', 'SPM', 'Completed before entry', 'Check current Form Six entry conditions.'),
            ('Form Six', 'STPM', variable, 'Build the subject preparation needed for your intended degree.'),
            ('Degree programme', 'Undergraduate', variable, 'Apply to suitable degree programmes; admission depends on programme requirements.')],
            'https://www.malaysia.gov.my/en/topics/tingkatan-enam'),
        route('SPM → Foundation / Matriculation → Bachelor’s Degree', 'General', 'Undergraduate', ['SPM', 'Secondary School'], [
            ('School-leaving qualification', 'SPM', 'Completed before entry', 'Compare foundation and matriculation entry requirements.'),
            ('Pre-university preparation', 'Foundation / Matriculation', variable, 'Choose a stream accepted by your intended degree provider.'),
            ('Degree programme', 'Undergraduate', variable, 'Verify whether the qualification is accepted by the receiving institution.')],
            'https://www.malaysia.gov.my/en/personas/lepasan-menengah/laluan-pendidikan-akademik'),
        route('SPM → Diploma → Relevant Bachelor’s Degree', 'General', 'Undergraduate', ['SPM', 'Secondary School'], [
            ('School-leaving qualification', 'SPM', 'Completed before entry', 'Check diploma subject and grade requirements.'),
            ('Diploma programme', 'Diploma', variable, 'Develop knowledge and practical skills in a selected field.'),
            ('Related degree', 'Undergraduate', variable, 'Apply for a relevant degree. Credit transfer depends on the institution, programme and academic results.')],
            'https://www.malaysia.gov.my/en/topics/diploma-programmes'),
        route('SPM → TVET Certificate / Diploma → Further Study or Work', 'TVET', 'Diploma', ['SPM', 'Secondary School', 'Certificate'], [
            ('Entry qualification', 'SPM / recognised certificate', variable, 'Check the specific skills programme entry requirements.'),
            ('Skills development', 'TVET certificate / diploma', variable, 'Select an accredited practical programme and complete its required training.'),
            ('Next destination', 'Further study / employment', variable, 'Degree progression is available only where entry and recognition requirements are met; compare work and further-study options.')],
            'https://www.malaysia.gov.my/en/categories/school--education/tvet-program', ['R', 'I'], ['technical', 'vocational', 'engineering'], ['Explore technical roles related to the chosen qualification.']),
        route('UTM Software Engineering Degree Route', 'Computing', 'Undergraduate', ['STPM', 'Matriculation', 'Foundation', 'Diploma'], [
            ('Recognised entry qualification', 'STPM / Matriculation / Foundation / relevant Diploma', variable, 'General university and programme-specific entry conditions apply.'),
            ('Software engineering study', 'Undergraduate', '8 semesters in the 2026/2027 entry guide', 'Study the degree curriculum and complete required practical components.'),
            ('Further development', 'Graduate development', variable, 'Explore relevant employment or postgraduate study after completing the qualification.')],
            'https://admission.utm.my/wp-content/uploads/sites/461/2026/02/SYARAT-KHAS-SARJANA-MUDA-UTM-SESI-20262027.pdf',
            ['I', 'R', 'C'], ['computer science', 'software', 'information technology', 'computing'], ['Software development', 'Software testing', 'Further computing study']),
        route('UiTM Business Diploma → Business Administration Degree', 'Business', 'Undergraduate', ['Diploma'], [
            ('Relevant business diploma', 'Diploma', variable, 'Check whether your diploma is recognised for the intended degree route.'),
            ('Business administration', 'Undergraduate', variable, 'The BA111 faculty page describes progression to business administration; confirm current entry and credit-transfer conditions.'),
            ('Career or further study', 'Graduate development', variable, 'Explore business-related work or postgraduate study according to your interests.')],
            'https://fbm.uitm.edu.my/index.php/ba111-diploma-in-business-studies', ['E', 'C', 'S'], ['business', 'management', 'administration', 'finance'], ['Business operations', 'Administration', 'Further business study']),
        route('Bachelor’s Degree → Master’s → Doctoral Study', 'General', 'Postgraduate', ['Undergraduate', "Master's"], [
            ('Recognised degree', 'Undergraduate', 'Completed before entry', 'Select a postgraduate field and verify the receiving institution’s entry requirements.'),
            ('Master’s qualification', "Master's", variable, 'Compare coursework, mixed-mode and research options where offered.'),
            ('Doctoral qualification', 'PhD', variable, 'Discuss research suitability, supervision, funding and doctoral admission requirements.')],
            'https://www.mqa.gov.my/new/mqf.cfm'),
    ]
