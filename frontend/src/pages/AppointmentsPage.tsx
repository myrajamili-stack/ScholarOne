import { useEffect, useState } from "react";
import api from "../api/axios";

type Advisor = {
  advisor_id: number;
  full_name: string;
  email: string;
  specialization?: string | null;
  qualification?: string | null;
  experience_years?: number | null;
  average_rating?: number | string | null;
};

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function AppointmentsPage() {
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadAdvisors() {
      try {
        const response = await api.get<Advisor[]>("/advisors");
        setAdvisors(response.data);
      } catch {
        setError("Unable to load academic advisors right now.");
      } finally {
        setIsLoading(false);
      }
    }

    loadAdvisors();
  }, []);

  return (
    <section className="appointments-page">
      <header className="appointments-hero">
        <div>
          <p className="module-eyebrow">Advisor Consultation</p>
          <h1>Appointments</h1>
          <span>Browse academic advisors, review their expertise, and prepare your consultation booking.</span>
        </div>
        <button type="button" disabled>
          Book Appointment
        </button>
      </header>

      <section className="appointment-summary-grid">
        <article>
          <span>Available advisors</span>
          <strong>{advisors.length}</strong>
        </article>
        <article>
          <span>Upcoming appointment</span>
          <strong>None</strong>
        </article>
        <article>
          <span>Booking status</span>
          <strong>Not booked</strong>
        </article>
      </section>

      <section className="appointment-layout">
        <article className="advisor-list-card">
          <div className="appointment-section-heading">
            <div>
              <h2>Academic Advisors</h2>
              <p>Advisor profiles are loaded from the backend advisor database.</p>
            </div>
          </div>

          {isLoading && <p className="dashboard-message">Loading academic advisors...</p>}
          {error && <p className="dashboard-message error">{error}</p>}
          {!isLoading && !error && advisors.length === 0 && (
            <div className="appointment-empty-state">
              <div aria-hidden="true">□</div>
              <h3>No academic advisors available yet</h3>
              <p>
                Once the Academic Advisor module is added and advisor accounts are registered, students will be able to
                browse profiles and book consultation slots here.
              </p>
            </div>
          )}

          <div className="advisor-grid">
            {advisors.map((advisor) => (
              <article className="advisor-profile-card" key={advisor.advisor_id}>
                <div className="advisor-profile-top">
                  <div className="advisor-initials">{getInitials(advisor.full_name)}</div>
                  <div>
                    <h3>{advisor.full_name}</h3>
                    <p>{advisor.specialization || "Academic Advisor"}</p>
                  </div>
                </div>
                <div className="advisor-profile-meta">
                  <span>{advisor.qualification || "Qualification not set"}</span>
                  <span>{advisor.experience_years ?? 0} years experience</span>
                  <span>{advisor.average_rating || "New"} rating</span>
                </div>
                <button type="button" disabled>
                  View Availability
                </button>
              </article>
            ))}
          </div>
        </article>

        <aside className="appointment-info-card">
          <h2>Booking Guide</h2>
          <ol>
            <li>Choose an academic advisor.</li>
            <li>Review their expertise and availability.</li>
            <li>Book a consultation slot.</li>
            <li>Receive confirmation in reminders and messages.</li>
          </ol>
          <div className="appointment-note">
            Booking actions are disabled until advisor timetable and availability management are added.
          </div>
        </aside>
      </section>
    </section>
  );
}

export default AppointmentsPage;
