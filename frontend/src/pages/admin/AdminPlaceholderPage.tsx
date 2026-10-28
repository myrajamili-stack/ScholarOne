type AdminPlaceholderPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  metrics: Array<{
    label: string;
    value: string;
    helper: string;
  }>;
};

function AdminPlaceholderPage({ eyebrow, title, description, metrics }: AdminPlaceholderPageProps) {
  return (
    <div className="admin-page">
      <section className="admin-module-hero">
        <p className="admin-kicker">{eyebrow}</p>
        <h2>{title}</h2>
        <span>{description}</span>
      </section>

      <section className="admin-module-grid">
        {metrics.map((metric) => (
          <article className="admin-stat-card" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.helper}</small>
          </article>
        ))}
      </section>
    </div>
  );
}

export default AdminPlaceholderPage;
