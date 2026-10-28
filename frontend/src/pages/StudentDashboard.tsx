import { Link } from "react-router-dom";
import StudentRightPanel from "../components/StudentRightPanel";
import "../styles/student-dashboard.css";
import { getStoredUser } from "../utils/authStorage";

function StudentDashboard() {
  const user = getStoredUser();
  const firstName = user?.full_name?.split(" ")[0] || "Student";

  return (
    <div className="content-grid">
      <section className="left-content">
        <section className="hero-card">
          <div>
            <p>Good morning, {firstName}</p>
            <h1>Your scholarship workspace is ready.</h1>
            <span>Update your profile, review pathway guidance, and track opportunities as they become available.</span>
          </div>
          <div className="hero-snapshot" aria-label="Dashboard focus areas">
            <div className="snapshot-card snapshot-primary">
              <small>Next step</small>
              <strong>Complete profile</strong>
            </div>
            <div className="snapshot-row">
              <div>
                <small>Scholarships</small>
                <strong>0 listed</strong>
              </div>
              <div>
                <small>Pathway</small>
                <strong>Quiz ready</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="section-heading">
          <h2>Recommended for You</h2>
          <Link to="/scholarships">Browse Scholarships</Link>
        </section>

        <section className="scholarship-grid">
          <article className="empty-recommendation">
            <p>No personalized recommendations yet.</p>
            <span>
              Complete your academic profile first. Once scholarship listings and matching rules are ready,
              ScholarOne can show recommendations based on your CGPA, field of study, and education level.
            </span>
            <Link to="/profile">Complete Profile</Link>
          </article>
        </section>

        <section className="feature-row">
          <article className="quiz-card">
            <div>
              <h3>Pathway Quiz</h3>
              <p>Answer guided questions to discover academic pathways that fit your interests and study goals.</p>
              <Link className="feature-button" to="/pathway-quiz">
                Take Quiz Now
              </Link>
            </div>
            <div className="quiz-status" aria-hidden="true">
              <span>1</span>
              <span>2</span>
              <span>3</span>
            </div>
          </article>

          <article className="appointment-card">
            <div>
              <h3>Upcoming Appointment</h3>
              <h4>Career Guidance Session</h4>
              <p>with Dr. Emily Chen</p>
              <span>24 May 2025 • 10:00 AM</span>
              <Link className="feature-button" to="/appointments">
                View Appointment ›
              </Link>
            </div>
            <div className="advisor-photo">EC</div>
          </article>
        </section>

        <section className="journey-card">
          <div>
            <h3>Your Scholarship Journey</h3>
            <p>Keep going! You're making great progress.</p>
          </div>
          <div className="journey-track">
            <div className="journey-step done">
              <b>✓</b>
              <span>Create Profile</span>
            </div>
            <div className="journey-step done">
              <b>✓</b>
              <span>Discover</span>
            </div>
            <div className="journey-step active">
              <b>↗</b>
              <span>Apply</span>
            </div>
            <div className="journey-step">
              <b>□</b>
              <span>Review</span>
            </div>
            <div className="journey-step">
              <b>□</b>
              <span>Receive</span>
            </div>
          </div>
          <div className="trophy-art" aria-hidden="true"></div>
        </section>
      </section>

      <StudentRightPanel />
    </div>
  );
}

export default StudentDashboard;
