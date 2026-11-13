import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../../api/axios";
import { getApiErrorMessage } from "../../utils/apiError";
import { clearStoredUser, getStoredUser, storeUser } from "../../utils/authStorage";
import type { AuthUser } from "../../types/auth";
import Icon from "../../components/advisor/AdvisorIcon";
import type { AdvisorIconName } from "../../components/advisor/AdvisorIcon";
import "../../styles/admin-users.css";
import "../../styles/admin-settings.css";

type General = { platform_name: string; platform_tagline: string; support_email: string; support_phone: string; platform_description: string };
type Settings = { general: General; account: AuthUser; notification_preferences_available: boolean };
const sections = [{label:"General",icon:"settings"}, {label:"Admin Account & Security",icon:"shield"}, {label:"Notification Preferences",icon:"bell"}] as const;
const fields: {key: keyof General; label: string; limit: number; required?: boolean; type?: string}[] = [
  {key:"platform_name",label:"Platform Name",limit:60,required:true},
  {key:"platform_tagline",label:"Platform Tagline",limit:120,required:true},
  {key:"support_email",label:"Support Email",limit:254,type:"email"},
  {key:"support_phone",label:"Support Phone",limit:40,type:"tel"},
  {key:"platform_description",label:"Platform Description",limit:500,required:true},
];
function Heading({icon,title,text}:{icon:AdvisorIconName;title:string;text?:string}) {return <header className="ast-heading"><span><Icon name={icon}/></span><div><h2>{title}</h2>{text && <p>{text}</p>}</div></header>;}
function validPhone(phone:string) {return !phone || (/^\+?[0-9 ()-]+$/.test(phone) && phone.replace(/\D/g,"").length >= 7 && phone.replace(/\D/g,"").length <= 15);}
export default function AdminSettingsPage() {
  const [saved,setSaved] = useState<Settings | null>(null);
  const [general,setGeneral] = useState<General | null>(null);
  const [account,setAccount] = useState({full_name:"",phone_number:""});
  const [tab,setTab] = useState(0);
  const [loading,setLoading] = useState(true); const [saving,setSaving] = useState(false);
  const [error,setError] = useState(""); const [success,setSuccess] = useState("");
  const [errors,setErrors] = useState<Record<string,string>>({}); const [retry,setRetry] = useState(0);
  const busy = useRef(false); const navigate = useNavigate();
  useEffect(() => {
    const controller = new AbortController();
    api.get<Settings>("/admin/settings",{signal:controller.signal}).then(response => {
      if (controller.signal.aborted) return;
      setSaved(response.data); setGeneral(response.data.general);
      setAccount({full_name:response.data.account.full_name,phone_number:response.data.account.phone_number || ""});
    }).catch(err => {if (!controller.signal.aborted) setError(getApiErrorMessage(err,"Unable to load settings."));})
      .finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  },[retry]);
  function reset() {
    if (!saved) return;
    setGeneral(saved.general); setAccount({full_name:saved.account.full_name,phone_number:saved.account.phone_number || ""});
    setErrors({}); setError(""); setSuccess("");
  }
  async function save(event:FormEvent) {
    event.preventDefault(); if (!saved || !general || busy.current) return;
    setError(""); setSuccess(""); const problems:Record<string,string> = {};
    if (tab === 0) {
      fields.forEach(field => {if (field.required && !general[field.key].trim()) problems[field.key] = "This field is required.";});
      if (general.support_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(general.support_email.trim())) problems.support_email = "Enter a valid email address.";
      if (!validPhone(general.support_phone.trim())) problems.support_phone = "Enter 7–15 digits; letters are not allowed.";
    } else {
      if (!account.full_name.trim()) problems.full_name = "Enter your full name.";
      if (!validPhone(account.phone_number.trim())) problems.phone_number = "Enter 7–15 digits; letters are not allowed.";
    }
    setErrors(problems);
    if (Object.keys(problems).length) {setError("Please correct the highlighted fields before saving."); return;}
    busy.current = true; setSaving(true);
    try {
      const response = await api.patch<Partial<Settings>>("/admin/settings",tab === 0 ? {section:"general",...general} : {section:"account",...account});
      if (tab === 0 && response.data.general) {
        const next = response.data.general; setGeneral(next); setSaved({...saved,general:next});
        window.dispatchEvent(new CustomEvent("scholarone-platform-updated",{detail:next}));
      } else if (response.data.account) {
        const next = response.data.account; setAccount({full_name:next.full_name,phone_number:next.phone_number || ""}); setSaved({...saved,account:next});
        const user = getStoredUser(); if (user) storeUser({...user,...next});
      }
      setSuccess("Changes saved successfully.");
    } catch (err) {setError(getApiErrorMessage(err,"Unable to save settings. Please try again."));}
    finally {busy.current = false; setSaving(false);}
  }
  const configured = !!saved?.general.support_email;
  return <div className="aum-page ast-page">
    <nav className="aum-tabs ast-tabs" aria-label="Settings sections">{sections.map((section,index) => <button type="button" key={section.label} aria-pressed={tab===index} disabled={saving} onClick={() => {setTab(index);setError("");setSuccess("");setErrors({});}}><Icon name={section.icon}/>{section.label}</button>)}</nav>
    {loading ? <p role="status">Loading system settings…</p> : !saved || !general ? <p className="aum-form-error" role="alert">{error || "Settings are unavailable."} <button onClick={() => {setError("");setLoading(true);setRetry(n=>n+1);}}>Retry</button></p> : <>
      {error && <p className="aum-form-error" role="alert">{error}</p>}{success && <p className="aum-success" role="status">{success}</p>}
      <div className="ast-layout"><section className="adh-panel ast-main">
        {tab===0 && <form onSubmit={save} noValidate><Heading icon="settings" title="General Settings" text="Manage platform information and support contact details."/><div className="ast-fields">{fields.map(field => <div className="ast-field" key={field.key}><label htmlFor={`ast-${field.key}`}>{field.label}{field.required && <span aria-hidden="true"> *</span>}</label><div>{field.key === "platform_description" ? <textarea id={`ast-${field.key}`} value={general[field.key]} maxLength={field.limit} required={field.required} aria-invalid={!!errors[field.key]} aria-describedby={errors[field.key]?`ast-${field.key}-error`:undefined} disabled={saving} onChange={event=>setGeneral({...general,[field.key]:event.target.value})}/> : <input id={`ast-${field.key}`} type={field.type || "text"} value={general[field.key]} maxLength={field.limit} required={field.required} aria-invalid={!!errors[field.key]} aria-describedby={errors[field.key]?`ast-${field.key}-error`:undefined} disabled={saving} onChange={event=>setGeneral({...general,[field.key]:event.target.value})}/>}{errors[field.key] && <small className="ast-error" id={`ast-${field.key}-error`}>{errors[field.key]}</small>}</div></div>)}</div><p className="ast-note">Saved name and tagline appear in the administrator sidebar. Support details and description are stored as platform information.</p><footer className="ast-actions"><button type="button" className="aum-outline" disabled={saving} onClick={reset}>Reset</button><button className="aum-primary" disabled={saving}>{saving?"Saving…":"Save Changes"}</button></footer></form>}
        {tab===1 && <><form onSubmit={save} noValidate><Heading icon="user" title="Administrator Account" text="Update your own contact details."/><div className="ast-fields">{[{key:"full_name" as const,label:"Full Name",type:"text",limit:100},{key:"phone_number" as const,label:"Phone Number",type:"tel",limit:40}].map(field=><div className="ast-field" key={field.key}><label htmlFor={`ast-${field.key}`}>{field.label}</label><div><input id={`ast-${field.key}`} type={field.type} value={account[field.key]} maxLength={field.limit} disabled={saving} aria-invalid={!!errors[field.key]} aria-describedby={errors[field.key]?`ast-${field.key}-error`:undefined} onChange={event=>setAccount({...account,[field.key]:event.target.value})}/>{errors[field.key] && <small className="ast-error" id={`ast-${field.key}-error`}>{errors[field.key]}</small>}</div></div>)}<div className="ast-field"><label htmlFor="ast-email">Email Address</label><input id="ast-email" value={saved.account.email} readOnly/></div></div><footer className="ast-actions"><button type="button" className="aum-outline" disabled={saving} onClick={reset}>Reset</button><button className="aum-primary" disabled={saving}>{saving?"Saving…":"Save Changes"}</button></footer></form><div className="ast-security"><Heading icon="shield" title="Account Security"/><div className="ast-info-row"><Icon name="lock"/><div><strong>Password & Two-Factor Authentication</strong><p>Password changes and two-factor authentication are currently unavailable.</p></div></div><div className="ast-info-row"><Icon name="user"/><div><strong>Current Session</strong><p>Signed in as {saved.account.email}</p></div><button className="aum-outline" onClick={()=>{clearStoredUser();navigate('/staff-login',{replace:true});}}>Sign Out</button></div></div></>}
        {tab===2 && <><Heading icon="bell" title="Notification Preferences" text="Review system updates that need your attention."/><p className="ast-note">Delivery preferences are not implemented yet. Use the relevant management pages to check new submissions and account activity.</p>{[{icon:"layers" as const,title:"Scholarship submissions",text:"Review pending listings and provider appeals.",to:"/admin/scholarships?status=pending"},{icon:"calendar" as const,title:"Subscription updates",text:"Monitor provider plans, quotas, and expiry dates.",to:"/admin/subscriptions"},{icon:"users" as const,title:"User accounts",text:"Review platform accounts and their status.",to:"/admin/users"}].map(row=><Link className="ast-notification" to={row.to} key={row.title}><Icon name={row.icon}/><div><strong>{row.title}</strong><p>{row.text}</p></div><Icon name="chevron"/></Link>)}</>}
      </section><aside className="ast-aside"><section className="adh-panel"><Heading icon="eye" title="About Settings"/><p>Update platform details, manage your admin account, and review system notifications.</p><p className="ast-note">Reset restores the last saved values. Changes take effect after you save.</p></section><section className="adh-panel"><Heading icon="layers" title="Current Configuration"/><div className="ast-status"><Icon name={configured?"appointment":"clock"}/><strong>Platform Information</strong><span>{configured?"Configured":"Add support email"}</span></div><div className="ast-status"><Icon name="shield"/><strong>Admin Account</strong><span>{saved.account.status || "Active"}</span></div><div className="ast-status"><Icon name="bell"/><strong>Notifications</strong><span className="unavailable">Not available</span></div><p className="ast-note">Configuration reflects saved information.</p></section></aside></div>
    </>}
  </div>;
}
