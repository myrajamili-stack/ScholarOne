import Icon from "../../components/advisor/AdvisorIcon";
import AppointmentArtwork from "../../components/student/AppointmentArtwork";
import "../../styles/student-appointments.css";
import ProfileAvatar from "../../components/advisor/ProfileAvatar";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../../api/axios";
import { getApiErrorMessage } from "../../utils/apiError";

type Advisor = {
  advisor_id: number;
  profile_picture?: string | null;
  full_name: string;
  institution?: string | null;
  professional_title?: string | null;
  bio?: string | null;
  specialization?: string | null;
  qualification?: string | null;
  experience_years?: number | null;
  average_rating?: number | string | null;
};
type Availability = {
  date: string;
  searched_next: boolean;
  slot_minutes: number;
  published: boolean;
  availability: Array<{ day: string; enabled: boolean; start_time: string; end_time: string }>;
  blocked_dates: Array<{ date: string; reason: string }>;
  daily_breaks?: Array<{start_time:string;end_time:string}>;
  slots: string[];
};
type Appointment = {
  appointment_id: number;
  advisor_name: string;
  duration_minutes: number;
  appointment_datetime: string | null;
  appointment_status: string;
};

function malaysiaDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function formatAppointment(value: string) {
  return new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function AppointmentsPage() {
  const [searchParams] = useSearchParams();
  const requestedAdvisorId = Number(searchParams.get("advisor"));
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedAdvisor, setSelectedAdvisor] = useState<Advisor | null>(null);
  const [date, setDate] = useState(malaysiaDate);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotError, setSlotError] = useState("");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [topic, setTopic] = useState("");
  const [studentMessage, setStudentMessage] = useState("");
  const [bookingError, setBookingError] = useState("");
  const [booking, setBooking] = useState(false);
  const [message, setMessage] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [findNext, setFindNext] = useState(false);
  const bookingPanel = useRef<HTMLElement>(null);
  const advisorList = useRef<HTMLElement>(null);
  const appointmentHistory = useRef<HTMLElement>(null);
  const detailsDialog = useRef<HTMLDialogElement>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [now, setNow] = useState(() => new Date());

  function beginBooking() {
    const target = selectedAdvisor ? bookingPanel.current : advisorList.current;
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
    target?.focus({ preventScroll: true });
  }

  function viewHistory() {
    appointmentHistory.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    appointmentHistory.current?.focus({ preventScroll: true });
  }

  useEffect(() => {
    if (selectedAdvisor) {
      bookingPanel.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      bookingPanel.current?.focus({ preventScroll: true });
    }
  }, [selectedAdvisor]);

  function chooseAdvisor(advisor: Advisor, startBooking: boolean) {
    setSelectedAdvisor(advisor);
    setTopic("");
    setStudentMessage("");
    setDate(malaysiaDate());
    setFindNext(startBooking);
    setAvailability(null);
    setSelectedSlot("");
    setBookingError("");
    setMessage("");
    setRefresh((value) => value + 1);
    bookingPanel.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    bookingPanel.current?.focus({ preventScroll: true });
  }

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [advisorResponse, appointmentResponse] = await Promise.all([
          api.get<Advisor[]>("/advisors"), api.get<Appointment[]>("/advisors/my-appointments"),
        ]);
        if (active) {
          setAdvisors(advisorResponse.data);
          const requestedAdvisor = advisorResponse.data.find((advisor) => advisor.advisor_id === requestedAdvisorId);
          if (requestedAdvisor) {
            setSelectedAdvisor(requestedAdvisor);
            setDate(malaysiaDate());
            setFindNext(true);
          }
          setAppointments(appointmentResponse.data);
        }
      } catch (error) {
        if (active) setError(getApiErrorMessage(error, "Unable to load appointments."));
      } finally {
        if (active) setIsLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [requestedAdvisorId]);

  useEffect(() => {
    if (!selectedAdvisor) return;
    const controller = new AbortController();
    async function load() {
      setLoadingSlots(true);
      setSlotError("");
      try {
        const response = await api.get<Availability>(`/advisors/${selectedAdvisor!.advisor_id}/availability`, {
          params: { date, find_next: findNext }, signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setAvailability(response.data);
          setSelectedSlot((current) => response.data.slots.includes(current) ? current : "");
        }
      } catch (error) {
        if (!controller.signal.aborted) setSlotError(getApiErrorMessage(error, "Unable to load availability."));
      } finally {
        if (!controller.signal.aborted) setLoadingSlots(false);
      }
    }
    load();
    return () => controller.abort();
  }, [selectedAdvisor, date, findNext, refresh]);

  // Recheck saved hours and appointment statuses when the student returns to the page.
  useEffect(() => {
    function onFocus() {
      setNow(new Date());
      setRefresh((value) => value + 1);
      api.get<Appointment[]>("/advisors/my-appointments").then((response) => setAppointments(response.data)).catch(() => {});
    }
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, []);

  async function bookAppointment() {
    if (!selectedAdvisor || !availability?.slots.includes(selectedSlot) || booking || loadingSlots || slotError) return;
    setBooking(true);
    setBookingError("");
    setSlotError("");
    setMessage("");
    try {
      const response = await api.post<Omit<Appointment, "advisor_name">>(`/advisors/${selectedAdvisor.advisor_id}/appointments`, {
        appointment_datetime: selectedSlot,
        slot_minutes: availability.slot_minutes,
        consultation_topic: topic.trim(), student_message: studentMessage.trim(),
      });
      const savedAppointment = { ...response.data, advisor_name: selectedAdvisor.full_name };
      setAppointments((current) => [savedAppointment, ...current.filter((item) => item.appointment_id !== savedAppointment.appointment_id)]);
      setSelectedSlot("");
      setMessage(`Appointment booked with ${selectedAdvisor.full_name} for ${formatAppointment(savedAppointment.appointment_datetime!)}. Status is pending advisor approval.`);
      try {
        const response = await api.get<Appointment[]>("/advisors/my-appointments");
        setAppointments(response.data);
      } catch {
        // The successful booking response already supplies the saved appointment.
      }
    } catch (error) {
      setBookingError(getApiErrorMessage(error, "Unable to request appointment."));
    } finally {
      setBooking(false);
      setRefresh((value) => value + 1);
    }
  }

  const upcoming = appointments.filter((appointment) => appointment.appointment_datetime &&
    new Date(appointment.appointment_datetime) >= now && ["pending", "confirmed"].includes(appointment.appointment_status.toLowerCase()))
    .sort((a, b) => a.appointment_datetime!.localeCompare(b.appointment_datetime!));
  const maxDate = new Date(`${malaysiaDate()}T00:00:00+08:00`);
  maxDate.setUTCDate(maxDate.getUTCDate() + 90);
  const maxDateString = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(maxDate);

  const completedCount = appointments.filter((appointment) => appointment.appointment_status.toLowerCase() === "completed").length;

  return (
    <section className="student-appointments">
      <header className="sa-hero">
        <div className="sa-hero-copy">
          <p className="sa-eyebrow"><Icon name="appointment" />Advisor Consultation</p>
          <h1>Appointments <span aria-hidden="true">✦</span></h1>
          <p>Get academic and career guidance from our experienced advisors.</p>
          <button className="ss-button" type="button" disabled={booking} onClick={beginBooking}>Book an Appointment <Icon name="chevron" /></button>
        </div>
        <AppointmentArtwork name="hero" className="sa-hero-art" />
      </header>
      <section className="sa-summary" aria-label="Appointment summary">
        <article className="purple"><AppointmentArtwork name="appointments" /><div><h2>My Appointments</h2><strong>{isLoading || error ? "—" : appointments.length}</strong></div></article>
        <article className="blue"><AppointmentArtwork name="upcoming" /><div><h2>Upcoming</h2><strong>{isLoading || error ? "—" : upcoming.length}</strong></div></article>
        <article className="green"><AppointmentArtwork name="completed" /><div><h2>Completed</h2><strong>{isLoading || error ? "—" : completedCount}</strong></div></article>
        <article className="gold"><AppointmentArtwork name="advisors" /><div><h2>Available Advisors</h2><strong>{isLoading || error ? "—" : advisors.length}</strong></div></article>
      </section>
      {bookingError && <p className="sa-notice sa-error" role="alert">{bookingError}</p>}
      {message && <p className="sa-notice sa-success" role="status">{message}</p>}
      <div className="sa-layout">
        <section className="sa-card sa-directory" ref={advisorList} tabIndex={-1} aria-labelledby="sa-advisors-title">
          <div className="sa-heading"><Icon name="users" /><div><h2 id="sa-advisors-title">Academic Advisors</h2><p>Find and connect with an advisor that fits your academic or career goals.</p></div></div>
          {isLoading && <p role="status">Loading academic advisors…</p>}
          {error && <p className="sa-error" role="alert">{error}</p>}
          {!isLoading && !error && advisors.length === 0 && <div className="sa-empty"><Icon name="users" /><p>No academic advisors available yet.</p></div>}
          <div className="sa-advisors">
            {advisors.map((advisor) => (
              <article className={`sa-advisor${selectedAdvisor?.advisor_id === advisor.advisor_id ? " selected" : ""}`} key={advisor.advisor_id}>
                <ProfileAvatar className="sa-avatar" name={advisor.full_name} imageUrl={advisor.profile_picture} />
                <div className="sa-advisor-copy">
                  <h3>{advisor.full_name}</h3>
                  <p>{advisor.specialization || advisor.professional_title || "Academic Advisor"}</p>
                  <div className="sa-tags">{advisor.institution && <span>{advisor.institution}</span>}{advisor.qualification && <span>{advisor.qualification}</span>}</div>
                  <details><summary>About advisor</summary>
                    {advisor.bio && <p>{advisor.bio}</p>}
                    {advisor.professional_title && <p>{advisor.professional_title}</p>}
                    <p>{advisor.experience_years == null ? "Experience not provided" : `${advisor.experience_years} years experience`} · {Number(advisor.average_rating) > 0 ? `${advisor.average_rating} / 5 rating` : "No ratings yet"}</p>
                  </details>
                </div>
                <div className="sa-advisor-actions">
                  <button className="ss-button" type="button" disabled={booking} onClick={() => chooseAdvisor(advisor, true)}><Icon name="calendar" />Book Now</button>
                  <button className="sa-text-button" type="button" disabled={booking} onClick={() => chooseAdvisor(advisor, false)}>View Availability</button>
                </div>
              </article>
            ))}
          </div>
        </section>
        <div className="sa-side-column">
          <section className="sa-booking-banner">
            <div><h2><Icon name="calendar" />Book an Appointment</h2><p>Choose an advisor, select a date and time, and get the guidance you need.</p><button type="button" disabled={booking} onClick={beginBooking}>Schedule Now <Icon name="chevron" /></button></div>
            <AppointmentArtwork name="calendar" className="sa-banner-calendar" />
          </section>
          <section className="sa-card sa-upcoming" aria-labelledby="sa-upcoming-title">
            <div className="sa-heading"><Icon name="clock" /><h2 id="sa-upcoming-title">Upcoming Appointments</h2><button className="sa-text-button" type="button" onClick={viewHistory}>View All <Icon name="chevron" /></button></div>
            {isLoading ? <p role="status">Loading appointments…</p> : error ? <p className="sa-error">Appointments could not be loaded. Please refresh to try again.</p> : upcoming.length === 0 ? <div className="sa-empty"><Icon name="calendar" /><p>Your next consultation will appear here.</p></div> : upcoming.slice(0, 2).map((appointment) => (
              <article className="sa-upcoming-row" key={appointment.appointment_id}>
                <time className="sa-date-badge" dateTime={appointment.appointment_datetime!}><strong>{new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric" }).format(new Date(appointment.appointment_datetime!))}</strong><span>{new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", month: "short" }).format(new Date(appointment.appointment_datetime!))}</span></time>
                <div><h3>Academic Consultation</h3><p>with {appointment.advisor_name}</p><span className="sa-session-time"><Icon name="clock" />{new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", hour: "numeric", minute: "2-digit" }).format(new Date(appointment.appointment_datetime!))} · {appointment.duration_minutes} min</span><span className="sa-status">{appointment.appointment_status}</span></div>
                <button type="button" className="sa-details-button" onClick={() => { setSelectedAppointment(appointment); detailsDialog.current?.showModal(); }}>View Details</button>
              </article>
            ))}
          </section>
        </div>
      </div>
        <aside ref={bookingPanel} tabIndex={-1} hidden={!selectedAdvisor} className="sa-card sa-booking appointment-booking-panel" aria-label="Book an advisor appointment">
          <button className="sa-close-booking" type="button" aria-label="Close booking panel" disabled={booking} onClick={() => {
            setSelectedAdvisor(null);
            advisorList.current?.focus({ preventScroll: true });
          }}><Icon name="close" /></button>
          <h2>{selectedAdvisor ? `Book with ${selectedAdvisor.full_name}` : "Book an Appointment"}</h2>
          <p>All times are in Malaysia time (Asia/Kuala_Lumpur). {availability ? `Each consultation lasts ${availability.slot_minutes} minutes.` : "Select an advisor to see their session length."}</p>
          {!selectedAdvisor && <p>Choose Book Appointment on an advisor’s profile, select an available time, then submit your booking.</p>}
          {selectedAdvisor && <>
            <p className="appointment-booking-help">Choose a date and time below. Your booking will appear in My Appointments and in your advisor’s calendar.</p>
            <label className="appointment-date-label">Consultation date
              <input type="date" value={availability?.date || date} min={malaysiaDate()} max={maxDateString} disabled={booking || loadingSlots} onChange={(event) => {
                setDate(event.target.value);
                setFindNext(false);
                setAvailability(null);
                setSelectedSlot("");
                setBookingError("");
                setMessage("");
              }} />
            </label>
            <button type="button" className="appointment-refresh" disabled={booking || loadingSlots} onClick={() => setRefresh((value) => value + 1)}>Refresh availability</button>
            {loadingSlots && <p role="status">Loading available slots...</p>}
            {slotError && <p className="dashboard-message error" role="alert">{slotError}</p>}
            {availability && <>
              {availability.searched_next && availability.slots.length > 0 && <p className="appointment-next-date" role="status">Showing the next available date.</p>}
              {!availability.published ? <p className="appointment-note">This advisor has not published their schedule yet.</p> : availability.slots.length === 0 ? <div className="appointment-note">
                <p>{availability.searched_next ? "No bookable slots were found within the next 90 days." : "No available slots on this date."}</p>
                {!availability.searched_next && <button className="appointment-refresh" type="button" disabled={booking || loadingSlots} onClick={() => {
                  setDate(availability.date);
                  setFindNext(true);
                  setRefresh((value) => value + 1);
                }}>Find next available date</button>}
              </div> : <>
                <h3>Available slots</h3>
                <div className="appointment-slots">{availability.slots.map((slot) => <button key={slot} type="button" aria-pressed={selectedSlot === slot} disabled={booking || loadingSlots} onClick={() => { setSelectedSlot(slot); setBookingError(""); }}>{slot.slice(11, 16)}</button>)}</div>
              </>}
              <label className="appointment-date-label">Consultation topic (optional)<input value={topic} maxLength={100} disabled={booking} placeholder="e.g. Course selection" onChange={event=>setTopic(event.target.value)}/></label>
              <label className="appointment-date-label">Message for your advisor (optional)<textarea value={studentMessage} maxLength={1000} disabled={booking} rows={3} placeholder="What would you like help with?" onChange={event=>setStudentMessage(event.target.value)}/></label>
              <div className="appointment-booking-selection" aria-live="polite">
                {selectedSlot ? <><strong>Selected appointment</strong><span>{formatAppointment(`${selectedSlot}+08:00`)}</span><span>{availability.slot_minutes} minutes with {selectedAdvisor.full_name}</span></> : <span>Select an available time to book your appointment.</span>}
              </div>
              <button className="appointment-book-button" type="button" disabled={!selectedSlot || booking || loadingSlots || !!slotError || !availability.slots.includes(selectedSlot)} onClick={bookAppointment}>{booking ? "Booking..." : "Book Appointment"}</button>
              <p className="appointment-approval-note">Bookings are pending until your advisor confirms them.</p>
              {availability.daily_breaks?.length ? <p className="appointment-approval-note">Daily breaks: {availability.daily_breaks.map(item=>`${item.start_time} – ${item.end_time}`).join(", ")}. These times cannot be booked.</p> : null}
              <details><summary>Weekly consultation hours</summary>
                <ul className="appointment-hours">{availability.availability.map((day) => <li key={day.day}><span>{day.day}</span><strong>{day.enabled ? `${day.start_time} – ${day.end_time}` : "Unavailable"}</strong></li>)}</ul>
              </details>
              {availability.blocked_dates.length > 0 && <details><summary>Unavailable dates</summary><ul>{availability.blocked_dates.map((item) => <li key={item.date}>{item.date}{item.reason && ` — ${item.reason}`}</li>)}</ul></details>}
            </>}
          </>}
        </aside>
      <section className="sa-card sa-history" ref={appointmentHistory} tabIndex={-1} aria-labelledby="sa-history-title">
        <div className="sa-heading"><Icon name="calendar" /><h2 id="sa-history-title">My Appointments</h2></div>
        {isLoading && <p role="status">Loading appointments…</p>}
        {!isLoading && !error && appointments.length === 0 && <p>You have no appointments yet. Choose an advisor to book your first consultation.</p>}
        <div className="sa-history-list">{appointments.map((appointment) => (
          <article key={appointment.appointment_id}>
            <strong>{appointment.advisor_name}</strong>
            <span>{appointment.appointment_datetime ? formatAppointment(appointment.appointment_datetime) : "Date not set"}</span>
            <span>{appointment.duration_minutes} min</span>
            <span className="sa-status">{appointment.appointment_status}</span>
            <button type="button" className="sa-details-button" onClick={() => { setSelectedAppointment(appointment); detailsDialog.current?.showModal(); }}>View Details</button>
          </article>
        ))}</div>
      </section>
      <dialog ref={detailsDialog} className="sa-details-dialog" aria-labelledby="sa-details-title" onClick={(event) => { if (event.target === event.currentTarget) detailsDialog.current?.close(); }}>
        <header><h2 id="sa-details-title">Appointment Details</h2><button type="button" aria-label="Close appointment details" onClick={() => detailsDialog.current?.close()}><Icon name="close" /></button></header>
        {selectedAppointment && <dl><dt>Advisor</dt><dd>{selectedAppointment.advisor_name}</dd><dt>Date and time (Malaysia time)</dt><dd>{selectedAppointment.appointment_datetime ? formatAppointment(selectedAppointment.appointment_datetime) : "Date not set"}</dd><dt>Session length</dt><dd>{selectedAppointment.duration_minutes} minutes</dd><dt>Status</dt><dd className="sa-status">{selectedAppointment.appointment_status}</dd></dl>}
        <button className="ss-button" type="button" onClick={() => detailsDialog.current?.close()}>Done</button>
      </dialog>
    </section>
  );
}
export default AppointmentsPage;
