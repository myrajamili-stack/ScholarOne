import { useEffect, useRef, useState, type FormEvent, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import api from "../../api/axios";
import { getApiErrorMessage } from "../../utils/apiError";
import { getStoredUser, storeUser } from "../../utils/authStorage";
import { getInitials } from "../../utils/userDisplay";
import AdvisorIcon, { type AdvisorIconName } from "../../components/advisor/AdvisorIcon";
import AdvisorAccountMenu from "../../components/advisor/AdvisorAccountMenu";
import "../../styles/advisor-home.css";
import "../../styles/advisor-profile.css";
type Draft = {
    full_name: string;
    email: string;
    phone_number: string;
    institution: string;
    professional_title: string;
    profile_picture: string;
    bio: string;
    specialization: string;
    qualification: string;
    experience_years: string;
};
type Profile = Omit<Draft, "experience_years"> & {
    advisor_id: number;
    experience_years: number | null;
    average_rating: number | string;
    students_guided: number;
    has_availability: boolean;
};
type Tab = "about" | "expertise" | "qualifications";
const tabs: {
    id: Tab;
    label: string;
    icon: AdvisorIconName;
}[] = [{ id: "about", label: "About Me", icon: "user" }, { id: "expertise", label: "Expertise", icon: "layers" }, { id: "qualifications", label: "Qualifications", icon: "graduation" }];
const fieldTabs: Record<keyof Draft, Tab> = { full_name: "about", email: "about", phone_number: "about", institution: "about", professional_title: "about", profile_picture: "about", bio: "about", specialization: "expertise", qualification: "qualifications", experience_years: "qualifications" };
const labels: Record<keyof Draft, string> = { full_name: "Full Name", email: "Email Address", phone_number: "Phone Number", institution: "Institution / Organization", professional_title: "Professional Title", profile_picture: "Profile Picture URL", bio: "Short Bio / Introduction", specialization: "Expertise & Specialization", qualification: "Qualifications", experience_years: "Years of Experience" };
const limits: Partial<Record<keyof Draft, number>> = { full_name: 100, email: 100, institution: 150, professional_title: 100, profile_picture: 255, bio: 300, specialization: 100, qualification: 100 };
const required = ["full_name", "email", "institution", "professional_title", "bio"];
function toDraft(p: Profile): Draft { return Object.fromEntries(Object.keys(fieldTabs).map(key => [key, String(p[key as keyof Draft] ?? "")])) as Draft; }
function validate(d: Draft) {
    const errors: Partial<Record<keyof Draft, string>> = {};
    for (const key of Object.keys(fieldTabs) as (keyof Draft)[]) {
        const value = d[key].trim();
        if (required.includes(key) && value.length < 2)
            errors[key] = "This field is required (at least 2 characters).";
        if (limits[key] && value.length > limits[key]!)
            errors[key] = `Use at most ${limits[key]} characters.`;
    }
    if (d.full_name && (!/\p{L}/u.test(d.full_name) || !/^[\p{L}\p{M}\s.'’-]+$/u.test(d.full_name)))
        errors.full_name = "Use letters, spaces, apostrophes, dots or hyphens for your name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim()))
        errors.email = "Enter a valid email address.";
    if (d.phone_number.trim() && (!/^\+?[0-9\s()-]+$/.test(d.phone_number.trim()) || !/^\+?[0-9]{7,15}$/.test(d.phone_number.replace(/[\s()-]/g, ""))))
        errors.phone_number = "Enter 7–15 digits; only a leading +, spaces, hyphens and brackets are allowed.";
    if (d.experience_years !== "" && (!/^\d{1,2}$/.test(d.experience_years) || Number(d.experience_years) > 60))
        errors.experience_years = "Enter a whole number from 0 to 60.";
    if (d.profile_picture.trim()) {
        try {
            const url = new URL(d.profile_picture.trim());
            if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || /\s/.test(d.profile_picture.trim()))
                throw Error();
        }
        catch {
            errors.profile_picture = "Enter a valid http:// or https:// image URL.";
        }
    }
    return errors;
}
function Avatar({ profile, large = false }: {
    profile: Profile;
    large?: boolean;
}) {
    const [failedUrl, setFailedUrl] = useState("");
    return <span className={`ap-avatar${large ? " large" : ""}`}>{profile.profile_picture && failedUrl !== profile.profile_picture ? <img src={profile.profile_picture} alt={profile.full_name} onError={() => setFailedUrl(profile.profile_picture)}/> : getInitials(profile.full_name)}</span>;
}
export default function AdvisorProfilePage() {
    const userId = getStoredUser()?.user_id;
    const [profile, setProfile] = useState<Profile | null>(null);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [tab, setTab] = useState<Tab>("about");
    const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(!!userId);
    const photoInput = useRef<HTMLInputElement>(null);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const [photoError, setPhotoError] = useState("");
    const [photoSuccess, setPhotoSuccess] = useState("");
    useEffect(() => {
        let active = true;
        if (!userId)
            return;
        api.get<Profile>(`/advisors/${userId}/profile`).then(({ data }) => { if (active) {
            setProfile(data);
            setDraft(toDraft(data));
        } }).catch(e => { if (active)
            setError(getApiErrorMessage(e, "Unable to load your profile.")); }).finally(() => { if (active)
            setLoading(false); });
        return () => { active = false; };
    }, [userId]);
    function selectTab(next: Tab) { setTab(next); }
    async function uploadPhoto(file?: File) {
        if (!file || uploadingPhoto || saving) return;
        setPhotoError(""); setPhotoSuccess("");
        if (file.size > 5 * 1024 * 1024) { setPhotoError("Choose a photo smaller than 5 MB."); return; }
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setPhotoError("Choose a JPG, PNG or WebP photo."); return; }
        setUploadingPhoto(true);
        try {
            const body = new FormData(); body.append("photo", file);
            const { data } = await api.post<{profile_picture: string}>(`/advisors/${userId}/profile/photo`, body);
            setProfile(previous => previous ? {...previous, profile_picture: data.profile_picture} : previous);
            setDraft(previous => previous ? {...previous, profile_picture: data.profile_picture} : previous);
            const user = getStoredUser(); if(user) storeUser({...user, profile_picture:data.profile_picture});
            setPhotoSuccess("Profile photo saved.");
        } catch(e) { setPhotoError(getApiErrorMessage(e, "Unable to upload your photo. Please try again.")); }
        finally {setUploadingPhoto(false);}
    }
    function focusError(found: Partial<Record<keyof Draft, string>>) { const first = Object.keys(found)[0] as keyof Draft; if (first && fieldTabs[first]) {
        setTab(fieldTabs[first]);
        requestAnimationFrame(() => document.getElementById(`ap-${first}`)?.focus());
    } }
    async function save(event: FormEvent) {
        event.preventDefault();
        if (!draft || saving || uploadingPhoto)
            return;
        setSuccess("");
        setError("");
        const found = validate(draft);
        setErrors(found);
        if (Object.keys(found).length) {
            setError("Please correct the highlighted fields before saving.");
            focusError(found);
            return;
        }
        setSaving(true);
        try {
            const { data } = await api.put<Profile>(`/advisors/${userId}/profile`, { ...draft, experience_years: draft.experience_years === "" ? null : Number(draft.experience_years) });
            setProfile(data);
            setDraft(toDraft(data));
            const user = getStoredUser();
            if (user)
                storeUser({ ...user, full_name: data.full_name, email: data.email, phone_number: data.phone_number, profile_picture: data.profile_picture });
            setSuccess("Your profile has been saved. Students will see your updated professional details.");
        }
        catch (e) {
            setError(getApiErrorMessage(e, "Unable to save your profile."));
            if (axios.isAxiosError(e) && e.response?.data.fields) {
                setErrors(e.response.data.fields);
                focusError(e.response.data.fields);
            }
        }
        finally {
            setSaving(false);
        }
    }
    if (loading)
        return <section className="advisor-empty-state">Loading your profile…</section>;
    if (!profile || !draft)
        return <section className="advisor-empty-state" role="alert">{error || "Please sign in to view your profile."}<button onClick={() => window.location.reload()}>Try again</button></section>;
    const completion = [{ label: "Personal Information", done: !!(profile.full_name && profile.email && profile.institution && profile.professional_title), tab: "about" as Tab }, { label: "Expertise & Specialization", done: !!profile.specialization, tab: "expertise" as Tab }, { label: "Qualifications", done: !!profile.qualification, tab: "qualifications" as Tab }, { label: "Profile Introduction", done: !!profile.bio, tab: "about" as Tab }];
    const percent = completion.filter(item => item.done).length * 25;
    const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(profile));
    function field(key: keyof Draft) {
        if (!draft)
            return null;
        if (key === "profile_picture") return <div className="ap-field" key={key}><span>Profile Picture <small>(Optional)</small></span><button type="button" className="ap-upload-button" disabled={saving || uploadingPhoto} onClick={() => photoInput.current?.click()}>{uploadingPhoto ? "Uploading…" : "Choose Photo"}</button><small>Choose from your photo library or files. JPG, PNG or WebP, up to 5 MB. Your photo saves immediately.</small></div>;
        const props = { id: `ap-${key}`, name: key, value: draft[key], required: required.includes(key), disabled: saving || uploadingPhoto, "aria-invalid": !!errors[key], "aria-describedby": errors[key] ? `ap-error-${key}` : undefined, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { const next = { ...draft, [key]: event.target.value }; setDraft(next); if (errors[key])
                setErrors(prev => ({ ...prev, [key]: validate(next)[key] })); setSuccess(""); }, onBlur: () => setErrors(prev => ({ ...prev, [key]: validate(draft)[key] })), maxLength: limits[key] };
        return <label className={key === "bio" ? "ap-field wide" : "ap-field"} key={key} htmlFor={props.id}><span>{labels[key]} {required.includes(key) && <b aria-label="required">*</b>}</span>{key === "bio" ? <><textarea {...props} rows={4}/><small className="ap-counter">{draft.bio.length} / 300</small></> : <input {...props} type={key === "email" ? "email" : key === "phone_number" ? "tel" : "text"} inputMode={key === "experience_years" ? "numeric" : undefined} autoComplete={key === "full_name" ? "name" : key === "email" ? "email" : key === "phone_number" ? "tel" : undefined} placeholder={key === "phone_number" ? "+60 12-345 6789" : undefined}/>} {errors[key] && <small id={`ap-error-${key}`} className="ap-field-error">{errors[key]}</small>}</label>;
    }
    return <div className="ap-page">
    <header className="ap-heading"><div><h1>My Profile <span aria-hidden="true">✦</span></h1><p>Manage your personal details, expertise, and professional profile<br className="ap-desktop"/> shown to students.</p></div><div className="ap-header-actions"><Link to="/advisor/messages" className="ap-messages-link" aria-label="Open messages"><AdvisorIcon name="bell"/></Link><AdvisorAccountMenu name={profile.full_name} imageUrl={profile.profile_picture} /></div></header>
    <section className="ap-banner"><div className="ap-photo"><Avatar profile={profile} large/><button type="button" aria-label="Choose profile photo" disabled={saving || uploadingPhoto} onClick={() => photoInput.current?.click()}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m8 5 2-3h4l2 3h5v16H3V5h5Z"/><circle cx="12" cy="12" r="4"/></svg></button></div><div className="ap-identity"><h2>{profile.full_name}</h2><span className="ap-role">{profile.professional_title || "Academic Advisor"}</span><p><AdvisorIcon name="graduation"/>{profile.specialization || "Add your specialization"}</p><p><AdvisorIcon name="home"/>{profile.institution || "Add your institution"}</p></div><Link to="/advisor/feedback" className="ap-stat"><AdvisorIcon name="star"/><div><strong>{Number(profile.average_rating).toFixed(1)} / 5</strong><span>Average Rating</span></div></Link><Link to="/advisor/students" className="ap-stat"><AdvisorIcon name="users"/><div><strong>{profile.students_guided}</strong><span>Students Guided</span></div></Link></section>
    <div className="ap-tabs" role="tablist" aria-label="Profile sections">{tabs.map((item, index) => <button key={item.id} id={`ap-tab-${item.id}`} role="tab" aria-selected={tab === item.id} aria-controls={`ap-panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1} className={tab === item.id ? "active" : ""} onClick={() => selectTab(item.id)} onKeyDown={event => { let next: number; if (event.key === "ArrowRight")
        next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft")
        next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === "Home")
        next = 0;
    else if (event.key === "End")
        next = tabs.length - 1;
    else
        return; event.preventDefault(); selectTab(tabs[next].id); document.getElementById(`ap-tab-${tabs[next].id}`)?.focus(); }}><AdvisorIcon name={item.icon}/>{item.label}</button>)}</div>
    <input ref={photoInput} id="ap-photo-file" className="ap-photo-input" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose a profile photo from your device" disabled={saving || uploadingPhoto} onChange={event => {const file = event.target.files?.[0]; event.target.value = ""; void uploadPhoto(file);}}/>
    {photoError && <p className="ap-notice error" role="alert">{photoError}</p>}{photoSuccess && <p className="ap-notice success" role="status">{photoSuccess}</p>}{uploadingPhoto && <p className="ap-notice" role="status">Uploading your photo…</p>}
    {error && <p className="ap-notice error" role="alert">{error}</p>}{success && <p className="ap-notice success" role="status">{success}</p>}
    <div className="ap-columns"><div className="ap-content">
      <form className="ap-card" noValidate onSubmit={save} >
        <div className="ap-card-heading"><span className="ap-section-icon"><AdvisorIcon name={tabs.find(t => t.id === tab)?.icon || "user"}/></span><div><h2>{tab === "about" ? "Personal Information" : tab === "expertise" ? "Expertise & Specialization" : "Professional Qualifications"}</h2><p>{tab === "about" ? "Basic contact details and professional information." : "Help students understand your professional background."}</p></div><button className="ap-save" type="submit" disabled={saving || uploadingPhoto}>{saving ? "Saving…" : "Save Changes"}</button></div>
        {(["about", "expertise", "qualifications"] as Tab[]).map(panel => <section role="tabpanel" id={`ap-panel-${panel}`} aria-labelledby={`ap-tab-${panel}`} key={panel} hidden={tab !== panel}><div className="ap-fields">{(Object.keys(fieldTabs) as (keyof Draft)[]).filter(key => fieldTabs[key] === panel).map(field)}</div></section>)}
        {dirty && <p className="ap-unsaved">You have unsaved changes.</p>}
      </form>
    </div><aside className="ap-aside"><section className="ap-card ap-completion"><div className="ap-completion-heading"><div><h2>◎ Profile Completion</h2><p>Complete your profile to help students get to know you.</p></div><div className="ap-ring" style={{ "--completion": `${percent}%` } as CSSProperties}><strong>{percent}%</strong></div></div><ul>{completion.map(item => <li key={item.label}><button type="button" onClick={() => selectTab(item.tab)}><span className={item.done ? "done" : ""} aria-label={item.done ? "Complete" : "Incomplete"}>{item.done ? "✓" : ""}</span>{item.label}</button></li>)}</ul><small>Based on saved information.</small></section><section className="ap-card ap-verification"><h2>♧ Account Status</h2><div><strong>✓ Active Academic Advisor</strong><p>Your account can receive student bookings and messages. Professional credentials are self-reported.</p></div></section><Link className="ap-back" to="/advisor/dashboard">← Back to Dashboard</Link></aside></div>
  </div>;
}
