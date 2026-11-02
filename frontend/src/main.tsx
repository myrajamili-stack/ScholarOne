import { StrictMode, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import AboutPage from './pages/AboutPage'
import RoleSelectionPage from './pages/RoleSelectionPage'
import 'bootstrap/dist/css/bootstrap.min.css';
import './styles/home.css'


const features = [
  { title: "Smart Search", description: "Discover scholarship opportunities that match your profile.", symbol: "⌕" },
  { title: "Reminders", description: "Keep track of important deadlines and upcoming dates.", symbol: "◷" },
  { title: "Consultation", description: "Get one-to-one guidance from academic advisors.", symbol: "☏" },
  { title: "Pathfinder Quiz", description: "Explore academic and career paths that suit your interests.", symbol: "↗" },
];

// This landing component intentionally lives in the application entry file.
// eslint-disable-next-line react-refresh/only-export-components
function HomePage({ about = false }: { about?: boolean }) {
  const roleDialog = useRef<HTMLDialogElement>(null)
  const [roleMode, setRoleMode] = useState<'signup' | 'login'>('signup')

  function openRoleDialog(mode: 'signup' | 'login') {
    setRoleMode(mode)
    roleDialog.current?.showModal()
  }

  return (
    <div className="home-page">
      <header className="home-header">
        <Link to="/" className="home-brand" aria-label="ScholarOne home">
          <span className="home-crest" aria-hidden="true">S1</span>
          <span><strong>Scholar<span>One</span></strong><small>Your future, simplified</small></span>
        </Link>
        <nav className="home-nav" aria-label="Main navigation">
          <Link to="/" aria-current={!about ? 'page' : undefined}>Home</Link>
          <Link to="/about" aria-current={about ? 'page' : undefined}>About Us</Link>
        </nav>
        <div className="home-account">
          <button className="home-signup" type="button" onClick={() => openRoleDialog('signup')}>Sign Up</button>
          <small>Already have an account?<br />Login <button className="home-login-link" type="button" onClick={() => openRoleDialog('login')}>here</button></small>
        </div>
      </header>

      <main>
        <section className="home-hero" aria-labelledby="home-title">
          <div className="home-hero-copy">
            <span className="home-tag">Explore your future—with the right guidance</span>
            <h1 id="home-title">Secure Financial Aid,<br />Find Your Best Academic Pathway<br /><span>&amp; Get Expert Guidance</span></h1>
            <p>Discover your ideal academic path, access the right funding, and get expert support every step of the way.</p>
            <button type="button" onClick={() => openRoleDialog('signup')} className="home-start"><span aria-hidden="true"><span className="home-arrow">→</span></span>Get Started</button>
          </div>
          <svg className="home-illustration" viewBox="0 0 320 300" role="img" aria-label="Graduation cap above books and an academic pathway">
            <circle cx="165" cy="145" r="125" fill="#d8e4ff" />
            <circle cx="265" cy="50" r="12" fill="#b9cdfa" />
            <path d="M56 250 Q170 290 270 230" fill="none" stroke="#a8bff0" strokeWidth="2" strokeDasharray="6 7" />
            <rect x="60" y="216" width="200" height="28" rx="8" fill="#274dbb" />
            <path d="M78 230h160" stroke="white" strokeWidth="3" />
            <rect x="80" y="184" width="180" height="27" rx="7" fill="white" stroke="#abc0ef" strokeWidth="2" />
            <rect x="65" y="153" width="180" height="26" rx="7" fill="#7496e4" />
            <path d="M109 98v35q55 34 109 0V98" fill="#274dbb" />
            <path d="m63 83 100-43 101 43-101 45z" fill="#173eaa" />
            <path d="m163 83 83 18v43" fill="none" stroke="#edbc59" strokeWidth="4" />
            <path d="m240 144-5 20h22l-5-20" fill="#edbc59" />
            <path d="m54 119 4 10 11 3-11 4-4 10-4-10-10-4 10-3zm210 61 4 10 11 3-11 4-4 10-4-10-10-4 10-3z" fill="#5178d6" />
          </svg>
        </section>

        {about ? <AboutPage /> : <>
        <section className="home-overview" aria-labelledby="overview-title">
          <h2 id="overview-title">Platform Overview</h2>
          <p>Your new academic journey starts here, with everything you need to move forward with confidence.</p>
          <div className="home-features">
            {features.map((feature) => (
              <article className="home-feature" key={feature.title}>
                <span className="home-feature-icon" aria-hidden="true">{feature.symbol}</span>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="home-about" id="about" aria-labelledby="about-title">
          <h2 id="about-title">A clearer path to your future.</h2>
          <p>ScholarOne brings scholarship discovery, academic planning, and advisor support together in one place, helping students take their next step with confidence.</p>
          <button className="home-journey" type="button" onClick={() => openRoleDialog('signup')}>Start your journey <span aria-hidden="true">→</span></button>
        </section>
        </>}
      </main>
      <footer className="home-footer">© ScholarOne 2026, All rights reserved</footer>
      <dialog
        ref={roleDialog}
        className="role-selection-dialog"
        aria-labelledby="role-selection-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) roleDialog.current?.close()
        }}
      >
        <div className="role-selection-dialog-content" onClick={(event) => {
          if (event.target instanceof Element && event.target.closest('a')) roleDialog.current?.close()
        }}>
          <button className="role-selection-close" type="button" aria-label="Close role selection" onClick={() => roleDialog.current?.close()}>×</button>
          <RoleSelectionPage mode={roleMode} onModeChange={setRoleMode} />
        </div>
      </dialog>
    </div>
  );
}


createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/about" element={<HomePage about />} />
        <Route path="/*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
