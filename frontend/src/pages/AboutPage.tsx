const highlights = [
  {
    title: "Find Scholarships That Fit You",
    description: "ScholarOne aggregates the latest scholarship opportunities in one place, making it easy for you to search, compare, and apply. Our platform filters scholarships based on your academic results, financial background, location, and personal preferences, ensuring you only see the most relevant options.",
  },
  {
    title: "Get Personalized Recommendations",
    description: "Not sure which academic pathway to pursue? ScholarOne’s personalized recommendation system suggests the best educational options based on your interests, qualifications, and career goals. Whether you're looking for a degree, diploma, or foundation program, we guide you every step of the way.",
  },
  {
    title: "Stay on Track with Important Dates",
    description: "Never miss an application deadline or scholarship opportunity again. ScholarOne helps you keep track of important dates and deadlines with reminders and calendar notifications.",
  },
  {
    title: "Book Consultations with Advisors",
    description: "Have questions or need guidance? ScholarOne makes it easy for you to book consultations with academic advisors who can help you make the best choices for your future.",
  },
];

export default function AboutPage() {
  return (
    <section className="about-page-content" aria-labelledby="about-page-title">
      <div className="about-page-inner">
        <h2 id="about-page-title">About Us</h2>
        <p className="about-page-intro">ScholarOne is here to simplify your journey to higher education. We know how overwhelming it can be to search for scholarships and academic pathways that align with your qualifications and goals. That’s why we’ve created a one-stop platform designed just for you.</p>
        <div className="about-page-highlights">
          {highlights.map(({ title, description }) => (
            <article key={title}>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
          <p className="about-page-closing">ScholarOne is designed to make your academic and financial planning easier, more efficient, and tailored to your unique needs. Start exploring today and take the next step toward your future!</p>
        </div>
      </div>
    </section>
  );
}
