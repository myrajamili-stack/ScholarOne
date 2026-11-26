# ScholarOne

## Run locally

Start the backend and frontend in separate terminals:

```sh
cd backend
venv/bin/python app.py
```

```sh
cd frontend
npm run dev
```

The backend defaults to `http://127.0.0.1:5001` because macOS AirPlay commonly occupies port 5000. Set `VITE_API_URL=http://127.0.0.1:5001/api` in `frontend/.env`. If overriding the backend `PORT`, update `VITE_API_URL` to match and restart Vite.

## Advisor schedules and appointments

Advisors can edit **My Schedule**, toggle weekly consultation days, choose a session length and start/end times from dropdowns, and add or remove blocked dates. **Save Availability** publishes the changes to students. Schedules persist in PostgreSQL; new advisors remain unavailable until they save their hours. Schedule changes preserve existing appointments.

Students open **Appointments**, choose **View Availability**, select a date within the next 90 days, and request a slot using the advisor’s selected session length. Pending and confirmed bookings reserve the slot; cancelling releases it. Advisors can view and manage bookings in the **My Schedule** weekly calendar or their **Appointments** page. Students can see appointment statuses under **My Appointments** and refresh availability to check recent changes.

All consultation hours use **Asia/Kuala_Lumpur (UTC+08:00)**. Both roles must sign in to use these features. Sessions created before access tokens were introduced require signing in again.

For a new database installation, run this once using the database configured in `backend/.env`:

```sh
cd backend
venv/bin/python scripts/enable_advisor_scheduling.py
venv/bin/python scripts/enable_advisor_profiles.py
venv/bin/python scripts/enable_schedule_management.py
venv/bin/python scripts/enable_quiz_builder.py
```

The migration creates `advisor_schedule` and supplies automatic appointment IDs when the existing table has no identity/default. It preserves existing schedules and appointments and can be rerun safely. Configure a stable `SECRET_KEY` in the backend environment to preserve login tokens across server restarts.

Validation:

```sh
backend/venv/bin/python -m unittest discover -s backend/tests
cd frontend
npm run build
```

Advisor profiles support saved contact details, institution, professional title, biography, specialization, qualifications, and experience. The profile migration adds the three new professional fields without replacing existing data. Profile updates require the advisor's own signed session and validate field lengths, phone numbers, email uniqueness, HTTP(S) photo URLs, and whole-number experience (0–60). The student advisor directory reads the same saved details. Ratings and student totals come from existing records; no credential-verification status is assumed.

Advisor profile photos can be selected from the device photo library or files using **Choose Photo** or the camera button. JPG, PNG, and WebP files up to 5 MB / 25 megapixels are checked by the server and saved immediately, independently of other profile fields. Photos are resized to at most 1024 pixels, stripped of metadata, and stored as JPEGs in `backend/instance/profile_photos` (excluded from Git). Keep this directory on persistent storage when deploying; `PROFILE_PHOTO_DIR` in Flask configuration can override its location. Run `venv/bin/python -m pip install -r requirements.txt` when setting up the backend. Availability is managed on **My Schedule**, and My Profile contains About Me, Expertise, and Qualifications.

The advisor **My Schedule** page includes a weekly/work-week calendar, weekly availability overview, session settings, recurring daily breaks, and blocked dates. The calendar and summary show published settings; draft edits are marked until **Save Availability** succeeds. Daily breaks exclude overlapping student booking slots. **Appointments** supports name/topic search, status and date filters, sorting, selection of booking details, confirmation, completion, cancellation, and rescheduling. Rescheduling checks both participants for conflicts, uses the saved consultation hours, breaks, and blocked dates, preserves the booked duration and status, and updates the student's appointment record. Students can include a consultation topic (100 characters) and message (1000 characters) when booking. Existing appointments without these fields show a generic consultation label and no message. The schedule-management migration adds these fields and daily breaks without replacing existing records.

The advisor **Students** page uses the same sidebar as the other advisor pages and lists only students with bookings under the signed-in advisor. It supports name/email/ID search, consultation filters, sortable columns, five-row pagination, student details, and insights from saved education and CGPA data. Active/completed consultation summaries count appointment records; total students counts distinct guided students. **Send Message** opens the selected student's conversation without sending a message, and **View Consultation History** filters appointments to that student. **Schedule Consultation** creates a confirmed booking only for an active guided student, checks both participants' availability/conflicts, and respects published working hours, session length, breaks, and blocked dates. New bookings appear in the student's My Appointments. No additional database migration is needed beyond the existing scheduling migrations.

## Scholarship reminder delivery

For a small deployment, use the host's existing scheduler to run `--once` every five minutes. Run it under the backend service account with the same private database configuration. On a Linux host with cron, adapt these absolute paths and create the private log directory before installing the entry:

```cron
*/5 * * * * umask 077 && cd /srv/scholarone/backend && PGCONNECT_TIMEOUT=10 /srv/scholarone/backend/.venv/bin/python -B scripts/deliver_reminders.py --once >> "$HOME/scholarone-logs/reminders.log" 2>&1
```

Keep the backend's existing environment file private, or inject `DATABASE_URL` through the host's secret configuration. On a Windows host that remains online, use Task Scheduler with the backend directory as **Start in**, the virtual environment's Python as **Program**, and `-B scripts/deliver_reminders.py --once` as arguments. Use a private wrapper to append stdout and stderr to a log, preserve the exit code, and configure the task to run every five minutes even when the operator is signed out. Choose the host that actually stays online. If the host already supervises background workers, `--watch` is also supported. The web process does not start a worker automatically.

Rotate the log using the host's existing tooling. Each run records an ISO UTC timestamp and `success delivered=N`, `overlap_skipped`, or `failure attempts=3`. Find the latest successful scan by searching for `scholarship_reminders success`. A skipped run means another scheduled worker already holds the database lock. A failure exits nonzero in `--once` mode after bounded retries and includes no record data or database connection details. Verify that a healthy run appears within two scheduling intervals after activation.

Reminders use Malaysia calendar dates and are generated from three days before the published deadline until it closes. A changed date or exact time is eligible for a new reminder when the updated deadline enters that window. Historical inbox notifications retain the deadline that triggered them. Delivery uses the existing scholarship reminder table and notification event-key migration. Student appointment and quiz-result preferences use the existing student notification preference migration. There is no new Phase 2 migration.

## Production API security

Set `SCHOLARONE_ENV=production`, an explicit HTTPS origin in `CORS_ALLOWED_ORIGINS` (comma-separated for multiple origins), and a stable randomly generated `SECRET_KEY` shared across API instances. `FRONTEND_URL` is the fallback allowed origin. Serve the API over HTTPS and keep Flask debugging disabled.

Apply [the login rate-limit migration](backend/migrations/20261124_login_rate_limit.sql) before enabling production mode and [the platform configuration access migration](backend/migrations/20261124090100_platform_configuration_access.sql) before using Admin Settings in any environment. Admin Settings expects the table to exist and does not create it at request time. The Flask database role needs access to both tables under the deployment's grants and RLS configuration. Production login limits are shared across workers, while local development uses an in-memory limit. Set `TRUSTED_PROXY_HOPS` only when the API is reachable solely through the specified number of trusted forwarding proxies. Leave it at zero for direct connections.

For shared Supabase, run the three Phase 1 migrations only after approval. Run each file in a session targeting the `public` schema. They are transactional and use a five-second lock timeout so a busy table causes the migration to fail instead of waiting indefinitely.

- `platform_configuration`: enables RLS and revokes table and column grants from `PUBLIC`, `anon` and `authenticated`. Flask needs SELECT, INSERT and UPDATE for Admin Settings. Check that the backend role owns the table or has the necessary grants and bypasses RLS. Stop and review a server-role-only policy if the deployment uses a non-owner role without bypass. Browser access is intentionally removed.
- `login_rate_limit`: creates a protected table and window index. Flask needs SELECT, INSERT, UPDATE and DELETE for reservation and cleanup. Production authentication returns a generic retryable error if its database limiter is unavailable.
- `student.academic_qualifications`: adds an object-valued JSONB column with an empty-object default. The migration does not update the existing profile columns. It takes a brief table lock. If the column already exists, verify its type, default, nullability and constraint before assuming it matches.

Run these read-only checks after applying the approved migrations. For both protected tables, expect RLS enabled and false for browser table and column data access. Execute the backend privilege query using the Flask database role, since an administrator session may have different access.

```sql
SELECT n.nspname, c.relname, c.relrowsecurity, r.rolname,
       has_any_column_privilege(r.oid, c.oid, 'SELECT, INSERT, UPDATE, REFERENCES') AS column_access,
       has_table_privilege(r.oid, c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') AS table_access
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN pg_roles r
WHERE n.nspname = 'public'
  AND c.relname IN ('platform_configuration', 'login_rate_limit')
  AND r.rolname IN ('anon', 'authenticated');

SELECT current_user, rolbypassrls,
       has_table_privilege(current_user, 'public.platform_configuration', 'SELECT')
       AND has_table_privilege(current_user, 'public.platform_configuration', 'INSERT')
       AND has_table_privilege(current_user, 'public.platform_configuration', 'UPDATE') AS settings_access,
       has_table_privilege(current_user, 'public.login_rate_limit', 'SELECT')
       AND has_table_privilege(current_user, 'public.login_rate_limit', 'INSERT')
       AND has_table_privilege(current_user, 'public.login_rate_limit', 'UPDATE')
       AND has_table_privilege(current_user, 'public.login_rate_limit', 'DELETE') AS limiter_access
FROM pg_roles WHERE rolname = current_user;

SELECT to_regclass('public.login_rate_limit_window_idx') AS rate_limit_index;

SELECT data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'student' AND column_name = 'academic_qualifications';

SELECT pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.student'::regclass AND contype = 'c'
  AND pg_get_constraintdef(oid) LIKE '%academic_qualifications%';
```

Then verify the authenticated Admin Settings read path. On disposable staging, verify the admin settings upsert, shared login throttling and account restrictions, and qualification save, reload, re-login and eligibility matching. Shared write smoke tests require separate authorization.

## Student academic qualifications

The [academic qualifications migration](backend/migrations/20261124090200_student_academic_qualifications.sql) adds one JSONB column to the student table. Its default is an empty object. Existing education level, CGPA, field of study, and university values are preserved. Each completed qualification is stored separately by type. An edit to one qualification keeps the other records intact. Profile reads and legacy profile saves work before the migration. Saving new qualification records requires the column.

For a listing with published qualification-specific requirements, the provider API accepts an `academic_requirements` object. For example, `{"qualification":"spm","subject_minimums":{"Mathematics":"B+"},"minimum_as":3}` compares stored SPM grades. A diploma rule can specify `minimum_cgpa` and `fields_of_study`. IGCSE and O-Level subject requirements must name the exact `grading_scale` (`igcse_letters`, `igcse_numeric`, or `o_level`). The system keeps missing results and incompatible scales unverified.
