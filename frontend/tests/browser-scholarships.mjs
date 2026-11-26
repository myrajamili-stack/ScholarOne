// Run Vite on port 5178 first. Uses installed Chrome/Edge and mocked API data only.
// No npm browser dependency, real credentials, or database writes are needed.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const browser = process.argv[2] || process.env.SCHOLARONE_TEST_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const origin = process.env.SCHOLARONE_TEST_ORIGIN || 'http://127.0.0.1:5178';
const appointmentMode = process.argv.includes('--appointments');
const recommendationMode = process.argv.includes('--recommendations');
const qualificationMode = process.argv.includes('--academic-qualifications');
const settingsMode = process.argv.includes('--student-settings');
const reminderDeliveryMode = process.argv.includes('--reminder-delivery');
const notificationBellsMode = process.argv.includes('--notification-bells');
const advisorAppointmentMode = process.argv.includes('--advisor-appointments');
const advisorRatingMode = process.argv.includes('--advisor-rating');
const adminManagementMode = process.argv.includes('--admin-management');
const providerStatsMode = process.argv.includes('--provider-stats');
const providerResubmitMode = process.argv.includes('--provider-resubmit');
const providerSettingsMode = process.argv.includes('--provider-settings');
const providerMode = process.argv.includes('--provider') || providerStatsMode || providerSettingsMode;
const pathwayMode = process.argv.includes('--pathways');
const pathwayAdminMode = process.argv.includes('--admin-pathways');
const advisorQuizMode = process.argv.includes('--advisor-quiz');
const likertMode = process.argv.includes('--likert');
const realDraftMode = process.argv.includes('--draft-repair-real');
const appaMode = process.argv.includes('--appa-real');
const useQuizFixture = realDraftMode || appaMode;
const draftApiOrigin = 'http://127.0.0.1:5501';
if (useQuizFixture) assert.ok(process.env.SCHOLARONE_FIXTURE_ADVISOR_TOKEN, 'An isolated advisor session is required');
if (appaMode) assert.ok(process.env.SCHOLARONE_FIXTURE_STUDENT_TOKEN, 'An isolated student session is required');
const quizSubmissionsMode = process.argv.includes('--quiz-submissions');
const pathwayRecords = pathwayMode || pathwayAdminMode ? JSON.parse(execFileSync('backend/.venv/Scripts/python.exe', ['-B', '-c', 'import sys,json;sys.path.insert(0,"backend");from pathway_seed import starter_pathways;print(json.dumps(starter_pathways()))'], { encoding: 'utf8' })).map((row, i) => ({ ...row, pathway_id: i + 1 })) : [];
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname), 'Use a local test server');
const artifacts = path.resolve('.tmp/browser-scholarships', `${path.basename(browser)}-${Date.now()}`);
await mkdir(artifacts, { recursive: true });
const profile = path.join(artifacts, 'profile');
const child = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-pipe', `--user-data-dir=${profile}`, 'about:blank'],
  { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
let launchError;
child.on('error', error => { launchError = error; });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(action, message, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (launchError) throw launchError;
    try { const value = await action(); if (value) return value; } catch { /* Retry while the browser is starting/rendering. */ }
    await sleep(80);
  }
  throw new Error(`Timed out: ${message}`);
}
const commandPipe = child.stdio[3];
commandPipe.on('error', error => { launchError = error; });
try {
  let sequence = 0;
  let sessionId;
  const pending = new Map();
  const errors = [];
  let dashboardHasData = true;
  const dashboardAppointment = new Date(Date.now() + 3_600_000).toISOString();
  const dashboardDeadline = new Date(Date.now() + 1_800_000).toISOString();
  const aidTypes = ['Scholarship', 'Education Loan', 'Financial Assistance', 'Special Assistance', 'One-off Assistance'];
  const fixtures = aidTypes.map((funding_type, index) => ({ scholarship_id: index + 1, title: `${funding_type} Example`,
    organization_name: 'Test Foundation', funding_type, study_levels: ['Diploma'], eligible_states: ['Johor'],
    deadline: '2099-12-31', intake_status: 'open', status: 'approved', amount: 1000,
    description: 'Original description', eligibility_criteria: 'Test eligibility', created_at: `2026-01-0${index + 1}` }));
  const adminPlans=[{plan_id:1,plan_name:'Free',price:0,scholarship_limit:3,duration_month:1,benefits:[],is_active:true}];
  let adminStudent={user_id:12,full_name:'Test Student',email:'test@example.invalid',phone_number:'+60123456789',role:'student',status:'active',created_at:'2026-01-01',cgpa:'3.00',date_of_birth:'2000-01-01',education_level:'Diploma'};
  let appointmentReview = null;
  const likertConfig = likertMode ? JSON.parse(execFileSync('backend/.venv/Scripts/python.exe', ['-B', '-c',
    'import json,sys;sys.path.insert(0,"backend");from likert_assessments import builder_config;print(json.dumps(builder_config()))'], { encoding: 'utf8' })) : null;
  let likertQuiz = null, likertAttempt = null;
  let likertTemplateRequests = 0;
  let dashboardRating = { average_rating: '4.8', total_reviews: 0 };
  let advisorRatingRequests = 0;
  let noticeRead = false;
  let failNotificationReads = false;
  let failReadUpdate = false;
  let notificationRequests = 0;
  let delayNotificationReads = false;
  let emptyNotificationInbox = false;
  const bellAccounts = {
    student: { id: 11, login: '/login', route: '/dashboard', action: '/calendar?section=reminders',
      notices: [['scholarship_deadline', 'Scholarship deadline', 'A saved scholarship closes tomorrow.'], ['appointment', 'Appointment update', 'Your consultation was confirmed.'], ['pathway_update', 'Pathway and assessment update', 'Your assessment results are ready.']] },
    advisor: { id: 12, login: '/staff-login', route: '/advisor/dashboard', action: '/advisor/messages',
      notices: [['appointment', 'Appointment update', 'A student requested a consultation.']] },
    sponsor: { id: 13, login: '/sponsor-login', route: '/sponsor/dashboard', action: '/sponsor/messages',
      notices: [['scholarship_review', 'Scholarship review', 'Your listing was approved.']] },
    admin: { id: 14, login: '/staff-login', route: '/admin/dashboard', action: '/admin/applications',
      notices: [['provider_verification', 'Provider verification', 'A registration is awaiting verification.']] },
  };
  const bellReadState = new Map();
  const bookingRows = [
    { appointment_id: 1, advisor_id: 11, advisor_name: 'Test Advisor', student_id: 12, student_name: 'Test Student', appointment_datetime: '2099-12-01T09:00:00+08:00', duration_minutes: 30, appointment_status: 'pending' },
    { appointment_id: 2, advisor_id: 11, advisor_name: 'Test Advisor', student_id: 12, student_name: 'Completed Student', appointment_datetime: '2020-01-01T09:00:00+08:00', duration_minutes: 30, appointment_status: 'completed' },
    { appointment_id: 3, advisor_id: 11, advisor_name: 'Test Advisor', student_id: 12, student_name: 'Rejected Student', appointment_datetime: '2099-12-02T09:00:00+08:00', duration_minutes: 30, appointment_status: 'rejected', rejection_reason: 'Please choose another date.' }
  ];
  let removed = false;
  let detailMode = 'fresh';
  let refreshFails = false;
  let delayFirst = false;
  let listRequests = 0;
  let writeRequests = 0;
  let failSaved = false;
  let failApplications = false;
  let failCatalogue = false;
  const studentSettings = { appointment_alerts: true, pathway_updates: true };
  let failSettings = true;
  let browserPassword = 'FixtureOldPassword';
  const recommendationContexts = [];
  let studentProfile = { user_id: 11, full_name: 'Test Student', email: 'student@example.invalid', role: 'student',
    status: 'active', education_level: 'Foundation', cgpa: '3.20', field_of_study: 'Computing',
    university: 'Current College', academic_qualifications: {} };
  let delaySaved = false;
  const savedIds = new Set([1]);
  const favouriteWrites = [];
  const browserQuiz = { quiz_id: 9, title: 'Advisor Study Quiz', description: 'Explore study preferences.', revision: 1, advisor_name: 'Test Advisor',
    status: 'published', question_count: 2, attempt_count: 1, average_score: 0, managed_assessment: false, language: 'both',
    questions: [10,20].map(question_id => ({ question_id, question_text: `Study preference ${question_id}`, question_text_ms: `Pilihan pengajian ${question_id}`, options: [
      { option_id: question_id * 10, option_text: 'Technical study', option_text_ms: 'Pengajian teknikal', pathway_result: 'Computing' },
      { option_id: question_id * 10 + 1, option_text: 'Business study', option_text_ms: 'Pengajian perniagaan', pathway_result: 'Business' }] })) };
  function browserAttempt(answers = { '10': 100, '20': 200 }) {
    const leading = answers['10'] === 100 ? 'Computing' : 'Business';
    return { attempt_id: 42, quiz_id: 9, submitted_at: '2026-11-20T12:00:00+08:00', student_name: 'Test Student', result: {
      kind: 'advisor_quiz', quiz_id: 9, quiz_title: browserQuiz.title, quiz_revision: 1, question_count: 2, leading_outcomes: [leading], has_tie: false,
      outcomes: [{ label: leading, selections: 2 }], note: 'Outcomes are not exam grades.', linked_pathways: [{ pathway_id: 1, title: 'UTM Software Engineering Degree Route' }],
      answers: browserQuiz.questions.map(q => ({ question_id: q.question_id, question: q.question_text, selected_option_id: answers[String(q.question_id)], answer: q.options.find(o => o.option_id === answers[String(q.question_id)]).option_text, outcome: leading })) } };
  }
  let quizAttempt = quizSubmissionsMode ? browserAttempt() : null;
  let providerListing = { ...fixtures[0], opening_date: '2099-10-01', category: 'General', source_url: 'https://example.com/programme',
    description: 'Original description\n\nRepayment Conditions:\nRepay after graduation.',
    deadline_status: 'dated', eligibility_criteria: 'Minimum CGPA: 3.20 unless specified otherwise.', amount_note: 'RM1000 per year.' };
  let settingsPlan = "Free";
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    if (launchError) { reject(launchError); return; }
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer });
    commandPipe.write(JSON.stringify({ id, method, params, sessionId: method.startsWith('Target.') ? undefined : sessionId }) + '\0');
  });
  async function handleMessage(message) {
    if (message.id) {
      const item = pending.get(message.id);
      if (!item) return;
      clearTimeout(item.timer); pending.delete(message.id);
      if (message.error) item.reject(new Error(message.error.message)); else item.resolve(message.result);
      return;
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    if (message.method === 'Page.javascriptDialogOpening') { await call('Page.handleJavaScriptDialog', { accept: true }); return; }
    if (message.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = message.params;
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) { await call('Fetch.continueRequest', { requestId }); return; }
    if (useQuizFixture && (url.pathname === '/api/quizzes' || url.pathname.startsWith('/api/quizzes/'))) {
      assert.equal(url.origin, draftApiOrigin, 'Quiz requests must use the disposable Flask server');
      await call('Fetch.continueRequest', { requestId });
      return;
    }
    // Intercept every API request, including CORS preflights. Never contact Flask.
    let data = [], status = 200;
    if (notificationBellsMode && request.method === 'OPTIONS') data = {};
    else if (notificationBellsMode && url.pathname === '/api/auth/login' && request.method === 'POST') {
      const { email, password } = JSON.parse(request.postData);
      const role = email.split('@')[0];
      assert.equal(password, 'BrowserFixturePassword');
      data = { user: { user_id: bellAccounts[role].id, full_name: `Test ${role}`, email, role, status: 'active' },
        access_token: `notification-fixture-${role}` };
    } else if (notificationBellsMode && (url.pathname === '/api/notifications' || url.pathname.startsWith('/api/notifications/'))) {
      const role = Object.keys(bellAccounts).find(key => Object.entries(request.headers)
        .some(([name, value]) => name.toLowerCase() === 'authorization' && value === `Bearer notification-fixture-${key}`));
      if (!role) { status = 401; data = { error: 'Authentication required.' }; }
      else {
        const { id, notices } = bellAccounts[role];
        const records = notices.map(([notification_type, , message], index) => ({
          notification_id: id * 10 + index, notification_type, message,
          is_read: bellReadState.get(id * 10 + index) ?? index > 0, created_at: '2099-12-30T23:05:00+00:00',
        }));
        if (url.pathname === '/api/notifications') {
          if (delayNotificationReads) await sleep(1000);
          status = failNotificationReads ? 503 : 200;
          data = failNotificationReads ? { error: 'Notifications temporarily unavailable.' } : emptyNotificationInbox
            ? { unread: 0, notifications: [] }
            : { unread: records.filter(notice => !notice.is_read).length, notifications: records };
        } else {
          const noticeId = Number(url.pathname.split('/').at(-1));
          assert.equal(request.method, 'PATCH');
          assert.ok(records.some(notice => notice.notification_id === noticeId));
          bellReadState.set(noticeId, JSON.parse(request.postData).is_read);
          data = { message: 'Notification updated.' };
        }
      }
    } else if (notificationBellsMode && url.pathname === '/api/advisors/12/profile') {
      data = { full_name: 'Test advisor', email: 'advisor@example.invalid', average_rating: 0, students_guided: 0 };
    } else if (notificationBellsMode && url.pathname === '/api/messages/conversations') {
      data = { conversations: [], unread_count: 2 };
    } else if (notificationBellsMode && url.pathname === '/api/sponsors/13/dashboard') {
      data = { sponsor: { organization_name: 'Test organization' }, summary: {}, subscription: { plan_name: 'Free' },
        scholarships: [], application_trend: [], notifications: [] };
    } else if (notificationBellsMode && url.pathname === '/api/admin/dashboard') {
      data = { summary: { users: {}, scholarships: {}, applications: {} }, recent_users: [], recent_scholarships: [] };
    } else if (settingsMode && url.pathname === '/api/students/settings/notifications') {
      if (failSettings) {
        status = 503;
        data = { error: 'Notification preferences are unavailable until the database is updated.' };
      } else {
        if (request.method === 'PATCH') Object.assign(studentSettings, JSON.parse(request.postData));
        data = { preferences: studentSettings };
      }
    } else if (settingsMode && url.pathname === '/api/auth/student/password') {
      const passwords = JSON.parse(request.postData);
      if (passwords.current_password !== browserPassword) {
        status = 400;
        data = { error: 'Current password is incorrect.' };
      } else {
        assert.equal(passwords.new_password, passwords.confirm_password);
        browserPassword = passwords.new_password;
        data = { message: 'Password changed successfully.' };
      }
    } else if (settingsMode && url.pathname === '/api/auth/login') {
      assert.equal(JSON.parse(request.postData).password, browserPassword);
      data = { user: studentProfile, access_token: 'mock-browser-token' };
    } else if (adminManagementMode && !url.pathname.startsWith('/api/notifications')) {
      if(request.method==='OPTIONS') data={};
      else if(url.pathname==='/api/admin/users/12' && request.method==='PATCH') {writeRequests++; adminStudent={...adminStudent,...JSON.parse(request.postData)};data={user:adminStudent};}
      else if(url.pathname==='/api/admin/users') data={summary:{total_users:1,students:1,sponsors:0,advisors:0,admins:0,active_users:1,restricted_users:0},users:[adminStudent]};
      else if(url.pathname==='/api/admin/dashboard') data={summary:{users:{},scholarships:{},applications:{},appointments:7,subscriptions:0,academic_pathways:0,quizzes:0,reports:0},recent_users:[],recent_scholarships:[]};
      else if(url.pathname==='/api/admin/subscription-plans' && request.method==='POST') {writeRequests++; const plan={...JSON.parse(request.postData),plan_id:9,is_active:true};adminPlans.push(plan);data={plan};status=201;}
      else if(url.pathname==='/api/admin/subscription-plans/9/availability') {writeRequests++;Object.assign(adminPlans[1],JSON.parse(request.postData));data={plan:adminPlans[1]};}
      else if(url.pathname==='/api/admin/subscription-plans/9' && request.method==='PATCH') {writeRequests++;Object.assign(adminPlans[1],JSON.parse(request.postData));data={plan:adminPlans[1]};}
      else if(url.pathname==='/api/admin/subscriptions') data={subscriptions:[],providers:[],plans:adminPlans,monthly_revenue:49,payments_enabled:false,payments:[]};
      else if(url.pathname==='/api/admin/reports') data={roles:[],categories:[],statuses:[],trend:[],scholarships:[],active_subscriptions:3,generated_at:'2026-11-20T00:00:00Z',start:null,end:null,payments:{revenue_by_currency:[{currency:'myr',amount:'49.00',invoice_count:1}],payment_statuses:[{label:'paid',count:1}],payment_trend:[{month:'2026-11',currency:'myr',amount:'49.00'}],legacy_paid_records:13,marked_active_legacy_records:3}};
    }
    else if (providerResubmitMode && url.pathname === '/api/auth/login' && request.method==='POST') {
      status = 403;
      data = {error:'Your provider registration was rejected.',code:'provider_registration_rejected',reason:'Correct the organization details.',can_resubmit:true};
    }
    else if (providerResubmitMode && url.pathname === '/api/auth/provider-resubmission' && request.method==='POST') { writeRequests++; assert.equal(JSON.parse(request.postData).role,'sponsor'); data={message:'Registration resubmitted.',user:{status:'pending'}}; }
    else if (qualificationMode && url.pathname === '/api/students/11/profile') {
      if (request.method === 'PUT') {
        writeRequests++;
        const changes = JSON.parse(request.postData);
        studentProfile = { ...studentProfile, ...changes,
          academic_qualifications: { ...studentProfile.academic_qualifications, ...changes.academic_qualifications } };
      }
      data = studentProfile;
    }
    else if (reminderDeliveryMode && url.pathname === '/api/calendar/deadlines') {
      data = [{ scholarship_id: 1, title: 'Updated Scholarship Deadline', deadline: '2099-12-31',
        deadline_at: '2099-12-31T11:30:00+08:00' }];
    }
    else if (url.pathname === '/api/notifications') { notificationRequests++; status = failNotificationReads ? 503 : 200; data = failNotificationReads ? { error: 'Notifications temporarily unavailable.' } : { unread: noticeRead ? 0 : 1, notifications: [{ notification_id: 4, message: reminderDeliveryMode ? 'Deadline reminder: Updated Scholarship Deadline closes on 2099-12-31 at 11:30:00 Malaysia time.' : 'Appointment booking requested.', is_read: noticeRead, created_at: '2099-12-30T23:05:00+00:00' }] }; }
    else if (url.pathname === '/api/notifications/4' && request.method === 'PATCH') { if (failReadUpdate) { status=503; data={error:'Try again'}; } else { noticeRead = JSON.parse(request.postData).is_read; data = { message: 'Notification updated.' }; } }
    else if ((advisorRatingMode && url.pathname === '/api/advisors/11/dashboard') || (notificationBellsMode && url.pathname === '/api/advisors/12/dashboard')) {
      if (request.method === 'GET') advisorRatingRequests++;
      data = {
        advisor: { full_name: 'Test Advisor' },
        summary: { today_appointments: 0, pending_requests: 0, total_students: 0, unread_messages: 0, average_rating: dashboardRating.average_rating },
        selected_date: url.searchParams.get('date'), calendar_month: url.searchParams.get('month'),
        schedule: [], calendar_days: [], recent_booking_requests: [], student_insights: [], insight_total: 0,
        quiz_overview: { total_quizzes: 0, total_attempts: 0, average_score: 0 },
        feedback: { total_reviews: dashboardRating.total_reviews },
      };
    }
    else if (appointmentMode || advisorAppointmentMode) {
      if (request.method === 'OPTIONS') data = {};
      else if (url.pathname === '/api/advisors/11/appointments/1/status' && request.method === 'PATCH') {
        writeRequests++; const value = JSON.parse(request.postData); Object.assign(bookingRows[0], { appointment_status: value.status, rejection_reason: value.rejection_reason }); data = { message: 'Appointment status updated.' };
      } else if (url.pathname === '/api/appointments/1/cancel' && request.method === 'POST') { writeRequests++; bookingRows[0].appointment_status = 'cancelled'; data = { message: 'Appointment cancelled.' }; }
      else if (url.pathname === '/api/appointments/2/review') {
        if (request.method === 'POST') { writeRequests++; appointmentReview = { review_id: 9, ...JSON.parse(request.postData) }; status = 201; }
        data = { review: appointmentReview };
      } else if (url.pathname === '/api/advisors/11/appointments') data = { appointments: bookingRows, summary: { pending: 1, confirmed: 0, completed: 1, total: 3 } };
      else if (url.pathname === '/api/advisors/my-appointments') data = bookingRows;
      else if (url.pathname === '/api/advisors') data = [];
    }
    else if (likertMode) {
      if (request.method === 'OPTIONS') data = {};
      else if (url.pathname === '/api/quizzes/advisor/11/assessment-templates') {
        if (++likertTemplateRequests === 1) {
          status = 503; data = { error: 'Assessment templates are temporarily unavailable.' };
        } else data = likertConfig;
      }
      else if (url.pathname === '/api/quizzes/advisor/11/pathways') data = { pathways: [] };
      else if (url.pathname === '/api/quizzes/advisor/11' && request.method === 'GET') data = {
        quizzes: likertQuiz ? [likertQuiz] : [], summary: { total_quizzes: Number(!!likertQuiz), published_count: Number(likertQuiz?.status === 'published'), total_attempts: 0, students_completed: 0, average_score: 0 },
      };
      else if (url.pathname === '/api/quizzes/advisor/11/9' && request.method === 'GET') data = { quiz: likertQuiz };
      else if (url.pathname.startsWith('/api/quizzes/advisor/11') && ['POST', 'PUT'].includes(request.method)) {
        const payload = JSON.parse(request.postData);
        assert.equal(payload.assessment_type, 'likert'); assert.equal(payload.assessment.questions.length, 30);
        if (request.method === 'POST') assert.equal(payload.status, 'draft');
        writeRequests++;
        likertQuiz = { ...payload, quiz_id: 9, revision: (likertQuiz?.revision || 0) + 1, advisor_id: 11, advisor_name: 'Test Advisor',
          question_count: 30, attempt_count: 0, managed_assessment: false, questions: [] };
        data = { quiz: likertQuiz }; status = request.method === 'POST' ? 201 : 200;
      } else if (url.pathname === '/api/quizzes') data = likertQuiz?.status === 'published' ? [likertQuiz] : [];
      else if (url.pathname === '/api/quizzes/career-assessment/attempts/latest') data = { attempt: null };
      else if (url.pathname === '/api/quizzes/9/take') data = { quiz: { ...likertQuiz, assessment: {
        ...likertQuiz.assessment, scale: likertConfig.scales[likertQuiz.assessment.scale],
      } } };
      else if (url.pathname === '/api/quizzes/attempts') data = { attempts: likertAttempt ? [likertAttempt] : [] };
      else if (url.pathname === '/api/quizzes/9/attempts/latest') data = { attempt: likertAttempt };
      else if (url.pathname === '/api/quizzes/9/attempts' && request.method === 'POST') {
        const { answers, revision } = JSON.parse(request.postData);
        assert.equal(revision, 2); assert.equal(Object.keys(answers).length, 30);
        assert.ok(Object.values(answers).every(value => value === 5));
        writeRequests++;
        likertAttempt = { attempt_id: 99, quiz_id: 9, submitted_at: '2026-11-25T10:00:00+08:00', result: {
          kind: 'advisor_quiz', assessment_type: 'likert', template: 'FSI-001', quiz_title: likertQuiz.title, quiz_revision: 2,
          question_count: 30, leading_outcomes: ['Arts, Media & Creative Studies', 'Business, Management & Finance', 'Engineering & Technology'],
          category_scores: [{ code: 'AMC', label: 'Arts, Media & Creative Studies', score: 25, minimum: 5, maximum: 25 }],
          note: 'Interest scores are guidance.', outcomes: [], answers: [],
        } };
        status = 201; data = { attempt: likertAttempt };
      }
    }
    else if (advisorQuizMode || quizSubmissionsMode) {
      if (request.method === 'OPTIONS') data = {};
      else if (url.pathname === '/api/quizzes/9/attempts' && request.method === 'POST') {
        writeRequests++; quizAttempt = browserAttempt(JSON.parse(request.postData).answers); data = { attempt: quizAttempt }; status = 201;
      } else if (url.pathname === '/api/quizzes/9/take') data = { quiz: browserQuiz };
      else if (url.pathname === '/api/quizzes/9/attempts/latest') data = { attempt: quizAttempt };
      else if (url.pathname === '/api/quizzes/attempts') data = { attempts: quizAttempt ? [quizAttempt] : [] };
      else if (url.pathname === '/api/quizzes/career-assessment/attempts/latest') data = { attempt: null };
      else if (url.pathname === '/api/quizzes') data = [browserQuiz];
      else if (url.pathname === '/api/quizzes/advisor/11') data = { quizzes: [browserQuiz], summary: { total_quizzes: 1, published_count: 1, total_attempts: 1, students_completed: 1, average_score: 0 } };
      else if (url.pathname === '/api/quizzes/advisor/11/9/attempts') data = { attempts: [quizAttempt] };
      else if (url.pathname === '/api/quizzes/advisor/11/pathways') data = { pathways: [] };
      else if (url.pathname.endsWith('/profile')) data = { user_id:11, full_name:'Test Student', role:'student', education_level:'Diploma' };
    }
    else if (pathwayMode || pathwayAdminMode) {
      const adminId = url.pathname.match(/^\/api\/admin\/pathways\/(\d+)$/)?.[1];
      const studentId = url.pathname.match(/^\/api\/pathways\/(\d+)$/)?.[1];
      if (request.method === 'OPTIONS') data = {};
      else if (url.pathname === '/api/admin/pathways' && request.method === 'POST') {
        writeRequests++;
        const row = { ...JSON.parse(request.postData), pathway_id: 88 };
        pathwayRecords.push(row); data = { message: 'Pathway saved.', pathway: row }; status = 201;
      } else if (adminId && request.method === 'PUT') {
        writeRequests++;
        const index = pathwayRecords.findIndex(row => row.pathway_id === Number(adminId));
        pathwayRecords[index] = { ...JSON.parse(request.postData), pathway_id: Number(adminId) };
        data = { message: 'Pathway saved.', pathway: pathwayRecords[index] };
      } else if (adminId && request.method === 'DELETE') {
        writeRequests++;
        pathwayRecords.splice(pathwayRecords.findIndex(row => row.pathway_id === Number(adminId)), 1);
        data = { message: 'Pathway deleted.' };
      } else if (url.pathname === '/api/admin/pathways') data = { pathways: pathwayRecords, quizzes: [] };
      else if (adminId || studentId) data = { pathway: pathwayRecords.find(row => row.pathway_id === Number(adminId || studentId)) };
      else if (url.pathname === '/api/pathways') data = { pathways: pathwayRecords };
      else if (url.pathname === '/api/pathways/recommendations') data = { pathways: pathwayRecords.filter(row => row.field === 'Computing').map(row => ({ ...row, reasons: ['Your Diploma profile and saved Investigative interests relate to this route.'] })), has_assessment: true, has_education_level: true, note: 'Check current entry requirements with the provider.' };
      else if (url.pathname === '/api/quizzes') data = [];
      else if (url.pathname === '/api/quizzes/attempts') data = { attempts: [] };
      else if (url.pathname === '/api/quizzes/career-assessment/attempts/latest') data = { attempt: null };
    }
    else if (providerMode) {
      if (request.method === 'OPTIONS') data = {};
      else if (providerSettingsMode && url.pathname === '/api/sponsors/11/settings') data = {
        sponsor: {sponsor_id:11, full_name:'Test Provider', organization_name:'Fixture Foundation',
          email:'provider@example.invalid', status:'active', subscription_status:'professional'},
        subscription_plan_name: settingsPlan,
      };
      else if (url.pathname === '/api/sponsors/11/statistics') {
        const lifecycle = url.searchParams.get('lifecycle');
        const expired = lifecycle === 'expired';
        await sleep(450);
        if (lifecycle === 'closed') {
          status = 503;
          data = { message: 'Statistics unavailable.' };
        } else {
          const title = 'Viewed Award for Interdisciplinary Research and Community Development';
          const outcomes = { total_applications: 8, awarded_students: 2 };
          const field = 'Environmental Engineering';
          data = {
            sponsor: { organization_name: 'Test Foundation' },
            listing_totals: { total: 1, active: 1, expired: 0 },
            matched_listings: expired ? 0 : 1,
            summary: expired
              ? { total_views: 0, unique_viewers: 0, total_applications: 0, awarded_students: 0, success_rate: 0 }
              : { total_views: 7, unique_viewers: 4, ...outcomes, success_rate: 25, top_field: field },
            view_breakdown: expired ? [] : [{ scholarship_id: 1, title, total_views: 7 }],
            scholarship_breakdown: expired ? [] : [{ scholarship_id: 1, title, ...outcomes }],
            field_breakdown: expired ? [] : [{ field_of_study: field, ...outcomes }],
            monthly_trend: expired ? [] : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'].map(month_label => ({ month_label, ...outcomes })),
          };
        }
      }
      else if (url.pathname === '/api/sponsors/11/scholarships/1') {
        if (request.method === 'PUT') {
          writeRequests++;
          providerListing = { ...providerListing, ...JSON.parse(request.postData), status: 'pending' };
          data = { message: 'Changes saved and submitted for administrator review.' };
        } else if (request.method === 'DELETE') {
          assert.equal(JSON.parse(request.postData).confirm_scholarship_id, 1);
          writeRequests++; removed = true; data = { message: 'Scholarship deleted.' };
        } else data = { scholarship: providerListing };
      } else if (url.pathname === '/api/sponsors/11/scholarships') {
        data = { sponsor: { organization_name: 'Test Foundation' }, summary: { total: removed ? 0 : 1,
          active: !removed && providerListing.status === 'approved' ? 1 : 0,
          pending: !removed && providerListing.status === 'pending' ? 1 : 0, rejected: 0 },
          scholarships: removed ? [] : [{ ...providerListing, application_count: 0 }] };
      } else if (url.pathname.endsWith('/messages')) data = { summary: { unread: 0 } };
    }
    else if (recommendationMode && url.pathname === '/api/students/11/profile') data = {
      full_name: 'Test Student', education_level: 'Diploma', cgpa: 3.5,
    };
    else if (recommendationMode && url.pathname === '/api/scholarship-reminders') data = dashboardHasData ? [
      { scholarship_id: 2, title: 'Later Deadline', deadline: '2099-12-31', days_until: 100 },
      { scholarship_id: 1, title: 'Priority Deadline', deadline: dashboardDeadline.slice(0, 10), deadline_at: dashboardDeadline, days_until: 0 },
    ] : [];
    else if (recommendationMode && url.pathname === '/api/advisors/my-appointments') data = dashboardHasData ? [
      { appointment_id: 2, advisor_name: 'Later Advisor', appointment_datetime: '2099-12-31T12:00:00+08:00', appointment_status: 'pending' },
      { appointment_id: 1, advisor_name: 'Nearest Advisor', appointment_datetime: dashboardAppointment, appointment_status: 'confirmed' },
    ] : [];
    else if (url.pathname === '/api/pathways/recommendations') data = {
      pathways: recommendationMode && dashboardHasData ? [{pathway_id:1,title:'Computing Pathway',reasons:['Your saved Investigative interests relate to this pathway.']}] : [],
      has_assessment: recommendationMode && dashboardHasData, has_education_level: recommendationMode,
    };
    else if (url.pathname === '/api/scholarships/recommendations' && request.method === 'POST') {
      const context = JSON.parse(request.postData || '{}');
      recommendationContexts.push(context);
      const base = { organization_name: 'Test Foundation',
        checks: [{ criterion: 'CGPA', status: 'matched', reason: 'Your CGPA of 3.50 meets the published minimum of 3.00.' }] };
      data = { recommendations: !dashboardHasData ? [] : context.residency_state === 'Sabah'
        ? [{ ...base, scholarship_id: 8, title: 'Sabah Award', status: 'eligible' }]
        : [{ ...base, scholarship_id: 1, title: 'Diploma Award', status: 'potentially_eligible' },
          { scholarship_id: 2, title: 'Award with missing criteria', status: 'insufficient_information',
            checks: [{ criterion: 'Academic qualification', status: 'unknown', reason: 'No recognised study level was published.' }] },
          { ...base, scholarship_id: 3, title: 'Third Ranked Award', status: 'eligible' },
          { ...base, scholarship_id: 4, title: 'Fourth Ranked Award', status: 'eligible' }] };
    }
    else if (url.pathname.endsWith('/eligibility') && request.method === 'POST') {
      // This endpoint is a read-only calculation despite using POST.
      const context = JSON.parse(request.postData || '{}');
      const mismatch = context.residency_state === 'Sabah';
      data = { status: mismatch ? 'mismatch' : 'needs_verification', matched_count: 1, mismatch_count: mismatch ? 1 : 0, unknown_count: 1,
        checks: [{ criterion: 'CGPA', status: 'unknown', reason: 'Minimum CGPA not specified.' },
          { criterion: 'State', status: mismatch ? 'mismatch' : 'matched', reason: mismatch ? 'Sabah does not match Johor.' : 'State matches.' }],
        disclaimer: 'Preliminary check; verify requirements with the provider.' };
    }
    else if (/^\/api\/scholarships\/\d+\/view$/.test(url.pathname) && request.method==='POST') data = { message: 'View recorded.' };
    else if (url.pathname === '/api/students/11/saved-scholarships' && request.method === 'GET') {
      if (delaySaved) await sleep(3000);
      status = failSaved ? 503 : 200;
      data = fixtures.filter(item => savedIds.has(item.scholarship_id));
    } else if (/^\/api\/students\/11\/saved-scholarships\/\d+$/.test(url.pathname) && ['POST', 'DELETE'].includes(request.method)) {
      const id = Number(url.pathname.split('/').at(-1));
      if (request.method === 'POST') savedIds.add(id);
      else savedIds.delete(id);
      favouriteWrites.push([request.method, id]);
      data = { message: 'Favourite updated.' };
    } else if (url.pathname === '/api/applications/student/11' && request.method === 'GET') {
      status = failApplications ? 503 : 200;
      data = [{ application_id: 23, student_id: 11, scholarship_id: 99, scholarship_title: 'Unpublished Award',
        organization_name: 'Test Foundation', application_date: '2026-11-24', application_status: 'pending',
        listing_published: false }];
    }
    else if (!['GET', 'OPTIONS'].includes(request.method)) { writeRequests++; status = 400; data = { error: 'Writes are forbidden in this browser test' }; }
    else if (url.pathname === '/api/scholarships') {
      listRequests++;
      status = failCatalogue || (refreshFails && removed) ? 503 : 200;
      // Simulate a catalogue snapshot that still includes the listing rejected by details.
      data = fixtures;
    } else if (/\/api\/scholarships\/\d+$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/').at(-1));
      if (delayFirst && id === 1) await sleep(700);
      if (id === 1 && ['removed', 'gone'].includes(detailMode)) { status = detailMode === 'gone' ? 410 : 404; data = { error: 'Scholarship not found' }; removed = true; }
      else if (id === 1 && detailMode === 'failure') { status = 503; data = { error: 'Temporarily unavailable' }; }
      else data = { ...fixtures.find(item => item.scholarship_id === id), description: `Fresh description ${id}`,
        ...(id === 1 ? { opening_date: '2099-10-01' } : {}),
        deadline_at: '2099-12-31T11:30:00+08:00', ...(detailMode === 'closed' ? { intake_status: 'closed' } : {}) };
    } else if (url.pathname.includes('/saved-scholarships')) data = [fixtures[0]];
    await call('Fetch.fulfillRequest', { requestId, responseCode: status,
      responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: origin },
        { name: 'Access-Control-Allow-Headers', value: 'authorization, content-type' }, { name: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS, PUT, PATCH, DELETE' }],
      body: Buffer.from(JSON.stringify(data)).toString('base64') });
  }
  let buffered = '';
  child.stdio[4].setEncoding('utf8').on('data', chunk => {
    buffered += chunk;
    const messages = buffered.split('\0');
    buffered = messages.pop();
    for (const message of messages) {
      handleMessage(JSON.parse(message)).catch(error => errors.push(error.message));
    }
  });
  const { targetInfos } = await call('Target.getTargets');
  ({ sessionId } = await call('Target.attachToTarget', { targetId: targetInfos.find(target => target.type === 'page').targetId, flatten: true }));
  await call('Page.enable'); await call('Runtime.enable');
  await call('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `
    if (!${notificationBellsMode} && (!${settingsMode} || !sessionStorage.getItem('settingsTestSeeded'))) {
      const studentFixture = ${appaMode} && !location.pathname.startsWith('/advisor/');
      localStorage.setItem('scholarone_user', JSON.stringify({user_id:studentFixture ? 12 : 11,full_name:'Browser Test User',email:'test@example.invalid',role:${appaMode || likertMode ? "(location.pathname.startsWith('/advisor/') ? 'advisor' : 'student')" : JSON.stringify(realDraftMode || quizSubmissionsMode || advisorAppointmentMode || advisorRatingMode ? 'advisor' : pathwayAdminMode || adminManagementMode ? 'admin' : providerMode ? 'sponsor' : 'student')},status:'active'}));
      localStorage.setItem('scholarone_access_token', studentFixture ? ${JSON.stringify(process.env.SCHOLARONE_FIXTURE_STUDENT_TOKEN ?? '')} : ${JSON.stringify(useQuizFixture ? process.env.SCHOLARONE_FIXTURE_ADVISOR_TOKEN : 'mock-browser-token')});
      if (${settingsMode}) sessionStorage.setItem('settingsTestSeeded','true');
    }` });
  async function evaluate(expression) {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  }
  async function navigate(suffix = '') {
    removed = false; detailMode = 'fresh'; refreshFails = false; delayFirst = false;
    const navigation = await call('Page.navigate', { url: `${origin}/scholarships${suffix}` });
    assert.equal(navigation.errorText, undefined, 'Local scholarship page navigation');
    try {
      await until(() => evaluate(`!document.querySelector('.sh-results-bar p')?.textContent.startsWith('Loading opportunities') && !!document.querySelector('.sh-results-bar p')`), 'loaded scholarship results', 30000);
    } catch (error) {
      const page = await evaluate(`document.body?.innerText.slice(0, 500)`).catch(() => '');
      throw new Error(`${error.message}. Page text: ${page}. Browser errors: ${errors.join('; ')}`);
    }
  }
  const cardTitles = () => evaluate(`[...document.querySelectorAll('.scholarship-grid h3')].map(x=>x.textContent)`);
  async function count(expected) { await until(async () => (await cardTitles()).length === expected, `${expected} cards`); }
  async function select(index, value) {
    await evaluate(`(()=>{const input=document.querySelectorAll('.financial-aid-dropdowns select')[${index}];Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  }
  const click = text => evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===${JSON.stringify(text)});if(!b)throw new Error('Button not found');b.click();})()`);
  const close = () => evaluate(`document.querySelector('[aria-label="Close scholarship details"]').click()`);
  const modalText = () => evaluate(`document.querySelector('.scholarship-detail-modal')?.textContent || ''`);
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  if (notificationBellsMode) {
    const pathIs = route => evaluate(`location.pathname + location.search === ${JSON.stringify(route)}`);
    const bell = '.account-notifications > summary';
    const inbox = '.account-notifications > section';
    const openBell = () => evaluate(`document.querySelector('${bell}').click()`);
    const waitForBadge = count => until(() => evaluate(
      `document.querySelector('${bell}')?.getAttribute('aria-label') === 'Account notifications: ${count} unread'`), `${count} unread`);
    const inboxOpen = () => evaluate(`document.querySelector('.account-notifications')?.open`);
    const waitForNotice = message => until(() => evaluate(
      `document.querySelector('${inbox}')?.innerText.includes(${JSON.stringify(message)})`), message);
    const setLoginField = (type, value) => evaluate(`(() => {
      const input = document.querySelector('form input[type="${type}"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    async function signIn(role, account) {
      await call('Page.navigate', { url: origin + account.login });
      await until(async () => await pathIs(account.login) && await evaluate(`!!document.querySelector('form input[type="password"]')`), `${role} login form`);
      await setLoginField('email', `${role}@example.invalid`);
      await setLoginField('password', 'BrowserFixturePassword');
      await evaluate(`document.querySelector('form').requestSubmit()`);
      await until(async () => await pathIs(account.route) && await evaluate(`!!document.querySelector('${bell}')`), `${role} dashboard bell`);
    }
    async function signOut(role) {
      if (role === 'advisor') await evaluate(`document.querySelector('[aria-label="Open account menu"]').click()`);
      if (role === 'student') await evaluate(`document.querySelector('.ss-account > summary').click()`);
      await click('Logout');
      await until(() => evaluate(`!localStorage.getItem('scholarone_access_token') && !document.querySelector('${bell}')`), 'signed out');
    }
    const press = async (key, keyCode) => {
      await call('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: keyCode, ...(key === 'Enter' ? { text: '\r' } : {}) });
      await call('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: keyCode });
    };
    async function verifyLayout(role, width) {
      await until(() => evaluate(`(() => {
        const button = document.querySelector('${bell}');
        const popup = document.querySelector('${inbox}');
        if (!button || !popup || !popup.parentElement.open) return false;
        const trigger = button.getBoundingClientRect(), panel = popup.getBoundingClientRect();
        const viewport = document.documentElement.clientWidth;
        const header = button.closest('header');
        return header && document.querySelectorAll('${bell}').length === 1
          && !document.querySelector('.advisor-home-bell, .am-bell, .ap-messages-link')
          && trigger.width === trigger.height && trigger.width >= 44 && getComputedStyle(button).borderRadius === '50%'
          && !button.innerText.includes('Notifications')
          && panel.left >= 11 && panel.right <= viewport - 11 && panel.top > trigger.bottom
          && popup.contains(document.elementFromPoint(panel.left + 20, panel.top + 20));
      })()`), `${role} circular bell and visible panel at ${width}px`);
      const screenshot = await call('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(artifacts, `notifications-${role}-${width}.png`), Buffer.from(screenshot.data, 'base64'));
    }
    for (const [role, account] of Object.entries(bellAccounts)) {
      await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
      delayNotificationReads = role === 'student';
      await signIn(role, account);
      await evaluate(`document.querySelector('${bell}').focus()`);
      await press('Enter', 13);
      await until(inboxOpen, `${role} opens with Enter`);
      if (role === 'student') await until(() => evaluate(`document.querySelector('${inbox} [role=status]')?.textContent === 'Loading notifications…'`), 'loading state');
      await waitForBadge(1);
      const [, , firstMessage] = account.notices[0];
      await waitForNotice(firstMessage);
      delayNotificationReads = false;
      const content = await evaluate(`document.querySelector('${inbox}').innerText`);
      for (const [, title, message] of account.notices) { assert.ok(content.includes(title)); assert.ok(content.includes(message)); }
      for (const [otherRole, other] of Object.entries(bellAccounts)) {
        if (otherRole !== role) assert.ok(!content.includes(other.notices[0][2]));
      }
      assert.equal(await evaluate(`document.querySelector('${bell} > b')?.textContent`), '1');
      assert.match(await evaluate(`document.querySelector('${inbox} time').textContent`), /31 Dec 2099.*7:05.*MYT/i);
      assert.equal(await evaluate(`!!document.querySelector('${inbox} a[href="${account.action}"]')`), true);
      await verifyLayout(role, 1440);
      await press('Escape', 27);
      assert.equal(await inboxOpen(), false);
      assert.equal(await evaluate(`document.activeElement.matches('${bell}')`), true);

      await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      await openBell();
      await verifyLayout(role, 390);
      await click('Mark as read');
      await waitForBadge(0);
      assert.equal(await evaluate(`document.querySelector('${bell} > b') === null`), true);
      await call('Page.reload');
      await until(() => evaluate(`document.readyState === 'complete' && !!document.querySelector('${bell}')`), 'refreshed dashboard');
      await until(async () => !(await inboxOpen()), 'fresh dashboard starts closed');
      await openBell();
      await waitForNotice(firstMessage);
      assert.equal(await evaluate(`document.querySelector('${inbox} article').classList.contains('read')`), true);
      await evaluate(`document.querySelector('[aria-label="Close notifications"]').click()`);
      assert.equal(await inboxOpen(), false);
      await signOut(role);
      await signIn(role, account);
      await openBell();
      await waitForNotice(firstMessage);
      assert.equal(await evaluate(`document.querySelector('${inbox} article').classList.contains('read')`), true);
      await evaluate(`document.querySelector('${inbox} article button').click()`);
      await waitForBadge(1);

      if (role === 'student') {
        await evaluate(`document.querySelector('.ss-account > summary').click()`);
        assert.equal(await inboxOpen(), false, 'opening the profile closes the notification panel');
        await openBell();
        assert.equal(await evaluate(`document.querySelector('.ss-account').open`), false, 'opening notifications closes the profile');
        await until(() => evaluate(`document.querySelector('${inbox} > button')?.getAttribute('aria-disabled') === 'false'`), 'inbox ready for refresh');
        failNotificationReads = true;
        await evaluate(`document.querySelector('${inbox} > button').click()`);
        await until(() => evaluate(`document.querySelector('${inbox} [role=alert]')?.textContent.includes('Unable to load')`), 'notification error');
        await waitForNotice(firstMessage);
        failNotificationReads = false;
        emptyNotificationInbox = true;
        await evaluate(`document.querySelector('${inbox} > button').click()`);
        await waitForNotice('No notifications yet.');
        await waitForBadge(0);
        emptyNotificationInbox = false;
        await evaluate(`document.querySelector('${inbox} a[href="${account.action}"]').click()`);
        await until(() => pathIs(account.action), 'scholarship reminder shortcut');
        assert.equal(await inboxOpen(), false);
      } else if (role === 'advisor') {
        for (const route of ['/advisor/settings', '/advisor/profile', '/advisor/messages']) {
          await call('Page.navigate', { url: origin + route });
          await until(async () => await pathIs(route) && await evaluate(`document.querySelector('${bell}')?.getAttribute('aria-label').endsWith('1 unread')`), `${route} bell`);
          await openBell();
          await waitForNotice(firstMessage);
          await verifyLayout('advisor-' + route.split('/').at(-1), 390);
        }
      }
      await signOut(role);
    }
    assert.deepEqual(errors, []);
    console.log(`PASS four-role notification bells, including keyboard, state changes, reload, re-login and mobile fit. APIs mocked. Screenshots: ${artifacts}`);
  } else if (settingsMode) {
    const open = route => call('Page.navigate', { url: origin + route });
    const bodyContains = text => evaluate(`document.body.textContent.includes(${JSON.stringify(text)})`);
    const waitPath = route => until(() => evaluate(`location.pathname+location.search===${JSON.stringify(route)}`), route);
    const link = (route, index = 0) => evaluate(`document.querySelectorAll('.student-settings a[href="${route}"]')[${index}].click()`);
    const settingsFit = () => evaluate(`(() => {
      const page = document.querySelector('.student-settings');
      const form = page.querySelector('.st-password-form');
      return page.scrollWidth <= page.clientWidth + 1 && form.scrollWidth <= form.clientWidth + 1;
    })()`);
    const setInput = (selector, value) => evaluate(`(() => {
      const field = document.querySelector(${JSON.stringify(selector)});
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, ${JSON.stringify(value)});
      field.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    const switches = () => evaluate(`[...document.querySelectorAll('.student-settings [role="switch"]')].map(el=>el.checked)`);
    await open('/settings');
    await until(() => bodyContains('until the database is updated'), 'missing migration feedback');
    assert.deepEqual(await switches(), []);
    failSettings = false;
    await click('Retry');
    await until(async () => (await switches()).length === 2, 'preferences loaded');
    assert.deepEqual(await switches(), [true, true]);
    for (const label of ['Advisor appointment alerts', 'Academic pathway updates']) {
      await evaluate(`document.querySelector('[aria-label="${label}"]').click()`);
      await until(() => evaluate(`!document.querySelector('[aria-label="${label}"]').checked`), label + ' saved');
    }
    await open('/settings');
    await until(async () => (await switches()).length === 2, 'refreshed settings');
    assert.deepEqual(await switches(), [false, false]);
    for (const [route, index] of [['/calendar?section=reminders', 0], ['/appointments', 0], ['/pathway-quiz', 0], ['/profile', 0], ['/profile', 1]]) {
      await link(route, index);
      await waitPath(route);
      await open('/settings');
      await until(() => bodyContains('Change Password'), 'settings navigation');
    }
    await click('Change PasswordUpdate your account password.');
    assert.equal(await settingsFit(), true, 'desktop settings fit');
    await setInput('.st-password-form input[autocomplete="current-password"]', 'WrongFixturePassword');
    await setInput('.st-password-form label:nth-child(2) input', 'FixtureNewPassword');
    await setInput('.st-password-form label:nth-child(3) input', 'FixtureNewPassword');
    await click('Save password');
    await until(() => bodyContains('Current password is incorrect.'), 'password error');
    await setInput('.st-password-form input[autocomplete="current-password"]', browserPassword);
    await click('Save password');
    await until(() => bodyContains('Password changed successfully.'), 'password saved');
    await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await click('Change PasswordUpdate your account password.');
    assert.equal(await settingsFit(), true, 'mobile settings fit');
    await click('Log OutSign out from your ScholarOne account.');
    await waitPath('/login');
    assert.equal(await evaluate(`localStorage.getItem('scholarone_access_token')`), null);
    assert.equal(await evaluate(`localStorage.getItem('scholarone_user')`), null);
    await open('/settings');
    await waitPath('/login');
    await until(() => evaluate(`!!document.querySelector('form input[type="email"]')`), 'login form');
    await setInput('form input[type="email"]', 'student@example.invalid');
    await setInput('form input[type="password"]', browserPassword);
    await evaluate(`document.querySelector('form').requestSubmit()`);
    await waitPath('/dashboard');
    await open('/settings');
    await until(async () => (await switches()).length === 2, 'settings after re-login');
    assert.deepEqual(await switches(), [false, false]);
    assert.deepEqual(errors, []);
    console.log('PASS student settings: unavailable state and retry, navigation, save and refresh, password feedback, mobile, logout guard and re-login; API mocked.');
  } else if (qualificationMode) {
    await call('Page.navigate', { url: origin + '/profile' });
    await until(() => evaluate(`document.querySelector('.sp-summary h2')?.textContent==='Test Student' && !document.querySelector('select[name="academic_qualification"]')?.disabled`), 'profile loaded');
    const openAcademics = () => evaluate(`document.querySelector('#sp-academic-tab').click()`);
    const setField = (selector, value) => evaluate(`(() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      const prototype = input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    })()`);
    const selectQualification = value => setField('select[name="academic_qualification"]', value);
    const resultText = () => evaluate(`document.querySelector('.sp-qualification-results')?.innerText || ''`);
    const subject = async (index, name, grade) => {
      await setField(`.sp-subject-row:nth-of-type(${index}) input`, name);
      await setField(`.sp-subject-row:nth-of-type(${index}) select`, grade);
    };
    await openAcademics();
    await selectQualification('spm');
    assert.match(await resultText(), /Subject Results/);
    assert.doesNotMatch(await resultText(), /CGPA/);
    await click('Add Subject'); await subject(1, 'Mathematics', 'A+');
    await click('Add Subject'); await subject(2, ' mathematics ', 'A');
    await evaluate(`document.querySelector('.sp-footer button[type=submit]').click()`);
    await until(() => evaluate(`document.querySelector('.sp-field-error')?.textContent.includes('only once')`), 'duplicate subject validation');
    assert.equal(writeRequests, 0);
    await subject(2, 'Custom Science', 'B+');
    await evaluate(`document.querySelector('[aria-label="Remove subject 1"]').click()`);
    await subject(1, 'Custom Science', 'A-');
    await click('+ Add qualification');
    assert.equal(await evaluate(`document.activeElement.name`), 'academic_qualification');
    assert.equal(await evaluate(`document.activeElement.value`), '');
    assert.match(await evaluate(`document.querySelector('.sp-recorded-qualifications').textContent`), /SPM.*Unsaved/);
    await selectQualification('igcse_o_level');
    const scale = '.sp-qualification-results .profile-form-grid select';
    await setField(scale, 'igcse_letters'); await click('Add Subject');
    assert.ok(await evaluate(`[...document.querySelector('.sp-subject-row select').options].some(o=>o.value==='G')`));
    await setField(scale, 'o_level');
    assert.ok(await evaluate(`![...document.querySelector('.sp-subject-row select').options].some(o=>o.value==='G')`));
    await setField(scale, 'igcse_numeric'); await subject(1, 'Biology', '9');
    assert.doesNotMatch(await resultText(), /CGPA/);
    await selectQualification('stpm');
    assert.match(await resultText(), /CGPA \/ PNGK/);
    assert.match(await resultText(), /Subject Results/);
    assert.match(await resultText(), /MUET band/);
    await setField('.sp-qualification-results input[type=number]', '3.67');
    for (const kind of ['matriculation', 'foundation', 'diploma', 'bachelors']) {
      await selectQualification(kind);
      assert.match(await resultText(), /CGPA/);
      assert.match(await resultText(), /Institution/);
      assert.doesNotMatch(await resultText(), /Subject Results/);
      if (['diploma', 'bachelors'].includes(kind)) assert.match(await resultText(), /Programme Name/);
    }
    await selectQualification('a_level');
    assert.match(await resultText(), /Institution Name/);
    assert.match(await resultText(), /Subject Results/);
    assert.doesNotMatch(await resultText(), /CGPA/);
    await selectQualification('spm');
    assert.equal(await evaluate(`document.querySelector('.sp-subject-row input').value`), 'Custom Science');
    await evaluate(`document.querySelector('.sp-current-study').open = true`);
    await setField('select[name="field_of_study"]', 'Other');
    await setField('input[name="other_field_of_study"]', '  ');
    await evaluate(`document.querySelector('.sp-footer button[type=submit]').click()`);
    await until(() => evaluate(`!!document.querySelector('#sp-other-field-error')`), 'custom field is required');
    assert.equal(writeRequests, 0);
    await setField('input[name="other_field_of_study"]', ' Marine Robotics ');
    await evaluate(`document.querySelector('.sp-footer button[type=submit]').click()`);
    await until(() => writeRequests === 1 && studentProfile.academic_qualifications.stpm, 'academic results saved');
    const profileTimeOrigin = await evaluate('performance.timeOrigin');
    await call('Page.reload');
    await until(() => evaluate(`performance.timeOrigin !== ${profileTimeOrigin} && document.querySelector('.sp-summary h2')?.textContent === 'Test Student'`), 'profile reloaded');
    await openAcademics();
    await until(() => evaluate(`document.querySelectorAll('.sp-recorded-qualifications button').length === 3`), 'saved qualifications restored');
    await selectQualification('igcse_o_level');
    assert.equal(await evaluate(`document.querySelectorAll('.sp-recorded-qualifications button').length`), 3);
    await evaluate(`[...document.querySelectorAll('.sp-recorded-qualifications button')].find(button => button.textContent === 'SPM').click()`);
    assert.equal(await evaluate(`document.querySelector('.sp-subject-row input').value`), 'Custom Science');
    await selectQualification('igcse_o_level');
    assert.equal(await evaluate(`document.querySelector('.sp-subject-row select').value`), '9');
    assert.equal(await evaluate(`document.querySelector('select[name="education_level"]').value`), 'Foundation');
    assert.equal(studentProfile.cgpa, '3.20');
    assert.equal(studentProfile.university, 'Current College');
    assert.equal(studentProfile.field_of_study, 'Marine Robotics');
    assert.equal(await evaluate(`document.querySelector('select[name="field_of_study"]').value`), 'Other');
    assert.equal(await evaluate(`document.querySelector('input[name="other_field_of_study"]').value`), 'Marine Robotics');
    await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth + 1`), true, 'Qualification form fits a mobile viewport');
    assert.deepEqual(errors, []);
    console.log(`PASS ${path.basename(browser)}: all qualification formats, subject edit and removal, duplicate validation, draft switching, save and reload; API calls mocked.`);
  } else if (reminderDeliveryMode) {
    await call('Page.navigate', { url: origin + '/calendar' });
    await until(() => evaluate(`document.querySelector('.sc-deadline-row')?.textContent.includes('Updated Scholarship Deadline')`), 'updated calendar deadline');
    await evaluate(`document.querySelector('.sc-deadline-row').click()`);
    await until(() => evaluate(`document.querySelector('dialog[open]')?.textContent.includes('11:30:00 (Malaysia time)')`), 'exact closing time');
    await evaluate(`document.querySelector('dialog[open]').close()`);
    await evaluate(`document.querySelector('.account-notifications summary').click()`);
    await until(() => evaluate(`document.querySelector('.account-notifications .unread')?.textContent.includes('11:30:00 Malaysia time')`), 'offline reminder visible in inbox');
    assert.match(await evaluate(`document.querySelector('.account-notifications time').textContent`), /31 Dec 2099.*7:05.*MYT/i);
    await click('Mark as read');
    await until(() => evaluate(`!!document.querySelector('.account-notifications .read')`), 'reminder marked read');
    await call('Page.reload');
    await until(() => evaluate(`!!document.querySelector('.account-notifications .read')`), 'read state after reload');
    assert.equal(await evaluate(`document.querySelector('.account-notifications summary').getAttribute('aria-label')`), 'Account notifications: 0 unread');
    await evaluate(`document.querySelector('.account-notifications').open=true`);
    await click('Mark as unread');
    await until(() => evaluate(`!!document.querySelector('.account-notifications .unread')`), 'reminder marked unread');
    assert.deepEqual(errors, []);
    console.log(`PASS ${path.basename(browser)}: updated exact deadline on calendar and reminder inbox read state across reload; API calls mocked.`);
  } else if (recommendationMode) {
    await call('Page.navigate', { url: origin + '/dashboard' });
    const recommendationsText = () => evaluate(`document.querySelector('.ss-scholarship-recommendations')?.innerText || ''`);
    await until(async () => (await recommendationsText()).includes('Diploma Award'), 'personalized dashboard results');
    await until(() => evaluate(`document.querySelector('[aria-label="Personalized Academic Pathway Recommendations"]')?.textContent.includes('Your saved Investigative interests')`), 'personalized pathways on the same dashboard');
    await until(() => evaluate(`document.querySelector('.ss-priority')?.textContent.includes('Priority Deadline') &&
      document.querySelector('.ss-priority')?.textContent.includes('Appointment within 24 hours')`), 'imminent deadline and appointment');
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('.ss-deadlines .ss-deadline strong')].map(el => el.textContent)`), ['Priority Deadline', 'Later Deadline']);
    assert.equal(await evaluate(`document.querySelector('.ss-appointment time').dateTime`), dashboardAppointment);
    assert.match(await evaluate(`document.querySelector('.ss-appointment').innerText`), /Nearest Advisor[\s\S]*confirmed/i);
    assert.equal(await evaluate(`document.querySelector('.ss-progress .ss-ring[role="progressbar"]').getAttribute('aria-valuenow')`), '30');
    assert.equal(await evaluate(`document.querySelector('.ss-progress .ss-ring strong').textContent`), '30%');
    assert.equal(await evaluate(`!!document.querySelector('.ss-hero .ss-explore') && document.querySelectorAll('.ss-action-grid a').length === 4`), true);
    assert.equal(await evaluate(`document.querySelector('.ss-side-column .ss-quiz a').getAttribute('href')`), '/pathway-quiz');
    assert.equal(await evaluate(`document.querySelector('.ss-recommendation-context').open`), false);
    assert.equal(await evaluate(`document.querySelector('.ss-recommendation-header h3 a').getAttribute('href')`), '/scholarships?listing=1');
    assert.match(await recommendationsText(), /Potentially eligible/);
    assert.match(await recommendationsText(), /Insufficient information/);
    assert.match(await recommendationsText(), /3\.50 meets the published minimum/);
    assert.equal(await evaluate(`document.querySelectorAll('.ss-scholarship-recommendations .ss-recommendation').length`), 3);
    assert.match(await recommendationsText(), /Third Ranked Award/);
    assert.doesNotMatch(await recommendationsText(), /Fourth Ranked Award|Show more recommendations/);
    await evaluate(`document.querySelector('.ss-recommendation details summary').click()`);
    assert.match(await recommendationsText(), /CGPA · Match/);
    await evaluate(`document.querySelector('.ss-recommendation-context summary').click()`);
    await evaluate(`document.querySelector('.ss-recommendation-context select[name="residency_state"]').value = 'Sabah'`);
    await click('Update recommendations');
    await until(async () => (await recommendationsText()).includes('Sabah Award'), 'recommendations refined by state');
    assert.match(await recommendationsText(), /Eligible on checked criteria/);
    assert.doesNotMatch(await recommendationsText(), /Diploma Award/);
    assert.equal(await evaluate(`document.querySelectorAll('.ss-scholarship-recommendations .ss-recommendation').length`), 1);
    assert.equal(await evaluate(`document.querySelector('.ss-refine-active').textContent`), 'Active');
    await evaluate(`document.querySelector('.ss-recommendation-context summary').click()`);
    assert.equal(await evaluate(`document.querySelector('.ss-recommendation-context select').value`), 'Sabah');
    for (const [width, columns] of [[1440, 2], [1024, 2], [768, 1], [390, 1]]) {
      await call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('.ss-content-grid')).gridTemplateColumns.split(' ').length`), columns);
      assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth + 1 &&
        [...document.querySelectorAll('.student-success .ss-card')].every(card => card.scrollWidth <= card.clientWidth + 1)`), true, `Dashboard fits ${width}px`);
    }
    assert.equal(recommendationContexts.at(-1).residency_state, 'Sabah');
    assert.equal(listRequests, 0, 'Dashboard uses the recommendation endpoint for ranking');
    await call('Page.reload');
    await until(async () => (await recommendationsText()).includes('Diploma Award'), 'reload resets temporary filters');
    await evaluate(`document.querySelector('.ss-recommendation-header h3 a').click()`);
    await until(() => evaluate(`document.querySelector('.scholarship-detail-modal h2')?.textContent === 'Scholarship Example'`), 'recommendation opens the existing details view');
    await evaluate(`document.querySelector('.scholarship-detail-close').click()`);
    await until(() => evaluate(`!document.querySelector('.scholarship-detail-modal') && !new URLSearchParams(location.search).has('listing')`), 'closing details clears the direct link');
    dashboardHasData = false;
    await call('Page.navigate', { url: origin + '/dashboard' });
    await until(() => evaluate(`document.querySelector('.ss-deadlines')?.innerText.includes('No upcoming deadline reminders.') &&
      document.querySelector('.ss-appointment')?.innerText.includes('Book an Appointment') &&
      document.querySelector('.ss-scholarship-recommendations')?.innerText.includes('No scholarships match')`), 'dashboard empty states');
    assert.equal(await evaluate(`!!document.querySelector('.ss-priority')`), false);
    await evaluate(`document.querySelector('.ss-recommendation-catalogue').click()`);
    await until(() => evaluate(`location.pathname === '/scholarships'`), 'catalogue navigation');
    assert.equal(writeRequests, 0);
    assert.deepEqual(errors, []);
    console.log(`PASS ${path.basename(browser)}: dashboard recommendation labels, reasons and optional state refinement with mocked APIs.`);
  } else if (adminManagementMode) {
    const fill=(selector,value)=>evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});const proto=input.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await call('Page.navigate',{url:origin+'/admin/dashboard'});
    await until(()=>evaluate(`[...document.querySelectorAll('.adh-metric')].some(el=>el.textContent.includes('Total Appointments') && el.querySelector('strong')?.textContent==='7')`),'admin appointment total');
    await call('Page.navigate',{url:origin+'/admin/users'});
    await until(()=>evaluate(`!!document.querySelector('[aria-label="Manage Test Student"]')`),'admin users');
    await evaluate(`document.querySelector('[aria-label="Manage Test Student"]').click()`);
    await evaluate(`document.querySelector('[aria-label="Edit account information"]').click()`);
    await fill('input[name="cgpa"]','3.75'); await fill('input[name="nationality"]','Malaysian'); await click('Save Information');
    await until(()=>adminStudent.cgpa==='3.75','profile update');
    await call('Page.navigate',{url:origin+'/admin/subscriptions'});
    await until(()=>evaluate(`document.body.textContent.includes('Plan Configuration')`),'subscription management');
    await click('Plan Configuration'); await click('Create Subscription Plan');
    await fill('input[name="plan_name"]','Browser Plan'); await fill('input[name="price"]','29.00'); await click('Save Configuration');
    await until(()=>adminPlans.length===2,'plan created');
    await until(()=>evaluate(`document.querySelector('.asu-plan-grid')?.textContent.includes('Browser Plan')`),'plan visible');
    await click('Archive Plan'); await until(()=>adminPlans[1].is_active===false,'archive plan');
    await until(()=>evaluate(`document.body.textContent.includes('Restore Plan')`),'restore offered');
    await click('Restore Plan'); await until(()=>adminPlans[1].is_active===true,'restore plan');
    await call('Page.navigate',{url:origin+'/admin/reports'});
    await until(()=>evaluate(`!!document.querySelector('.arp-period')`),'payment reports');
    await click('Subscription Reports');
    assert.equal(await evaluate(`document.body.textContent.includes('49.00') && document.body.textContent.includes('13 legacy paid-plan records')`),true);
    await evaluate(`(()=>{const original=URL.createObjectURL;URL.createObjectURL=blob=>{blob.text().then(text=>window.__reportCSV=text);return original(blob)};HTMLAnchorElement.prototype.click=function(){};})()`);
    await click('Export CSV');
    await until(()=>evaluate(`window.__reportCSV?.includes('Recorded paid invoices') && window.__reportCSV.includes('myr') && window.__reportCSV.includes('49.00')`),'payment CSV contents');
    await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`),true,'Admin reports fit mobile');
    assert.deepEqual(errors,[]);console.log(`PASS ${path.basename(browser)}: admin profile editing, plan creation/archive/restore, payment report and CSV; APIs mocked.`);
  } else if (providerStatsMode || providerResubmitMode) {
    await call('Page.navigate',{url:origin+(providerStatsMode?'/sponsor/statistics':'/sponsor-login')});
    if (providerStatsMode) {
      await until(() => evaluate(`document.querySelector('.analytics-filter [role="status"]')?.textContent.includes('Loading scholarship statistics')`), 'initial loading state');
      await until(() => evaluate(`document.body.textContent.includes('Viewed Award')`),'provider view statistics');
      assert.equal(await evaluate(`document.body.textContent.includes('7 views') && document.body.textContent.includes('Unique Student Viewers')`),true);
      assert.equal(await evaluate(`!!document.querySelector('[aria-label="Listing lifecycle totals"]')`),true);
      const metricValues = () => evaluate(`Array.from(document.querySelectorAll('.analytics-metric strong'), item => item.textContent)`);
      assert.deepEqual(await metricValues(), ['7', '4', '8', '2', '25%', 'Environmental Engineering']);
      assert.equal(await evaluate(`document.querySelectorAll('.analytics-chart').length`), 4);
      const selectLifecycle = value => evaluate(`(() => {
        const select = document.querySelector('#analytics-lifecycle');
        select.value = ${JSON.stringify(value)};
        select.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
      for (const [width, columns] of [[1440, 3], [1024, 2], [768, 2], [390, 1]]) {
        await call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
        assert.equal(await evaluate(`getComputedStyle(document.querySelector('.analytics-metrics')).gridTemplateColumns.split(' ').length`), columns);
        assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth + 1 &&
          [...document.querySelectorAll('.analytics-card')].every(card => card.scrollWidth <= card.clientWidth + 1)`), true, `Statistics fit ${width}px`);
        const heights = await evaluate(`[...document.querySelectorAll('.analytics-metric')].map(card => card.offsetHeight)`);
        assert.equal(new Set(heights).size, 1, `Equal metric heights at ${width}px`);
        if (width === 1440 || width === 390) {
          const screenshot = await call('Page.captureScreenshot', { format: 'png' });
          await writeFile(path.join(artifacts, `provider-analytics-${width}.png`), Buffer.from(screenshot.data, 'base64'));
        }
      }
      await selectLifecycle('closed');
      await until(() => evaluate(`document.body.textContent.includes('Updating statistics')`), 'filter loading state');
      await until(() => evaluate(`document.querySelector('.analytics-filter [role="alert"]')?.textContent.includes('Showing the last loaded results.')`), 'filter error retains metrics');
      assert.deepEqual(await metricValues(), ['7', '4', '8', '2', '25%', 'Environmental Engineering']);
      await selectLifecycle('expired');
      await until(()=>evaluate(`document.body.textContent.includes('No listings match this filter.') && !document.body.textContent.includes('Viewed Award')`),'lifecycle filter updates metrics');
      assert.deepEqual(await metricValues(), ['0', '0', '0', '0', '0%', 'No data']);
      assert.equal(await evaluate(`document.body.textContent.includes('No analytics data yet')`), true);
      console.log(`Screenshots: ${artifacts}`);
    } else {
      await until(() => evaluate(`!!document.querySelector('.auth-form input[type=email]')`),'provider login form');
      assert.equal(await evaluate(`!!document.querySelector('a[href*="resubmit=true"]')`),false);
      await evaluate(`(() => { const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
        for (const [selector,value] of [['input[type=email]','provider@example.invalid'],['input[type=password]','Example123']]) {
          const input=document.querySelector('.auth-form '+selector); setter.call(input,value); input.dispatchEvent(new Event('input',{bubbles:true}));
        }
        document.querySelector('.auth-form').requestSubmit();
      })()`);
      await until(() => evaluate(`document.body.textContent.includes('Correct the organization details.')`),'credential-verified private decision');
      await evaluate(`document.querySelector('a[href*="resubmit=true"]').click()`);
      await until(() => evaluate(`document.body.textContent.includes('Correct and Resubmit Provider Registration')`),'resubmission form');
      for(const [name,value] of Object.entries({organization_name:'Test Foundation',full_name:'Test Provider',email:'test@example.invalid',phone_number:'123456789',organization_type:'Foundation',password:'Example123',confirm_password:'Example123'})) {
        await evaluate(`(()=>{const input=document.querySelector('[name="${name}"]');const proto=input.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
      }
      await evaluate(`document.querySelector('.registration-form').requestSubmit()`);
      await until(() => evaluate(`document.body.textContent.includes('Pending administrator verification')`),'resubmission pending');
      assert.equal(writeRequests,1);
    }
    await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`),true,'Provider screen fits mobile');
    assert.deepEqual(errors,[]);
    console.log(`PASS ${path.basename(browser)}: provider ${providerStatsMode?'view metrics and empty application state':'resubmission form and pending confirmation'}; APIs mocked.`);
  } else if (advisorRatingMode) {
    await call('Page.navigate', { url: origin + '/advisor/dashboard' });
    const card = () => evaluate(`document.querySelector('.advisor-home-rating')?.innerText || ''`);
    const value = () => evaluate(`document.querySelector('.advisor-home-rating strong')?.textContent.replace(/\\s+/g, ' ').trim()`);
    await until(async () => (await value()) === 'No ratings yet', 'empty rating card');
    assert.match(await card(), /0 student reviews/);
    assert.doesNotMatch(await card(), /4\.8|0\.0|\/ 5/);
    dashboardRating = { average_rating: '4.0', total_reviews: 3 };
    await until(() => evaluate(`!!document.querySelector('.advisor-home-live-note button:enabled')`), 'dashboard refresh button enabled');
    const requestsBeforeRefresh = advisorRatingRequests;
    await evaluate(`document.querySelector('.advisor-home-live-note button').click()`);
    await until(() => advisorRatingRequests > requestsBeforeRefresh, 'dashboard requests fresh rating data');
    await until(async () => (await value()) === '4.0 / 5', 'new ratings appear after dashboard refresh');
    assert.match(await card(), /3 student reviews/);
    await call('Page.reload');
    await until(async () => (await value()) === '4.0 / 5', 'rating persists on page reload');
    dashboardRating = { average_rating: 5, total_reviews: 1 };
    await call('Page.reload');
    await until(async () => (await value()) === '5.0 / 5', 'single rating');
    assert.match(await card(), /1 student review\b/);
    assert.doesNotMatch(await card(), /1 student reviews/);
    assert.equal(await evaluate(`document.querySelector('.advisor-home-rating').getAttribute('href')`), '/advisor/feedback');
    assert.deepEqual(errors, []);
    console.log('PASS advisor rating empty, plural, singular and refresh states; API responses mocked.');
  } else if (appointmentMode || advisorAppointmentMode) {
    await call('Page.navigate', { url: `${origin}/${advisorAppointmentMode ? 'advisor/appointments' : 'appointments'}` });
    await until(() => evaluate(`document.body.textContent.includes('${advisorAppointmentMode ? 'Reject with Reason' : 'My Appointments'}')`), 'appointment page loaded');
    if (advisorAppointmentMode) {
      await click('Reject with Reason');
      assert.equal(await evaluate(`[...document.querySelectorAll('button')].find(x=>x.textContent==='Confirm Rejection').disabled`), true);
      await evaluate(`(()=>{const input=document.querySelector('.appointment-review-form textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Choose another time.');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await click('Confirm Rejection');
      await until(() => evaluate(`document.querySelector('.appointment-rejection')?.textContent.includes('Choose another time.')`), 'persisted rejection reason');
      assert.equal(writeRequests, 1);
    } else {
      await until(() => evaluate(`document.querySelectorAll('.sa-history-list button').length===3`), 'student bookings loaded');
      const openDetails = index => evaluate(`document.querySelectorAll('.sa-history-list button')[${index}].click()`);
      await openDetails(2);
      await until(() => evaluate(`document.querySelector('dialog[open]')?.textContent.includes('Please choose another date.')`), 'student rejection reason');
      await click('Done'); await openDetails(0); await click('Cancel Appointment');
      await until(() => evaluate(`document.querySelector('dialog[open] .sa-status')?.textContent==='cancelled'`), 'student cancellation');
      await click('Done'); await openDetails(1);
      await until(() => evaluate(`!!document.querySelector('.appointment-review-form select')`), 'review form');
      await evaluate(`(()=>{const input=document.querySelector('.appointment-review-form select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(input,'5');input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await click('Submit Review');
      await until(() => evaluate(`document.querySelector('dialog[open]')?.textContent.includes('Your rating: 5 / 5')`), 'saved review');
      await click('Done'); await call('Page.reload');
      await until(() => evaluate(`document.querySelectorAll('.sa-history-list button').length===3`), 'appointment reload');
      await openDetails(1);
      await until(() => evaluate(`document.querySelector('dialog[open]')?.textContent.includes('Your rating: 5 / 5')`), 'saved review reload');
      await click('Done'); assert.equal(writeRequests, 2);
    }
    await evaluate(`document.querySelector('.account-notifications summary').click()`);
    await until(() => evaluate(`document.querySelector('.account-notifications')?.textContent.includes('Appointment booking requested.')`), 'notification menu');
    failNotificationReads = true; const beforeFailures = notificationRequests;
    await evaluate(`document.querySelector('.account-notifications section > button').click()`);
    await until(() => evaluate(`document.querySelector('.account-notifications [role=alert]')?.textContent.includes('Unable to load')`), 'bounded notification retries show error');
    assert.equal(notificationRequests - beforeFailures, 3, 'Exactly three read attempts');
    assert.equal(await evaluate(`document.querySelector('.account-notifications')?.textContent.includes('Appointment booking requested.')`), true, 'Cached notifications survive failure');
    failNotificationReads = false;
    await evaluate(`document.querySelector('.account-notifications section > button').click()`);
    await until(() => evaluate(`!document.querySelector('.account-notifications [role=alert]')`), 'manual retry recovers');
    failReadUpdate = true; await click('Mark as read');
    await until(() => evaluate(`document.querySelector('.account-notifications [role=alert]')?.textContent.includes('update this notification')`), 'failed mutation stays retryable');
    assert.equal(noticeRead, false); failReadUpdate = false;
    await click('Mark as read'); await until(() => noticeRead, 'notification marked read');
    await call('Emulation.setDeviceMetricsOverride', { width:390, height:844, deviceScaleFactor:1, mobile:true });
    assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth+1`), true, 'Appointments fit mobile');
    assert.deepEqual(errors, []);
    console.log(`PASS ${path.basename(browser)}: ${advisorAppointmentMode ? 'advisor mandatory rejection reason' : 'student rejection, cancellation, review save/reload'} and notifications; API writes mocked.`);
  } else if (appaMode) {
    const title = 'Academic Pathway Preference Assessment';
    const fill = (id, value) => evaluate(`(() => {
      const field = document.getElementById(${JSON.stringify(id)});
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value').set.call(field, ${JSON.stringify(value)});
      field.dispatchEvent(new Event(field.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    })()`);
    const mappingId = (question, option) => `aq-questions.${question}.options.${option}.pathway_result`;
    const codes = ['F', 'S', 'D', 'T'];
    const codeFor = (question, option) => codes[(question + option) % codes.length];
    await call('Page.navigate', { url: origin + '/advisor/pathway-quizzes' });
    await until(() => evaluate(`!!document.querySelector('#aq-title')`), 'advisor quiz builder');
    assert.equal(await evaluate(`document.querySelector('.aq-builder').innerText.includes('Answer outcomes')`), false);
    assert.equal(await evaluate(`!!document.querySelector('#advisor-pathway-choices')`), false);
    await fill('aq-title', title);
    await fill('aq-description', 'Explore preferred educational routes.');
    await click('+ Add Question');
    assert.equal(await evaluate(`document.querySelectorAll('.aq-question select').length`), 4);
    assert.deepEqual(await evaluate(`[...document.getElementById('${mappingId(0, 0)}').options].map(option => [option.value, option.text])`),
      [['', 'Select a category'], ['F', 'F — Foundation / Matriculation'], ['S', 'S — Form Six / STPM'], ['D', 'D — Diploma'], ['T', 'T — TVET']]);
    for (let question = 0; question < 10; question++) {
      if (question) await click('+ Add Question');
      await fill(`aq-questions.${question}.question_text`, `Which route appeals to you in situation ${question + 1}?`);
      for (let option = 0; option < 4; option++) {
        await fill(`aq-questions.${question}.options.${option}.option_text`, `Situation ${question + 1}, preference ${option + 1}`);
        if (question !== 9 || option !== 3) await fill(mappingId(question, option), codeFor(question, option));
      }
    }
    await click('Save as Draft');
    await until(() => evaluate(`document.querySelector('.am-feedback.success')?.textContent.includes('Draft saved')`), 'APPA draft persisted');
    const quizId = await evaluate(`Number(document.querySelector('.aq-quiz-list article').id.replace('quiz-', ''))`);
    const advisorQuiz = (id = quizId) => evaluate(`fetch('${draftApiOrigin}/api/quizzes/advisor/11/${id}', {
      headers: {Authorization: 'Bearer ' + localStorage.getItem('scholarone_access_token')}
    }).then(response => response.json()).then(data => data.quiz)`);
    const draft = await advisorQuiz();
    assert.equal(draft.assessment_code, 'APPA-001');
    assert.equal(draft.questions[9].options[3].pathway_result, '');
    await call('Page.reload');
    await until(() => evaluate(`document.querySelector('.aq-quiz-list')?.textContent.includes(${JSON.stringify(title)})`), 'APPA draft visible after refresh');
    await click('Edit Quiz');
    await until(() => evaluate(`document.getElementById('${mappingId(0, 0)}')?.tagName === 'SELECT'`), 'APPA answer dropdown restored');
    const savedCodes = await evaluate(`[...document.querySelectorAll('.aq-questions select')].map(field => field.value)`);
    assert.deepEqual(savedCodes, Array.from({ length: 40 }, (_, index) => index === 39 ? '' : codeFor(Math.floor(index / 4), index % 4)));
    await click('Publish Quiz');
    await until(() => evaluate(`document.getElementById('${mappingId(9, 3)}').getAttribute('aria-invalid') === 'true'`), 'unassigned category blocks publication');
    await fill(mappingId(9, 3), codeFor(9, 3));
    await click('Publish Quiz');
    await until(() => evaluate(`document.querySelector('.am-feedback.success')?.textContent.includes('Quiz published')`), 'complete APPA published');
    const published = await advisorQuiz();
    const ids = quiz => quiz.questions.map(question => [question.question_id, question.options.map(option => option.option_id)]);
    assert.deepEqual(ids(published), ids(draft), 'saving a changed outcome preserves question and option identities and order');

    await call('Page.navigate', { url: origin + '/pathway-quiz' });
    await until(() => evaluate(`document.body.textContent.includes('Take Quiz / View Results')`), 'published APPA available to student');
    await click('Take Quiz / View Results');
    await until(() => evaluate(`document.querySelectorAll('.advisor-quiz-questions input[type=radio]').length === 40`), 'student can answer all ten APPA questions');
    const selectOutcomes = desired => evaluate(`(() => {
      [...document.querySelectorAll('.advisor-quiz-questions > fieldset')].forEach((question, index) => {
        const category = ${JSON.stringify(desired)}[index];
        const offset = ('FSDT'.indexOf(category) - index % 4 + 4) % 4;
        question.querySelectorAll('input')[offset].click();
      });
    })()`);
    const results = () => evaluate(`document.querySelector('.advisor-quiz-result')?.innerText || ''`);
    await selectOutcomes(['F','F','S','D','D','D','D','D','T','T']);
    await click('Submit Quiz and Save Results');
    await until(async () => (await results()).includes('Diploma: 5'), 'student preference frequencies');
    assert.match(await results(), /Primary Pathway Preference\s+Diploma/);
    assert.match(await results(), /Foundation \/ Matriculation: 2[\s\S]*Form Six \/ STPM: 1[\s\S]*TVET: 2/);
    assert.match(await results(), /does not verify admission eligibility/);
    assert.doesNotMatch(await results(), /Related Academic Pathways/);
    await click('Retake Quiz');
    await selectOutcomes(['F','T','F','T','F','T','F','T','F','T']);
    await click('Submit Quiz and Save Results');
    await until(async () => (await results()).includes('Joint Primary Pathway Preferences'), 'joint primary preferences');
    assert.match(await results(), /Foundation \/ Matriculation · TVET/);
    assert.match(await results(), /Form Six \/ STPM: 0[\s\S]*Diploma: 0/);
    await call('Page.reload');
    await until(() => evaluate(`document.body.textContent.includes('View Saved Result')`), 'APPA saved result after reload');
    await click('View Saved Result');
    await until(async () => (await results()).includes('Joint Primary Pathway Preferences'), 'persisted tie after reload');

    await call('Page.navigate', { url: origin + '/advisor/pathway-quizzes' });
    await until(() => evaluate(`!!document.querySelector('#aq-title')`), 'advisor builder after student check');
    const legacy = await evaluate(`(async () => {
      const response = await fetch('${draftApiOrigin}/api/quizzes/advisor/11', {
        method: 'POST',
        headers: {Authorization: 'Bearer ' + localStorage.getItem('scholarone_access_token'), 'Content-Type': 'application/json'},
        body: JSON.stringify({title: 'Legacy pathway quiz', status: 'draft', questions: [{question_text: 'What interests you?',
          options: [{option_text: 'Engineering', pathway_result: 'Engineering degree route'}, {option_text: 'Design', pathway_result: 'Design diploma route'}]}]})
      });
      return {status: response.status, quiz: (await response.json()).quiz};
    })()`);
    assert.equal(legacy.status, 201);
    await call('Page.reload');
    await until(() => evaluate(`!!document.querySelector('#quiz-${legacy.quiz.quiz_id}')`), 'existing legacy quiz listed');
    await evaluate(`[...document.querySelectorAll('#quiz-${legacy.quiz.quiz_id} button')].find(button => button.textContent === 'Edit Quiz').click()`);
    await until(() => evaluate(`document.getElementById('${mappingId(0, 0)}')?.value === 'Engineering degree route'`), 'legacy outcome mapping retained');
    assert.equal(await evaluate(`document.getElementById('${mappingId(0, 0)}').hasAttribute('list')`), false);
    await fill('aq-description', 'Updated legacy description.');
    await click('Save as Draft');
    await until(() => evaluate(`document.querySelector('.am-feedback.success')?.textContent.includes('Draft saved')`), 'existing legacy quiz saved');
    const savedLegacy = await advisorQuiz(legacy.quiz.quiz_id);
    assert.equal(savedLegacy.assessment_code, undefined);
    assert.deepEqual(savedLegacy.questions[0].options.map(option => option.pathway_result), ['Engineering degree route', 'Design diploma route']);
    assert.deepEqual(errors, []);
    console.log('PASS answer-level APPA-001 categories only, draft, publish, scoring, reload and legacy mapping preservation with real Chrome, Flask and isolated PostgreSQL.');
  } else if (realDraftMode) {
    const setField = (selector, value) => evaluate(`(() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value').set.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    })()`);
    await call('Page.navigate', { url: origin + '/advisor/pathway-quizzes' });
    await until(() => evaluate(`!!document.querySelector('.aq-builder select')`), 'assessment builder');
    await setField('.aq-builder select', 'likert');
    await until(() => evaluate(`document.querySelector('.aq-likert-builder select')?.textContent.includes('CIA-001')`), 'authorized template response');
    await setField('#aq-title', 'Career Interest Assessment');
    await setField('#aq-description', 'Disposable browser fixture.');
    for (const [index, category] of ['R', 'I', 'A', 'S', 'E'].entries()) {
      await click('Add category');
      await setField(`.aq-likert-builder > .aq-likert-row:nth-of-type(${index + 1}) label:nth-child(1) input`, category);
      await setField(`.aq-likert-builder > .aq-likert-row:nth-of-type(${index + 1}) label:nth-child(2) input`, category);
    }
    const question = index => `.aq-likert-builder > fieldset:nth-of-type(${index})`;
    const ids = () => evaluate(`[...document.querySelectorAll('.aq-likert-builder > fieldset input[readonly]')].map(input => input.value)`);
    const buttonFollows = index => evaluate(`(() => {
      const panel = document.querySelector('.aq-likert-builder');
      const previous = panel.querySelector('.aq-question-add')?.previousElementSibling;
      return ${index} ? previous === document.querySelector(${JSON.stringify(question(index))}) :
        previous?.textContent === 'Assessment Questions (0)';
    })()`);
    const enterQuestion = async index => {
      await click('+ Add Question');
      await until(() => evaluate(`document.activeElement === document.querySelector(${JSON.stringify(`${question(index)} textarea[lang="en"]`)})`),
        `focus for question ${index}`);
      await setField(`${question(index)} label:nth-last-of-type(2) textarea`, `Fixture question ${index}`);
      await setField(`${question(index)} label:last-of-type textarea`, `Soalan ujian ${index}`);
    };
    assert.equal(await buttonFollows(0), true);
    await enterQuestion(1);
    assert.equal(await buttonFollows(1), true);
    await enterQuestion(2);
    assert.deepEqual(await ids(), ['SOAQ01', 'SOAQ02']);
    await click('Save as Draft');
    await until(() => evaluate(`document.querySelector('.am-feedback.success')?.textContent.includes('Draft saved')`), 'initial draft saved to PostgreSQL');
    await call('Page.reload');
    await until(() => evaluate(`document.querySelector('.aq-quiz-list')?.textContent.includes('Career Interest Assessment')`), 'saved draft visible after refresh');
    await click('Edit Quiz');
    await until(async () => (await ids()).length === 2, 'saved Likert questions reopen');
    assert.deepEqual(await ids(), ['SOAQ01', 'SOAQ02']);
    assert.equal(await evaluate(`document.querySelector('.aq-builder select').value`), 'likert');
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('.aq-likert-builder > fieldset select')].map(select => select.value)`), ['R', 'R']);
    await enterQuestion(3);
    await click('Save as Draft');
    await until(() => evaluate(`document.querySelector('.am-feedback.success')?.textContent.includes('Draft saved')`), 'third question saved');
    assert.deepEqual(await ids(), ['SOAQ01', 'SOAQ02', 'SOAQ03']);

    const quizId = await evaluate(`Number(document.querySelector('.aq-quiz-list article').id.replace('quiz-', ''))`);
    await setField('#aq-description', 'Unsaved first tab edit');
    const status = await evaluate(`(async () => {
      const url = '${draftApiOrigin}/api/quizzes/advisor/11/${quizId}';
      const headers = {Authorization: 'Bearer ' + localStorage.getItem('scholarone_access_token'), 'Content-Type': 'application/json'};
      const {quiz} = await fetch(url, {headers}).then(response => response.json());
      return (await fetch(url, {method:'PUT', headers, body:JSON.stringify({
        title: quiz.title, description:'Second tab edit', status:'draft', revision:quiz.revision,
        assessment_type:'likert', assessment:quiz.assessment
      })})).status;
    })()`);
    assert.equal(status, 200);
    await click('Save as Draft');
    await until(() => evaluate(`document.querySelector('.aq-builder [role=alert]')?.textContent.includes('A newer version')`), 'real optimistic concurrency conflict');
    assert.equal(await evaluate(`document.querySelector('#aq-description').value`), 'Unsaved first tab edit');
    await click('Load latest draft');
    await until(() => evaluate(`document.querySelector('#aq-description').value === 'Second tab edit'`), 'conflict recovery loads latest revision');
    await setField('#aq-description', 'Resolved draft');
    await click('Save as Draft');
    await until(() => evaluate(`document.querySelector('.am-feedback.success')?.textContent.includes('Draft saved')`), 'save after conflict recovery');
    assert.deepEqual(await ids(), ['SOAQ01', 'SOAQ02', 'SOAQ03']);
    for (let index = 4; index <= 27; index++) await click('+ Add Question');
    for (const [index, width] of [[28, 1440], [29, 768], [30, 390]]) {
      await call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
      await enterQuestion(index);
      assert.equal(await buttonFollows(index), true);
      await until(() => evaluate(`(() => {
        const rect = document.activeElement.getBoundingClientRect();
        return rect.top >= 0 && rect.bottom <= innerHeight;
      })()`), `question ${index} scrolls into view at ${width}px`);
    }
    assert.equal(await evaluate(`document.querySelector('.aq-likert-builder fieldset textarea').value`), 'Fixture question 1');
    assert.equal(await evaluate(`document.querySelector('.aq-likert-builder > fieldset:last-of-type input[type=number]').value`), '30');
    assert.deepEqual(errors, []);
    console.log('PASS real browser → Flask → isolated PostgreSQL template loading, Likert draft save and reload, third question and conflict recovery.');
  } else if (likertMode) {
    const fill = (label, value) => evaluate(`(() => {
      const field = [...document.querySelectorAll('label')].find(item => item.textContent.trim().startsWith(${JSON.stringify(label)}));
      const input = field.querySelector('input, textarea, select');
      const prototype = Object.getPrototypeOf(input);
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    })()`);
    await call('Page.navigate', { url: origin + '/advisor/pathway-quizzes' });
    await until(() => evaluate(`!!document.querySelector('.aq-builder select')`), 'assessment type selector');
    await fill('Language', 'both');
    await click('+ Add Question');
    assert.equal(await evaluate(`document.querySelector('.aq-questions').textContent.includes('Question text (Malay)') &&
      document.querySelector('.aq-questions').textContent.includes('Malay translation for answer 1')`), true);
    assert.equal(await evaluate(`document.querySelector('.aq-questions').nextElementSibling.querySelector('button').textContent`), '+ Add Question');
    await fill('Assessment Type', 'likert');
    await until(() => evaluate(`document.querySelector('.aq-builder [role=alert]')?.textContent.includes('temporarily unavailable')`), 'template request failure');
    assert.equal(await evaluate(`!!document.querySelector('.aq-likert-builder select option[value="CIA-001"]')`), false);
    await click('Retry templates');
    await until(() => evaluate(`document.querySelector('.aq-likert-builder')?.textContent.includes('FSI-001')`), 'template choices');
    await click('Add category');
    await click('+ Add Question');
    await click('+ Add Question');
    assert.equal(await evaluate(`document.querySelectorAll('.aq-likert-builder fieldset').length`), 2);
    const displayIds = () => evaluate(`[...document.querySelectorAll('.aq-likert-builder fieldset input[readonly]')]
      .filter(input => input.value.startsWith('SOAQ')).map(input => input.value)`);
    assert.deepEqual(await displayIds(), ['SOAQ01', 'SOAQ02']);
    await click('Remove question');
    await click('+ Add Question');
    assert.deepEqual(await displayIds(), ['SOAQ02', 'SOAQ03']);
    await fill('Question-bank template', 'FSI-001');
    await fill('Description / Purpose', 'Fixture assessment description.');
    assert.doesNotMatch(await evaluate(`document.querySelector('.aq-likert-builder').textContent`), /Assessment Code|Target Student Group/);
    const templateIds = Array.from({ length: 30 }, (_, index) => `SOAQ${String(index + 4).padStart(2, '0')}`);
    assert.deepEqual(await displayIds(), templateIds);
    assert.equal(await evaluate(`document.querySelectorAll('.aq-likert-builder fieldset').length`), 30);
    assert.equal(await evaluate(`document.querySelectorAll('.aq-likert-scale li').length`), 5);
    assert.equal(await evaluate(`document.querySelector('.aq-likert-builder').textContent.includes('Import question bank')`), false);
    for (let index = 0; index < 30; index++) {
      for (const [column, value] of [`Test question ${index + 1}`, `Soalan ujian ${index + 1}`].entries()) {
        await evaluate(`(() => {
          const row = document.querySelectorAll('.aq-likert-builder fieldset')[${index}];
          const input = row.querySelectorAll('textarea')[${column}];
          Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
          input.dispatchEvent(new Event('input', { bubbles: true }));
        })()`);
      }
    }
    assert.equal(await evaluate(`document.querySelector('.aq-builder button[type=submit]').disabled`), true);
    await click('Save as Draft');
    await until(() => evaluate(`document.querySelector('.aq-builder button[type=submit]:enabled') !== null`), 'draft saved before publishing');
    await call('Page.reload');
    await until(() => evaluate(`document.querySelector('.aq-quiz-list button:last-child')?.textContent === 'Edit Quiz'`), 'reloaded quiz list');
    await click('Edit Quiz');
    await until(() => evaluate(`document.querySelector('.aq-likert-builder fieldset textarea')?.value === 'Test question 1'`), 'reopened Likert draft');
    assert.deepEqual(await displayIds(), templateIds);
    assert.deepEqual(await evaluate(`(() => {
      const type = document.querySelector('.aq-builder select');
      const fields = [...document.querySelectorAll('.aq-likert-builder select')];
      return [type.value, type.disabled, fields[1].value, fields[2].value];
    })()`), ['likert', false, 'both', 'interest']);
    await click('Publish Quiz');
    await until(() => likertQuiz?.status === 'published', 'assessment published');
    await call('Page.navigate', { url: origin + '/pathway-quiz' });
    await until(() => evaluate(`document.body.textContent.includes('Take Quiz / View Results')`), 'published Likert assessment offered');
    await click('Take Quiz / View Results');
    await until(() => evaluate(`document.querySelector('.advisor-student-quiz')?.textContent.includes('Question 1 of 30')`), 'assessment progress');
    assert.equal(await evaluate(`document.querySelectorAll('.advisor-quiz-questions input[type=radio]').length`), 5);
    assert.equal(await evaluate(`[...document.querySelectorAll('.advisor-likert-navigation button')].every(button => button.disabled)`), true);
    await fill('Question language', 'ms');
    await until(() => evaluate(`document.querySelector('.advisor-quiz-questions legend')?.textContent === 'Soalan ujian 1'`), 'Malay question');
    assert.match(await evaluate(`document.querySelector('.advisor-quiz-questions').textContent`), /Sangat Suka/);
    for (let i = 1; i <= 30; i++) {
      await evaluate(`document.querySelectorAll('.advisor-quiz-questions input[type=radio]')[4].click()`);
      await click(i === 30 ? 'Submit Assessment and Save Results' : 'Next question');
    }
    await until(() => evaluate(`document.querySelector('.advisor-quiz-result')?.textContent.includes('Top three preferred study fields')`), 'Likert results');
    await call('Page.reload');
    await until(() => evaluate(`document.body.textContent.includes('View Saved Result')`), 'saved result after reload');
    await click('View Saved Result');
    await until(() => evaluate(`document.querySelector('.advisor-quiz-result')?.textContent.includes('25 / 25')`), 'saved category score');
    assert.equal(writeRequests, 3);
    assert.deepEqual(errors, []);
    console.log('PASS Likert manual question entry, draft, publication, bilingual student completion and result reload. APIs mocked.');
  } else if (advisorQuizMode || quizSubmissionsMode) {
    await call('Page.navigate', { url: `${origin}/${quizSubmissionsMode ? 'advisor/pathway-quizzes' : 'pathway-quiz'}` });
    if (quizSubmissionsMode) {
      await until(() => evaluate(`document.body.textContent.includes('View Submissions')`), 'advisor library');
      await click('View Submissions');
      await until(() => evaluate(`document.querySelector('dialog[open]')?.textContent.includes('Test Student')`), 'advisor submissions');
      assert.equal(await evaluate(`document.querySelector('dialog[open]').textContent.includes('Computing')`), true);
      await evaluate(`document.querySelector('dialog[open] summary').click()`);
      assert.equal(await evaluate(`document.querySelector('dialog[open]').textContent.includes('Technical study')`), true);
      assert.equal(writeRequests, 0);
    } else {
      await until(() => evaluate(`document.body.textContent.includes('Take Quiz / View Results')`), 'advisor quiz offered');
      await click('Take Quiz / View Results');
      await until(() => evaluate(`document.querySelectorAll('.advisor-quiz-questions input[type=radio]').length===4`), 'quiz questions');
      await evaluate(`(() => {
        document.querySelector('.advisor-quiz-questions input').click();
        const select = document.querySelector('.advisor-student-quiz select');
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, 'ms');
        select.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
      await until(() => evaluate(`document.querySelector('.advisor-quiz-questions legend').textContent.includes('Pilihan pengajian')`), 'Malay multiple-choice question');
      assert.equal(await evaluate(`document.querySelector('.advisor-quiz-questions').textContent.includes('Pengajian teknikal') &&
        document.querySelector('.advisor-quiz-questions input').checked`), true);
      await click('Submit Quiz and Save Results'); assert.equal(writeRequests, 0, 'Incomplete quiz must not submit');
      await evaluate(`(()=>{const inputs=document.querySelectorAll('.advisor-quiz-questions input[type=radio]');inputs[0].click();inputs[2].click();})()`);
      await click('Submit Quiz and Save Results');
      await until(() => evaluate(`document.querySelector('.advisor-quiz-result')?.textContent.includes('Computing')`), 'saved quiz result');
      await call('Page.reload');
      await until(() => evaluate(`document.body.textContent.includes('View Saved Result')`), 'saved results after reload');
      await click('View Saved Result');
      await until(() => evaluate(`document.querySelector('.advisor-quiz-result')?.textContent.includes('Computing')`), 'restored quiz result');
      assert.ok(await evaluate(`document.querySelector('.advisor-quiz-result a')?.href.includes('/academic-pathways')`));
      await click('Retake Quiz');
      await evaluate(`(()=>{const inputs=document.querySelectorAll('.advisor-quiz-questions input[type=radio]');inputs[1].click();inputs[3].click();})()`);
      await click('Submit Quiz and Save Results');
      await until(() => evaluate(`document.querySelector('.advisor-quiz-result')?.textContent.includes('Business')`), 'different answers produce different result');
      assert.equal(writeRequests, 2);
      await call('Emulation.setDeviceMetricsOverride', { width:390, height:844, deviceScaleFactor:1, mobile:true });
      assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth+1`), true, 'Quiz results fit mobile');
    }
    assert.deepEqual(errors, []);
    console.log(`PASS ${path.basename(browser)}: ${quizSubmissionsMode ? 'advisor submission list and saved answer review' : 'student advisor quiz validation, submit, reload, retake, result links and mobile layout'}; API writes mocked.`);
  } else if (pathwayMode || pathwayAdminMode) {
    const fill = (label, value) => evaluate(`(()=>{const label=[...document.querySelectorAll('label')].find(x=>x.textContent.trim().startsWith(${JSON.stringify(label)}));const input=label.querySelector('input,textarea,select');const prototype=input.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:input.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
    if (pathwayAdminMode) {
      await call('Page.navigate', { url: `${origin}/admin/pathways` });
      await until(() => evaluate(`document.querySelectorAll('.apw-table tbody tr').length===4`), 'admin pathway directory');
      await click('Create Academic Pathway');
      await fill('Pathway Title', 'Browser Created Pathway'); await fill('Field / Discipline', 'Computing'); await fill('Destination Level', 'Undergraduate');
      await fill('Description', 'A conditional study route.'); await fill('Career goal', 'Explore computing careers'); await fill('Starting Qualifications', 'Diploma');
      await fill('Entry Requirements', 'Verify current entry grades with the institution.'); await fill('Next Steps', 'Contact the admissions office.');
      await fill('Publication Status', 'active');
      for (let i = 0; i < 2; i++) {
        for (const [j, value] of [`Stage ${i + 1}`, i ? 'Undergraduate' : 'Diploma', 'Refer to provider', 'Confirm recognition and entry conditions.'].entries()) {
          await evaluate(`(()=>{const input=document.querySelectorAll('.pathway-editor-stage')[${i}].querySelectorAll('input')[${j}];Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
        }
      }
      await fill('Official URL', 'https://www.mqa.gov.my/new/mqf.cfm');
      await click('Save Pathway'); await until(() => writeRequests === 1, 'admin create');
      await until(() => evaluate(`document.querySelector('.apw-table')?.textContent.includes('Browser Created Pathway')`), 'created pathway in directory');
      await evaluate(`(()=>{const row=[...document.querySelectorAll('.apw-table tbody tr')].find(x=>x.textContent.includes('Browser Created Pathway'));[...row.querySelectorAll('button')].find(x=>x.textContent==='Edit').click();})()`);
      await until(() => evaluate(`!!document.querySelector('dialog[open] input[value="Browser Created Pathway"]')`), 'loaded admin editor');
      assert.equal(await evaluate(`[...document.querySelectorAll('dialog[open] textarea')].some(el=>el.value==='Explore computing careers')`),true);
      await fill('Pathway Title', 'Browser Updated Pathway'); await click('Save Pathway');
      await until(() => writeRequests === 2, 'admin update');
      await until(() => evaluate(`document.querySelector('.apw-table')?.textContent.includes('Browser Updated Pathway')`), 'updated directory');
      await evaluate(`(()=>{const row=[...document.querySelectorAll('.apw-table tbody tr')].find(x=>x.textContent.includes('Browser Updated Pathway'));[...row.querySelectorAll('button')].find(x=>x.textContent==='Delete').click();})()`);
      await until(() => writeRequests === 3, 'admin delete');
      await until(() => evaluate(`!document.querySelector('.apw-table')?.textContent.includes('Browser Updated Pathway')`), 'deleted pathway removed');
    } else {
      await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
      await call('Page.navigate', { url: `${origin}/pathway-quiz` });
      await until(() => evaluate(`!!document.querySelector('.spq-hero-art image')`), 'Pathway Quiz reference hero');
      await evaluate(`Promise.all([document.fonts.ready, new Promise(resolve => {
        const image = new Image();
        image.onload = resolve;
        image.onerror = resolve;
        image.src = document.querySelector('.spq-hero-art image').getAttribute('href');
      })]).then(() => true)`);
      const quizScreenshot = await call('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(artifacts, 'pathway-quiz-reference.png'), Buffer.from(quizScreenshot.data, 'base64'));
      await call('Page.navigate', { url: `${origin}/academic-pathways` });
      await until(() => evaluate(`document.querySelector('.academic-pathway-catalogue')?.textContent.includes('7 of 7 pathways')`), 'student catalogue');
      assert.equal(await evaluate(`(() => {
        const page = document.querySelector('.academic-pathways-page');
        return page.firstElementChild.classList.contains('academic-pathway-intro') &&
          page.querySelector('.academic-pathway-intro h1').textContent === 'Academic Pathways' &&
          page.querySelector('.academic-pathway-hero-badge svg') &&
          page.querySelector('.academic-pathway-hero-copy p').textContent === 'Explore qualifications, discover study routes, and plan your next academic journey.' &&
          page.firstElementChild.nextElementSibling.classList.contains('academic-pathway-catalogue');
      })()`), true, 'The hero stays above the catalogue');
      await until(() => evaluate(`(() => {
        const images = [...document.querySelectorAll('.academic-pathway-hero-art img')];
        return images.length === 2 && images.every(image => image.complete && image.naturalWidth > 0);
      })()`), 'campus and books actually load');
      await click('Explore Pathways');
      await until(() => evaluate(`(() => {
        const catalogue = document.querySelector('.academic-pathway-catalogue');
        return document.activeElement === catalogue && catalogue.getBoundingClientRect().top < 40 &&
          catalogue.getBoundingClientRect().top >= 0 && location.pathname === '/academic-pathways';
      })()`), 'Explore Pathways scrolls to and focuses the existing catalogue');
      const cards = await evaluate(`[...document.querySelectorAll('.academic-pathway-catalogue .academic-pathway-card')]
        .map(card => [card.querySelector('h3').innerText, card.querySelector('.pathway-tag').innerText, card.querySelector('p').innerText])`);
      assert.deepEqual(cards, pathwayRecords.map(row => [row.title, `${row.field} · ${row.level}`, row.description]));
      assert.equal(await evaluate(`!!document.querySelector('.pathway-flow')`), false);
      await evaluate(`document.querySelector('.academic-pathway-recommendations summary').click()`);
      assert.equal(await evaluate(`document.querySelector('.academic-pathway-recommendations[open]').innerText.includes('saved Investigative interests')`), true);
      await evaluate(`document.querySelector('.academic-pathway-recommendations summary').click()`);
      await fill('Search pathways', 'software');
      await until(() => evaluate(`document.querySelector('.academic-pathway-catalogue')?.textContent.includes('1 of 7 pathways')`), 'pathway search');
      await fill('Field', 'Computing'); await fill('Destination level', 'Undergraduate');
      await fill('Search pathways', 'missing');
      await until(() => evaluate(`document.body.textContent.includes('No pathways match your filters.')`), 'pathway no-match state');
      await click('Clear Filters');
      for (const [index, row] of pathwayRecords.entries()) {
        await evaluate(`document.querySelectorAll('.academic-pathway-catalogue .academic-pathway-card button')[${index}].click()`);
        await until(() => evaluate(`document.querySelector('dialog[open] h2')?.textContent === ${JSON.stringify(row.title)}`), `details for ${row.title}`);
        assert.equal(await evaluate(`document.querySelectorAll('dialog[open] .pathway-stages li').length`), row.guidance.stages.length);
        assert.equal(await evaluate(`document.querySelector('dialog[open]').textContent.includes('Your Next Steps')`), true);
        assert.equal(await evaluate(`document.querySelector('dialog[open] a')?.href.startsWith('https://')`), true);
        await evaluate(`document.querySelector('dialog[open] button[aria-label="Close pathway details"]').click()`);
      }
      for (const width of [1440, 768, 390]) {
        await call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
        assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth + 1 &&
          [...document.querySelectorAll('.academic-pathway-card')].every(card => card.scrollWidth <= card.clientWidth + 1)`), true, `Pathways fit ${width}px`);
        assert.equal(await evaluate(`(() => {
          const copy = document.querySelector('.academic-pathway-hero-copy').getBoundingClientRect();
          const art = document.querySelector('.academic-pathway-hero-art').getBoundingClientRect();
          const hero = document.querySelector('.academic-pathway-intro').getBoundingClientRect();
          return art.width > 200 && art.right <= hero.right &&
            (${width} === 390 ? art.top >= copy.bottom : art.left >= copy.right - 1);
        })()`), true, `Illustration fits and follows the hero layout at ${width}px`);
        if (width === 1440 || width === 390) {
          const columns = await evaluate(`getComputedStyle(document.querySelector('.academic-pathway-catalogue .academic-pathway-grid'))
            .gridTemplateColumns.split(' ').length`);
          assert.equal(columns, width === 1440 ? 3 : 1, `Original card columns at ${width}px`);
          await evaluate(width === 390 ? "document.querySelector('.academic-pathway-intro').scrollIntoView({behavior:'instant'})" : "window.scrollTo({top:0,behavior:'instant'})");
          const screenshot = await call('Page.captureScreenshot', { format: 'png' });
          await writeFile(path.join(artifacts, `pathway-catalogue-${width}.png`), Buffer.from(screenshot.data, 'base64'));
        }
      }
      console.log(`Screenshots: ${artifacts}`);
      assert.equal(writeRequests, 0);
    }
    assert.deepEqual(errors, []);
    console.log(`PASS ${path.basename(browser)}: ${pathwayAdminMode ? 'admin create/edit/delete' : 'pathway search, filters, assessment reasons, progression, next steps and mobile layout'}; all API responses mocked.`);
  } else if (providerSettingsMode) {
    for (const [plan,expected] of [['Free','Free Plan'],['Professional','Professional Plan'],[null,'Free Plan'],['University Plan','University Plan']]) {
      settingsPlan = plan;
      await call('Page.navigate', {url: origin+'/sponsor/settings'});
      await until(() => evaluate(`document.querySelector('.sponsor-settings-security-panel .sponsor-security-list > div:last-child strong')?.textContent === ${JSON.stringify(expected)}`), expected);
    }
    assert.deepEqual(errors, []);
    console.log('PASS provider settings renders current plan, custom name, and no active subscription across page loads; APIs mocked.');
  } else if (providerMode) {
    await call('Page.navigate', { url: `${origin}/sponsor/scholarships` });
    await until(() => evaluate(`!!document.querySelector('a[href="/sponsor/add-scholarship?edit=1"]')`), 'provider edit action');
    await evaluate(`document.querySelector('a[href="/sponsor/add-scholarship?edit=1"]').click()`);
    await until(() => evaluate(`document.querySelector('input[name="title"]')?.value==='Scholarship Example' && !document.querySelector('fieldset').disabled`), 'loaded edit form');
    assert.equal(await evaluate(`document.querySelector('input[name="opening_date"]').value`),'2099-10-01');
    await evaluate(`(()=>{const x=document.querySelector('input[name="title"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(x,'Edited Award');x.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth + 1`), true, 'Mobile provider form fits viewport');
    const screenshot = await call('Page.captureScreenshot', { format: 'png' });
    await writeFile(path.join(artifacts, 'provider-edit-mobile.png'), Buffer.from(screenshot.data, 'base64'));
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await click('Submit Changes for Review');
    await until(() => evaluate(`document.body.textContent.includes('Review Your Scholarship')`), 'edit review');
    await click('Confirm Submission');
    await until(() => writeRequests === 1, 'mock update');
    assert.equal(providerListing.title, 'Edited Award'); assert.equal(providerListing.status, 'pending');
    assert.equal(providerListing.opening_date, '2099-10-01');
    assert.equal(providerListing.eligibility_criteria, 'Minimum CGPA: 3.20 unless specified otherwise.');
    assert.match(providerListing.description, /Repay after graduation/);
    await evaluate(`[...document.querySelectorAll('a')].find(x=>x.textContent==='View My Scholarships').click()`);
    await until(() => evaluate(`document.querySelector('.sponsor-scholarship-card h3')?.textContent==='Edited Award'`), 'updated provider directory');
    await click('Delete Listing'); await click('Cancel');
    assert.equal(removed, false, 'Cancel must not delete');
    await click('Delete Listing'); await click('Confirm Delete');
    await until(() => evaluate(`document.body.textContent.includes('No scholarship listings yet.')`), 'deleted provider listing');
    await call('Page.navigate', { url: `${origin}/sponsor/add-scholarship` });
    await until(() => evaluate(`!!document.querySelector('textarea[name="repayment_conditions"]')`), 'optional provider creation fields');
    assert.equal(await evaluate(`['funding_details', 'residency_requirements', 'application_method', 'repayment_conditions', 'additional_information']
      .every(name => document.querySelector('textarea[name="' + name + '"]')?.required === false)`), true);
    assert.equal(writeRequests, 2); assert.deepEqual(errors, []);
    console.log(`PASS ${path.basename(browser)}: provider edit loading, mobile layout, review, pending state, delete cancellation and confirmed deletion; all API writes mocked.`);
  } else {
  await navigate(); await count(5);
  for (const value of ['scholarship', 'education-loan', 'financial-assistance', 'special-assistance', 'one-off-assistance']) { await select(0, value); await count(1); }
  await select(1, 'Diploma'); await select(2, 'Johor'); await count(1);
  await select(2, 'Sabah'); await count(0);
  assert.equal(await evaluate(`document.body.textContent.includes('No scholarships found')`), true);
  await click('Clear Filters'); await count(5);
  await navigate('?q=%20eDuCaTiOn%20'); await count(1);
  await navigate('?q=nonexistent'); await count(0);
  await click('Clear Filters'); await count(5);
  await navigate('?view=saved'); await count(1);
  await navigate(); await count(5);
  const favourite = (action, id) => `document.querySelector(${JSON.stringify(`[aria-label="${action} ${fixtures[id - 1].title}"]`)})`;
  await until(() => evaluate(`!${favourite('Save', 2)}?.disabled && !!${favourite('Save', 2)}`), 'favourites loaded');
  await evaluate(`${favourite('Save', 2)}.click()`);
  await until(() => evaluate(`!!${favourite('Remove', 2)}`), 'favourite added');
  await navigate('?view=saved'); await count(2);
  await evaluate(`${favourite('Remove', 2)}.click()`);
  await count(1);
  await navigate('?view=saved'); await count(1);
  assert.deepEqual(await cardTitles(), [fixtures[0].title], 'Favourite removal survives reload');
  assert.deepEqual(favouriteWrites, [['POST', 2], ['DELETE', 2]]);

  delaySaved = true;
  await navigate(); await count(5);
  assert.equal(await evaluate(`${favourite('Save', 2)}?.disabled`), true, 'Catalogue renders before favourites finish');
  await until(() => evaluate(`${favourite('Save', 2)}?.disabled === false`), 'delayed favourites loaded');
  delaySaved = false;
  failSaved = true;
  await navigate(); await count(5);
  await until(() => evaluate(`document.body.textContent.includes('Unable to load your favourites')`), 'favourites failure notice');
  await select(0, 'education-loan'); await count(1);
  await navigate('?view=saved');
  await until(() => evaluate(`document.body.textContent.includes('Unable to load your favourites')`), 'saved view failure notice');
  assert.equal(await evaluate(`document.body.textContent.includes('No saved scholarships yet')`), false);
  failSaved = false;
  failApplications = true;
  await navigate(); await count(5);
  await until(() => evaluate(`document.body.textContent.includes('Unable to load your application history')`), 'application history failure notice');
  await until(() => evaluate(`!!${favourite('Remove', 1)}`), 'favourites still loaded');
  failApplications = false;
  failCatalogue = true;
  await call('Page.navigate', { url: `${origin}/scholarships?view=applications` });
  await until(() => evaluate(`document.querySelector('section[aria-labelledby="scholarship-history-heading"]')?.textContent.includes('Unpublished Award')`), 'unpublished application history with catalogue offline');
  assert.equal(await evaluate(`document.querySelector('section[aria-labelledby="scholarship-history-heading"]').textContent.includes('Listing currently unavailable')`), true);
  assert.equal(await evaluate(`document.querySelector('section[aria-labelledby="scholarship-history-heading"]').textContent.includes('Pending · Application #23')`), true);
  failCatalogue = false;
  await navigate(); await count(5);
  // Sort by name so the first details button consistently targets scholarship 1.
  await evaluate(`(()=>{const s=document.querySelector('.sh-results-bar select');s.value='title';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  // Target the Scholarship Example card by title for stale-data scenarios.
  const openId = id => evaluate(`(()=>{const title=${JSON.stringify(fixtures[id - 1].title)};const heading=[...document.querySelectorAll('.scholarship-grid h3')].find(x=>x.textContent===title);const card=heading.closest('article');[...card.querySelectorAll('button')].find(x=>/View full details/i.test(x.textContent)).click();})()`);
  await openId(1); await until(async () => (await modalText()).includes('Fresh description 1'), 'fresh details');
  assert.match(await modalText(), /Application opening date.*1 Oct 2099/s);
  assert.match(await modalText(), /11:30:00.*Malaysia time/);
  await click('Check My Eligibility');
  await until(() => evaluate(`document.querySelector('.eligibility-check h4')?.textContent==='Needs verification'`), 'missing eligibility data is unknown');
  await evaluate(`(()=>{const s=document.querySelector('.eligibility-check select[name="residency_state"]');s.value='Sabah';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  assert.equal(await evaluate(`!!document.querySelector('.eligibility-check h4')`), false, 'Changing context clears old results');
  await click('Check My Eligibility');
  await until(() => evaluate(`document.querySelector('.eligibility-check h4')?.textContent==='Some requirements do not match'`), 'mismatch with reason');
  assert.ok((await modalText()).includes('Sabah does not match Johor.')); await close();
  detailMode = 'failure'; await openId(1);
  await until(() => evaluate(`document.body.textContent.includes('Unable to load current scholarship details')`), 'network failure notice');
  assert.equal(await modalText(), '', 'Do not show cached details on failure');
  detailMode = 'closed'; await openId(1);
  await until(() => evaluate(`!![...document.querySelectorAll('button')].find(x=>x.textContent==='Applications Closed' && x.disabled)`), 'closed application button'); await close();
  detailMode = 'fresh'; delayFirst = true; await openId(1); await openId(2);
  await until(async () => (await modalText()).includes('Fresh description 2'), 'latest click wins'); await sleep(850);
  assert.doesNotMatch(await modalText(), /Application opening date/);
  assert.ok((await modalText()).includes('Fresh description 2')); await close(); delayFirst = false;
  detailMode = 'removed'; const before = listRequests; await openId(1);
  await count(4); await until(() => listRequests > before, 'refresh after 404');
  await until(() => evaluate(`!document.body.textContent.includes('Checking current scholarship details')`), 'catalogue refresh finished');
  assert.ok(!(await cardTitles()).includes(fixtures[0].title), 'A stale catalogue response cannot restore the unavailable listing');
  assert.equal(await modalText(), '');
  await navigate(); await count(5); detailMode = 'gone'; refreshFails = true; await openId(1);
  await count(4); assert.equal(await modalText(), '', '410 stays removed even when list refresh fails');
  await navigate(); await count(5);
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth + 1`), true, 'Mobile page should not overflow horizontally');
  await openId(1); await until(async () => (await modalText()).includes('Fresh description 1'), 'mobile modal');
  assert.equal(await evaluate(`(()=>{const r=document.querySelector('.scholarship-detail-modal').getBoundingClientRect();return r.left>=0 && r.right<=innerWidth+1;})()`), true);
  const screenshot = await call('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(artifacts, 'mobile-details.png'), Buffer.from(screenshot.data, 'base64'));
  assert.equal(writeRequests, 0, 'Tests must not submit any writes');
  assert.deepEqual(errors, [], 'No unhandled browser exceptions');
  console.log(`PASS ${path.basename(browser)}: filters, search, favourite save/remove and reload, independent catalogue loading, fresh/closed/404/410/failed/racing details, mobile layout; API calls mocked.`);
  console.log(`Screenshot: ${path.join(artifacts, 'mobile-details.png')}`);
  }
} finally {
  commandPipe.end();
  child.kill();
}
