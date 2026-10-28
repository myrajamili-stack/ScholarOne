type ModuleAction = {
  label: string;
  value: string;
};

type ModulePageProps = {
  eyebrow: string;
  title: string;
  description: string;
  actions: ModuleAction[];
};

function ModulePage({ eyebrow, title, description, actions }: ModulePageProps) {
  return (
    <section className="module-page">
      <div className="module-hero">
        <div>
          <p>{eyebrow}</p>
          <h1>{title}</h1>
          <span>{description}</span>
        </div>
      </div>

      <div className="module-grid">
        {actions.map((action) => (
          <article className="module-card" key={action.label}>
            <span>{action.label}</span>
            <strong>{action.value}</strong>
          </article>
        ))}
      </div>
    </section>
  );
}

export default ModulePage;
