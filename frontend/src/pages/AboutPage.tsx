import Icon, { type AdvisorIconName } from "../components/advisor/AdvisorIcon";

const highlights: { title: string; description: string; icon: AdvisorIconName }[] = [
  {
    title: "Find Scholarships That Fit You",
    icon: "graduation",
    description: "ScholarOne aggregates the latest scholarship opportunities in one place, making it easy for you to search, compare, and apply. Our platform filters scholarships based on your academic results, financial background, location, and personal preferences, ensuring you only see the most relevant options.",
  },
  {
    title: "Get Personalized Recommendations",
    icon: "target",
    description: "Not sure which academic pathway to pursue? ScholarOne’s personalized recommendation system suggests the best educational options based on your interests, qualifications, and career goals. Whether you're looking for a degree, diploma, or foundation program, we guide you every step of the way.",
  },
  {
    title: "Stay on Track with Important Dates",
    icon: "calendar",
    description: "Never miss an application deadline or scholarship opportunity again. ScholarOne helps you keep track of important dates and deadlines with reminders and calendar notifications.",
  },
  {
    title: "Book Consultations with Advisors",
    icon: "message",
    description: "Have questions or need guidance? ScholarOne makes it easy for you to book consultations with academic advisors who can help you make the best choices for your future.",
  },
];

export default function AboutPage() {
  return (
    <section className="about-page-content" aria-labelledby="about-page-title">
      <div className="about-page-inner">
        <header className="about-page-heading">
          <span className="about-page-eyebrow">YOUR FUTURE, SIMPLIFIED</span>
          <h2 id="about-page-title">About <span>Us</span></h2>
          <p>One place to discover opportunities. A clearer path to your future.</p>
        </header>
        <p className="about-page-intro">ScholarOne is here to simplify your journey to higher education. We know how overwhelming it can be to search for scholarships and academic pathways that align with your qualifications and goals. That’s why we’ve created a one-stop platform designed just for you.</p>
        <div className="about-page-highlights">
          {highlights.map(({ title, description, icon }, index) => (
            <article key={title} className="about-feature-card">
              <div className="about-feature-top"><span className="about-feature-icon"><Icon name={icon} /></span><span className="about-feature-number" aria-hidden="true">0{index + 1}</span></div>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
        <div className="about-page-closing"><span className="about-closing-icon"><Icon name="trend" /></span><p>ScholarOne is designed to make your academic and financial planning easier, more efficient, and tailored to your unique needs. Start exploring today and take the next step toward your future!</p></div>
      </div>
    </section>
  );
}
