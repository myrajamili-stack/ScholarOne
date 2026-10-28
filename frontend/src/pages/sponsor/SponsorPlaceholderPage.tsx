type SponsorPlaceholderPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  cards: Array<{
    label: string;
    value: string;
    detail: string;
  }>;
};

function SponsorPlaceholderPage({ eyebrow, title, description, cards }: SponsorPlaceholderPageProps) {
  return (
    <div className="sponsor-page">
      <section className="sponsor-module-hero">
        <p>{eyebrow}</p>
        <h2>{title}</h2>
        <span>{description}</span>
      </section>

      <section className="sponsor-module-grid">
        {cards.map((card) => (
          <article className="sponsor-panel" key={card.label}>
            <p className="sponsor-kicker">{card.label}</p>
            <h2>{card.value}</h2>
            <span className="sponsor-muted">{card.detail}</span>
          </article>
        ))}
      </section>
    </div>
  );
}

export default SponsorPlaceholderPage;
