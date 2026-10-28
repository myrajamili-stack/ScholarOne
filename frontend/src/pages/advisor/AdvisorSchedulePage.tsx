import { useEffect, useState } from "react";
import api from "../../api/axios";
import { getApiErrorMessage } from "../../utils/apiError";
import { getStoredUser } from "../../utils/authStorage";

type ScheduleAppointment = {
  appointment_id: number;
  appointment_datetime: string | null;
  appointment_status: string | null;
  student_name: string;
};

type AvailabilityDay = {
  day: string;
  enabled: boolean;
  start_time: string;
  end_time: string;
};

type AdvisorScheduleData = {
  summary: {
    today_count: number;
    upcoming_count: number;
    pending_count: number;
  };
  appointments: ScheduleAppointment[];
  availability: AvailabilityDay[];
  blocked_dates: Array<{
    date: string;
    reason: string;
  }>;
};

function formatDate(value?: string | null) {
  if (!value) {
    return "Date not set";
  }

  return new Intl.DateTimeFormat("en-MY", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatTime(value?: string | null) {
  if (!value) {
    return "--:--";
  }

  return new Intl.DateTimeFormat("en-MY", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function getStatus(status?: string | null) {
  if (!status) {
    return "Pending";
  }

  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

function getStatusTone(status?: string | null) {
  return status?.toLowerCase() === "confirmed" ? "confirmed" : "pending";
}

function AdvisorSchedulePage() {
  const user = getStoredUser();
  const [schedule, setSchedule] = useState<AdvisorScheduleData | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadSchedule() {
      if (!user?.user_id) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await api.get<AdvisorScheduleData>(`/advisors/${user.user_id}/schedule`);
        setSchedule(response.data);
      } catch (error) {
        setError(getApiErrorMessage(error, "Unable to load advisor schedule."));
      } finally {
        setIsLoading(false);
      }
    }

    loadSchedule();
  }, [user?.user_id]);

  if (isLoading) {
    return (
      <div className="advisor-page">
        <section className="advisor-empty-state">Loading schedule...</section>
      </div>
    );
  }

  if (error || !schedule) {
    return (
      <div className="advisor-page">
        <section className="advisor-empty-state">{error || "Schedule data is not available."}</section>
      </div>
    );
  }

  return (
    <div className="advisor-page">
      <section className="advisor-schedule-hero">
        <div>
          <p className="advisor-kicker">Advisor Schedule</p>
          <h2>Manage Consultation Availability</h2>
          <span>Set your weekly availability, review upcoming bookings, and keep blocked dates visible.</span>
        </div>
        <button className="advisor-primary-button" type="button">
          Save Schedule
        </button>
      </section>

      <section className="advisor-schedule-stats">
        <article className="advisor-panel">
          <p className="advisor-kicker">Today</p>
          <h2>{schedule.summary.today_count}</h2>
          <span className="advisor-muted">Appointments scheduled today</span>
        </article>
        <article className="advisor-panel">
          <p className="advisor-kicker">Upcoming</p>
          <h2>{schedule.summary.upcoming_count}</h2>
          <span className="advisor-muted">Future appointments in the database</span>
        </article>
        <article className="advisor-panel">
          <p className="advisor-kicker">Pending</p>
          <h2>{schedule.summary.pending_count}</h2>
          <span className="advisor-muted">Requests waiting for approval</span>
        </article>
      </section>

      <section className="advisor-schedule-grid">
        <article className="advisor-panel advisor-availability-panel">
          <div className="advisor-panel-header">
            <div>
              <p className="advisor-kicker">Weekly Availability</p>
              <h2>Consultation Hours</h2>
            </div>
            <span className="advisor-schedule-note">UI ready</span>
          </div>

          <div className="advisor-availability-list">
            {schedule.availability.map((day) => (
              <div className="advisor-availability-row" key={day.day}>
                <label className="advisor-switch-label">
                  <input type="checkbox" defaultChecked={day.enabled} />
                  <span />
                  {day.day}
                </label>
                <input type="time" defaultValue={day.start_time} disabled={!day.enabled} />
                <span>to</span>
                <input type="time" defaultValue={day.end_time} disabled={!day.enabled} />
              </div>
            ))}
          </div>
        </article>

        <article className="advisor-panel advisor-appointments-panel">
          <div className="advisor-panel-header">
            <div>
              <p className="advisor-kicker">Database Appointments</p>
              <h2>Schedule Timeline</h2>
            </div>
          </div>

          {schedule.appointments.length > 0 ? (
            <div className="advisor-schedule-list">
              {schedule.appointments.map((appointment) => {
                const tone = getStatusTone(appointment.appointment_status);

                return (
                  <div className="advisor-schedule-item" key={appointment.appointment_id}>
                    <time>
                      <strong>{formatTime(appointment.appointment_datetime)}</strong>
                      <span>{formatDate(appointment.appointment_datetime)}</span>
                    </time>
                    <div>
                      <h3>Consultation Session</h3>
                      <p>with {appointment.student_name}</p>
                    </div>
                    <span className={`advisor-status ${tone}`}>{getStatus(appointment.appointment_status)}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="advisor-empty-state small">
              No appointments have been added yet. Student bookings from the appointment table will appear here.
            </div>
          )}
        </article>

        <article className="advisor-panel advisor-blocked-panel">
          <div className="advisor-panel-header">
            <div>
              <p className="advisor-kicker">Blocked Dates</p>
              <h2>Unavailable Days</h2>
            </div>
            <button type="button">Add Date</button>
          </div>

          {schedule.blocked_dates.length > 0 ? (
            <div className="advisor-blocked-list">
              {schedule.blocked_dates.map((blockedDate) => (
                <div className="advisor-blocked-row" key={blockedDate.date}>
                  <strong>{blockedDate.date}</strong>
                  <span>{blockedDate.reason}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="advisor-empty-state small">
              No blocked dates yet. This section is ready for when blocked-date storage is added to the database.
            </div>
          )}
        </article>
      </section>
    </div>
  );
}

export default AdvisorSchedulePage;
