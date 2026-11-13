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
