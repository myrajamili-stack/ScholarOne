import { useEffect, useMemo, useState } from "react";
import api from "../../api/axios";
import { getApiErrorMessage } from "../../utils/apiError";
import { getStoredUser } from "../../utils/authStorage";

type AppointmentStatus = "all" | "pending" | "confirmed" | "completed" | "cancelled";

type AdvisorAppointment = {
  appointment_id: number;
  appointment_datetime: string | null;
  appointment_status: AppointmentStatus;
  student_name: string;
  student_email?: string | null;
  student_phone?: string | null;
  education_level?: string | null;
  field_of_study?: string | null;
  university?: string | null;
};

type AdvisorAppointmentsData = {
  summary: {
    confirmed: number;
    pending: number;
    completed: number;
    total: number;
  };
  appointments: AdvisorAppointment[];
};

const filters: AppointmentStatus[] = ["all", "pending", "confirmed", "completed", "cancelled"];

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

function getStatusLabel(status: AppointmentStatus) {
  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

function AdvisorAppointmentsPage() {
  const user = getStoredUser();
  const [data, setData] = useState<AdvisorAppointmentsData | null>(null);
  const [activeFilter, setActiveFilter] = useState<AppointmentStatus>("all");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  async function loadAppointments() {
    if (!user?.user_id) {
      setIsLoading(false);
      return;
    }

    try {
      const response = await api.get<AdvisorAppointmentsData>(`/advisors/${user.user_id}/appointments`);
      setData(response.data);
    } catch (error) {
      setError(getApiErrorMessage(error, "Unable to load advisor appointments."));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadAppointments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.user_id]);

  const visibleAppointments = useMemo(() => {
    if (!data) {
      return [];
    }

    if (activeFilter === "all") {
      return data.appointments;
    }

    return data.appointments.filter((appointment) => appointment.appointment_status === activeFilter);
  }, [activeFilter, data]);

  async function updateStatus(appointmentId: number, status: Exclude<AppointmentStatus, "all">) {
    if (!user?.user_id) {
      return;
    }

    setUpdatingId(appointmentId);
    setError("");

    try {
      await api.patch(`/advisors/${user.user_id}/appointments/${appointmentId}/status`, { status });
      await loadAppointments();
    } catch (error) {
      setError(getApiErrorMessage(error, "Unable to update appointment status."));
    } finally {
      setUpdatingId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="advisor-page">
        <section className="advisor-empty-state">Loading appointments...</section>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="advisor-page">
        <section className="advisor-empty-state">{error}</section>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="advisor-page">
        <section className="advisor-empty-state">Appointment data is not available.</section>
      </div>
    );
  }

  return (
    <div className="advisor-page">
      <section className="advisor-appointments-hero">
        <div>
          <p className="advisor-kicker">Bookings</p>
          <h2>Appointment Management</h2>
          <span>Review student booking requests, confirm consultations, and track completed sessions.</span>
        </div>
        <button className="advisor-primary-button" type="button">
          Export Schedule
        </button>
      </section>

      <section className="advisor-appointment-stats">
        <article className="advisor-panel">
          <p className="advisor-kicker">Confirmed</p>
          <h2>{data.summary.confirmed}</h2>
          <span className="advisor-muted">Appointments already approved</span>
        </article>
        <article className="advisor-panel">
          <p className="advisor-kicker">Pending</p>
          <h2>{data.summary.pending}</h2>
          <span className="advisor-muted">Requests waiting for your decision</span>
        </article>
        <article className="advisor-panel">
          <p className="advisor-kicker">Completed</p>
          <h2>{data.summary.completed}</h2>
          <span className="advisor-muted">Consultations marked complete</span>
        </article>
        <article className="advisor-panel">
          <p className="advisor-kicker">Total</p>
          <h2>{data.summary.total}</h2>
          <span className="advisor-muted">All appointment records</span>
        </article>
      </section>

      {error && <p className="advisor-form-error">{error}</p>}

      <section className="advisor-appointment-layout">
        <article className="advisor-panel advisor-appointment-board">
          <div className="advisor-panel-header">
            <div>
              <p className="advisor-kicker">Appointment Queue</p>
              <h2>Student Bookings</h2>
            </div>
            <div className="advisor-filter-tabs">
              {filters.map((filter) => (
                <button
                  className={activeFilter === filter ? "active" : ""}
                  key={filter}
                  type="button"
                  onClick={() => setActiveFilter(filter)}
                >
                  {getStatusLabel(filter)}
                </button>
              ))}
            </div>
          </div>

          {visibleAppointments.length > 0 ? (
            <div className="advisor-appointment-list">
              {visibleAppointments.map((appointment) => (
                <div className="advisor-appointment-card" key={appointment.appointment_id}>
                  <div className="advisor-appointment-date">
                    <strong>{formatTime(appointment.appointment_datetime)}</strong>
                    <span>{formatDate(appointment.appointment_datetime)}</span>
                  </div>

                  <div className="advisor-appointment-main">
                    <div className="advisor-avatar mini">{appointment.student_name.slice(0, 2).toUpperCase()}</div>
                    <div>
                      <h3>{appointment.student_name}</h3>
                      <p>{appointment.field_of_study || "Field of study not set"}</p>
                      <span>{appointment.university || "University not set"}</span>
                    </div>
                  </div>

                  <div className="advisor-appointment-meta">
                    <span className={`advisor-status ${appointment.appointment_status === "confirmed" ? "confirmed" : "pending"}`}>
                      {getStatusLabel(appointment.appointment_status)}
                    </span>
                    <small>{appointment.student_email || "Email not set"}</small>
                  </div>

                  <div className="advisor-appointment-actions">
                    {appointment.appointment_status === "pending" && (
                      <button type="button" disabled={updatingId === appointment.appointment_id} onClick={() => updateStatus(appointment.appointment_id, "confirmed")}>
                        Confirm
                      </button>
                    )}
                    {appointment.appointment_status === "confirmed" && (
                      <button type="button" disabled={updatingId === appointment.appointment_id} onClick={() => updateStatus(appointment.appointment_id, "completed")}>
                        Mark Complete
                      </button>
                    )}
                    {appointment.appointment_status !== "completed" && (
                      <button
                        className="danger"
                        type="button"
                        disabled={updatingId === appointment.appointment_id}
                        onClick={() => updateStatus(appointment.appointment_id, "cancelled")}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="advisor-empty-state small">
              No appointments found for this status. Student bookings from the appointment table will appear here.
            </div>
          )}
        </article>

        <aside className="advisor-panel advisor-appointment-guide">
          <p className="advisor-kicker">Consultation Workflow</p>
          <h2>How to manage bookings</h2>
          <ol>
            <li>Review pending student booking requests.</li>
            <li>Confirm suitable consultation slots.</li>
            <li>Mark sessions complete after the consultation.</li>
            <li>Use cancelled status when the slot is no longer available.</li>
          </ol>
        </aside>
      </section>
    </div>
  );
}

export default AdvisorAppointmentsPage;
