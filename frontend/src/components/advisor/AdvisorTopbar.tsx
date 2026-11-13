import AdvisorAccountActions from "./AdvisorAccountActions";

function AdvisorTopbar() {
  return (
    <header className="advisor-topbar">
      <div>
        <h1>Academic Advisor Dashboard</h1>
        <p>Here is your schedule and advising activity for today.</p>
      </div>
      <AdvisorAccountActions />
    </header>
  );
}

export default AdvisorTopbar;
