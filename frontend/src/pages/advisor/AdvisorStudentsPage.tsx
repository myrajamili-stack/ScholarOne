import { useEffect, useState } from "react";
import api from "../../api/axios";
import { getApiErrorMessage } from "../../utils/apiError";
import { getStoredUser } from "../../utils/authStorage";
import { getInitials } from "../../utils/userDisplay";

type GuidedStudent = {
  student_id: number;
  full_name: string;
  email: string;
  phone_number?: string | null;
  education_level?: string | null;
  cgpa?: number | string | null;
  field_of_study?: string | null;
  university?: string | null;
  appointment_count: number;
  latest_appointment?: string | null;
};

type AdvisorStudentsData = {
  summary: {
    total_guided: number;
    active_consultations: number;
    completed_consultations: number;
  };
  students: GuidedStudent[];
};

function formatDate(value?: string | null) {
  if (!value) {
    return "No appointment date";
  }

  return new Intl.DateTimeFormat("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function AdvisorStudentsPage() {
  const user = getStoredUser();
  const [data, setData] = useState<AdvisorStudentsData | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadStudents() {
      if (!user?.user_id) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await api.get<AdvisorStudentsData>(`/advisors/${user.user_id}/students`);
        setData(response.data);
      } catch (error) {
        setError(getApiErrorMessage(error, "Unable to load students under your guidance."));
      } finally {
        setIsLoading(false);
      }
    }

    loadStudents();
  }, [user?.user_id]);

  if (isLoading) {
    return (
      <div className="advisor-page">
        <section className="advisor-empty-state">Loading guided students...</section>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="advisor-page">
        <section className="advisor-empty-state">{error || "Student guidance data is not available."}</section>
      </div>
    );
  }

  return (
    <div className="advisor-page">
      <section className="advisor-students-hero">
        <div>
          <p className="advisor-kicker">Student Support</p>
          <h2>Students Under Your Guidance</h2>
          <span>Students appear here after they book an appointment with you.</span>
        </div>
      </section>

      <section className="advisor-students-stats">
        <article className="advisor-panel">
          <p className="advisor-kicker">Total Guided Students</p>
          <h2>{data.summary.total_guided}</h2>
          <span className="advisor-muted">Students connected through appointments</span>
        </article>
        <article className="advisor-panel">
          <p className="advisor-kicker">Active Consultations</p>
          <h2>{data.summary.active_consultations}</h2>
          <span className="advisor-muted">Pending or confirmed consultation records</span>
        </article>
        <article className="advisor-panel">
          <p className="advisor-kicker">Completed Consultations</p>
          <h2>{data.summary.completed_consultations}</h2>
          <span className="advisor-muted">Students with completed sessions</span>
        </article>
      </section>

      <section className="advisor-panel advisor-students-panel">
        <div className="advisor-panel-header">
          <div>
            <p className="advisor-kicker">Guidance List</p>
            <h2>Student Profiles</h2>
          </div>
        </div>

        {data.students.length > 0 ? (
          <div className="advisor-students-list">
            {data.students.map((student) => (
              <article className="advisor-student-card" key={student.student_id}>
                <div className="advisor-avatar mini">{getInitials(student.full_name)}</div>
                <div className="advisor-student-main">
                  <h3>{student.full_name}</h3>
                  <p>{student.email}</p>
                  <span>{student.phone_number || "Phone number not set"}</span>
                </div>
                <div>
                  <strong>{student.education_level || "Education not set"}</strong>
                  <span>{student.field_of_study || "Field of study not set"}</span>
                </div>
                <div>
                  <strong>{student.cgpa ? `${student.cgpa} CGPA` : "CGPA not set"}</strong>
                  <span>{student.university || "University not set"}</span>
                </div>
                <div>
                  <strong>{student.appointment_count}</strong>
                  <span>Appointments</span>
                  <small>Latest: {formatDate(student.latest_appointment)}</small>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="advisor-empty-state small">
            No students are under your guidance yet. Once a student books an appointment with this advisor, their profile will appear here.
          </div>
        )}
      </section>
    </div>
  );
}

export default AdvisorStudentsPage;
