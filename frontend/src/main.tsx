import { StrictMode, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import 'bootstrap/dist/css/bootstrap.min.css'
import './index.css'
import './styles/student-dashboard.css'
import App from './App.tsx'
import AboutPage from './pages/AboutPage'
import RoleSelectionPage from './pages/RoleSelectionPage'
import './styles/home.css'
import Icon from './components/advisor/AdvisorIcon'


const features = [
  { title: "Wide Scholarship Listing", description: "Explore scholarships from a range of sponsorship providers.", icon: "graduation" },
  { title: "Academic Pathway Guidance", description: "Discover study options and plan your next step.", icon: "trend" },
  { title: "Advisor Consultation", description: "Get advice from experienced academic advisors.", icon: "users" },
  { title: "Deadline & Reminders", description: "Keep track of important dates and upcoming opportunities.", icon: "calendar" },
] as const;

const steps = [
  { title: "Create an Account", description: "Sign up and complete your student profile.", icon: "user" },
  { title: "Explore & Apply", description: "Find scholarships that match your profile and explore how to apply.", icon: "search" },
  { title: "Plan Your Future", description: "Explore pathways, book advisor sessions, and track important dates.", icon: "flag" },
] as const;

// eslint-disable-next-line react-refresh/only-export-components
function HomePage({ about = false }: { about?: boolean }) {
  const roleDialog = useRef<HTMLDialogElement>(null)
  const [roleMode, setRoleMode] = useState<'signup' | 'login'>('signup')

  function openRoleDialog(mode: 'signup' | 'login') {
    setRoleMode(mode)
    roleDialog.current?.showModal()
  }

  const brand = <><Icon name="graduation" /><span><strong>Scholar<span>One</span></strong><small>Your Pathway. Your Future.</small></span></>;

  return (
    <div className="home-page">
      <header className="home-header">
        <Link to="/" className="home-brand" aria-label="ScholarOne home">{brand}</Link>
        <nav className="home-nav" aria-label="Main navigation">
          <Link to="/" aria-current={!about ? 'page' : undefined}>Home</Link>
          <Link to="/about" aria-current={about ? 'page' : undefined}>About Us</Link>
          <Link to="/scholarships">Scholarships</Link>
          <Link to="/pathway-quiz">Academic Pathways</Link>
          <a href={about ? '/#faq' : '#faq'}>FAQ</a>
        </nav>
        <div className="home-account">
          <button className="home-outline" type="button" onClick={() => openRoleDialog('login')}>Log In</button>
          <button className="home-primary" type="button" onClick={() => openRoleDialog('signup')}>Sign Up</button>
        </div>
      </header>
      <main>
        <div className="home-introduction">
          <section className="home-hero" aria-labelledby="home-title">
            <div className="home-hero-copy">
              <span className="home-tag"><span aria-hidden="true">✦</span> Scholarship & Academic Pathway Platform</span>
              <h1 id="home-title">Find Scholarships,<br />{" "}Plan Your Academic Journey,<br />{" "}and <span>Build Your Future <b aria-hidden="true">✦</b></span></h1>
              <p>A one-stop platform to discover financial aid, get expert guidance, and plan your education with confidence.</p>
              <div className="home-hero-actions">
                <button type="button" onClick={() => openRoleDialog('signup')} className="home-primary">Get Started <Icon name="chevron" /></button>
                <Link to="/scholarships" className="home-outline">Explore Scholarships</Link>
              </div>
              <ul className="home-highlights" aria-label="Platform benefits">
                <li><span aria-hidden="true">✓</span> Scholarship Discovery</li>
                <li><span aria-hidden="true">✓</span> Expert Guidance</li>
                <li><span aria-hidden="true">✓</span> Personalized Recommendations</li>
              </ul>
            </div>
            <img className="home-illustration" src="/images/landing-student-hero.png" alt="Student in a lavender hijab planning her education at a laptop" />
          </section>
          {!about && <section className="home-features" aria-label="ScholarOne features">
            {features.map((feature) => <article className="home-feature" key={feature.title}>
              <span className="home-feature-icon"><Icon name={feature.icon} /></span>
              <div><h2>{feature.title}</h2><p>{feature.description}</p></div>
            </article>)}
          </section>}
        </div>
        {about ? <AboutPage /> : <>
          <section className="home-how" aria-labelledby="home-how-title">
            <h2 id="home-how-title">How Scholar<span>One</span> Works <b aria-hidden="true">✦</b></h2>
            <p>Get started in three simple steps.</p>
            <div className="home-steps">
              {steps.map((step, index) => <article className="home-step" key={step.title}>
                <span className="home-step-icon"><Icon name={step.icon} /></span>
                <div><span className="home-step-number">{index + 1}</span><h3>{step.title}</h3><p>{step.description}</p></div>
                {index < 2 && <span className="home-step-arrow" aria-hidden="true">⤏</span>}
              </article>)}
            </div>
            <button className="home-primary" type="button" onClick={() => openRoleDialog('signup')}>Get Started Today <Icon name="chevron" /></button>
          </section>
          <section className="home-about" id="about" aria-labelledby="about-title">
            <div><h2 id="about-title">About Scholar<span>One</span></h2>
              <p>ScholarOne is here to simplify your journey to higher education. We connect students with scholarships, academic pathways, and expert guidance in one convenient platform.</p>
              <Link className="home-outline" to="/about">Learn More About Us <Icon name="chevron" /></Link>
            </div>
            <img src="/images/student-dashboard-books.png" alt="Graduation cap and a stack of books" loading="lazy" />
          </section>
          <section className="home-faq" id="faq" aria-labelledby="home-faq-title">
            <h2 id="home-faq-title">Frequently Asked Questions</h2>
            <div>
              <details><summary>How do I start using ScholarOne?</summary><p>Create a student account, complete your profile, and explore scholarships, pathway assessments, and academic advisors.</p></details>
              <details><summary>How do I apply for a scholarship?</summary><p>Open a scholarship’s details to review its eligibility, deadline, and application instructions. Follow the application method shown in the listing and check the provider’s official source.</p></details>
              <details><summary>Can I speak with an academic advisor?</summary><p>Sign in to your student account and open Appointments to see advisors’ availability and request a consultation.</p></details>
            </div>
          </section>
        </>}
      </main>
      <footer className="home-footer">
        <div className="home-footer-grid">
          <div className="home-footer-intro"><Link to="/" className="home-brand" aria-label="ScholarOne home">{brand}</Link><p>A scholarship management and academic pathway platform connecting students, providers, and advisors in one place.</p></div>
          <nav aria-label="Footer quick links"><h2>Quick Links</h2><Link to="/">Home</Link><Link to="/about">About Us</Link><Link to="/scholarships">Scholarships</Link><Link to="/pathway-quiz">Academic Pathways</Link><a href="/#faq">FAQ</a></nav>
          <nav aria-label="Account links"><h2>For Users</h2><button type="button" onClick={() => openRoleDialog('login')}>Log In</button><button type="button" onClick={() => openRoleDialog('signup')}>Sign Up</button><Link to="/sponsor-login">Provider Login</Link><Link to="/staff-login">Staff Login</Link></nav>
          <div className="home-footer-help"><h2>Getting Started</h2><p>Find answers about scholarship discovery, academic pathways, and advisor consultations.</p><a href="/#faq">Explore the FAQ <Icon name="chevron" /></a></div>
        </div>
        <div className="home-footer-bottom">© ScholarOne {new Date().getFullYear()}. All rights reserved.</div>
      </footer>
      <dialog ref={roleDialog} className="role-selection-dialog" aria-labelledby="role-selection-title" onClick={(event) => { if (event.target === event.currentTarget) roleDialog.current?.close() }}>
        <div className="role-selection-dialog-content" onClick={(event) => { if (event.target instanceof Element && event.target.closest('a')) roleDialog.current?.close() }}>
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
