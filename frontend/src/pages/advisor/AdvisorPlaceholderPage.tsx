type AdvisorPlaceholderPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  cards: Array<{
    label: string;
    value: string;
    detail: string;
  }>;
};

function AdvisorPlaceholderPage({ eyebrow, title, description, cards }: AdvisorPlaceholderPageProps) {
  return (
    <div className="advisor-page">
      <section className="advisor-module-hero">
        <p>{eyebrow}</p>
        <h2>{title}</h2>
        <span>{description}</span>
      </section>

      <section className="advisor-module-grid">
        {cards.map((card) => (
          <article className="advisor-panel" key={card.label}>
            <p className="advisor-kicker">{card.label}</p>
            <h2>{card.value}</h2>
            <span className="advisor-muted">{card.detail}</span>
          </article>
        ))}
      </section>
    </div>
  );
}

export default AdvisorPlaceholderPage;
