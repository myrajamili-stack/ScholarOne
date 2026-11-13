import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../../api/axios";
import { getApiErrorMessage } from "../../utils/apiError";
import { getStoredUser } from "../../utils/authStorage";
import AdvisorPageHeader, { ManagementStats } from "../../components/advisor/AdvisorPageHeader";
import AdvisorIcon from "../../components/advisor/AdvisorIcon";
import ProfileAvatar from "../../components/advisor/ProfileAvatar";
type Status = "pending" | "confirmed" | "completed" | "cancelled";
type Appointment = {
    appointment_id: number;
    student_id: number;
    student_name: string;
    student_photo?: string | null;
    student_email?: string | null;
    student_phone?: string | null;
    field_of_study?: string | null;
    university?: string | null;
    appointment_datetime: string | null;
    duration_minutes: number;
    appointment_status: Status;
    consultation_topic?: string | null;
    student_message?: string | null;
};
type Data = {
    summary: {
        confirmed: number;
        pending: number;
        completed: number;
        total: number;
    };
    appointments: Appointment[];
};
const statuses = ["all", "pending", "confirmed", "completed", "cancelled"] as const;
type Filter = typeof statuses[number];
const label = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
function dateText(value: string | null) { return value ? new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date(value)) : "Date not set"; }
function timeText(value: string | null, minutes = 0) { return value ? new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", hour: "numeric", minute: "2-digit" }).format(new Date(new Date(value).getTime() + minutes * 60000)) : "–"; }
function localDate() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function StatusBadge({ status }: {
    status: Status;
}) { return <span className={`am-status ${status}`}><AdvisorIcon name={status === "pending" ? "hourglass" : status === "cancelled" ? "close" : "appointment"}/>{label(status)}</span>; }
function RescheduleForm({ appointment, advisorId, onSaved, onClose }: {
    appointment: Appointment;
    advisorId: number;
    onSaved: () => void;
    onClose: () => void;
}) {
    const [date, setDate] = useState(localDate);
    const [slots, setSlots] = useState<string[]>([]);
    const [slot, setSlot] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [refresh, setRefresh] = useState(0);
    const url = `/advisors/${advisorId}/appointments/${appointment.appointment_id}/reschedule`;
    const last = new Date(`${localDate()}T12:00:00Z`);
    last.setUTCDate(last.getUTCDate() + 90);
    useEffect(() => {
        const controller = new AbortController();
        api.get<{
            slots: string[];
        }>(url, { params: { date }, signal: controller.signal }).then(({ data }) => { if (!controller.signal.aborted)
            setSlots(data.slots); }).catch(e => { if (!controller.signal.aborted) {
            setSlots([]); setError(getApiErrorMessage(e, "Unable to load rescheduling times.")); } }).finally(() => { if (!controller.signal.aborted)
            setLoading(false); });
        return () => controller.abort();
    }, [url, date, refresh]);
    async function submit(event: React.FormEvent) { event.preventDefault(); if (!slot || saving || loading)
        return; setSaving(true); setError(""); try {
        await api.patch(url, { appointment_datetime: slot });
        onSaved();
    }
    catch (e) {
        setError(getApiErrorMessage(e, "Unable to reschedule this appointment."));
        setSlot("");
        setLoading(true);
        setRefresh(value => value + 1);
    }
    finally {
        setSaving(false);
    } }
    return <form className="am-reschedule" onSubmit={submit}><h3>Reschedule Consultation</h3><p className="am-muted">The {appointment.duration_minutes}-minute duration and current status will be kept.</p><label className="am-label">New date<input type="date" value={date} min={localDate()} max={last.toISOString().slice(0, 10)} required disabled={saving} onChange={event => { setDate(event.target.value); setSlot(""); setSlots([]); setError(""); setLoading(true); }}/></label><label className="am-label">Available time<select required value={slot} disabled={loading || saving} onChange={event => {setSlot(event.target.value);setError("");}}><option value="">{loading ? "Loading available times…" : "Choose a time"}</option>{slots.map(value => <option value={value} key={value}>{value.slice(11, 16)}</option>)}</select></label>{!loading && !slots.length && !error && <p className="am-muted">No available times on this date. Choose another date.</p>}{error && <p className="am-feedback error" role="alert">{error} <button type="button" disabled={loading || saving} onClick={()=>{setSlot("");setError("");setLoading(true);setRefresh(value=>value+1);}}>Retry</button></p>}<div className="am-actions"><button className="am-primary" disabled={saving || loading || !slot || !!error}>{saving ? "Saving…" : "Save New Time"}</button><button type="button" disabled={saving} onClick={onClose}>Close</button></div></form>;
}
export default function AdvisorAppointmentsPage() {
    const [now] = useState(Date.now);
    const [params] = useSearchParams();
    const advisorId = getStoredUser()?.user_id;
    const details = useRef<HTMLElement>(null);
    const [data, setData] = useState<Data | null>(null);
    const [filter, setFilter] = useState<Filter>(() => statuses.includes(params.get("status") as Filter) ? params.get("status") as Filter : "all");
    const [selectedId, setSelectedId] = useState<number | null>(() => Number(params.get("appointment")) || null);
    const [search, setSearch] = useState("");
    const [advanced, setAdvanced] = useState(false);
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [sort, setSort] = useState("asc");
    const [refresh, setRefresh] = useState(0);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState(false);
    const [rescheduling, setRescheduling] = useState(false);
    useEffect(() => {
        const controller = new AbortController();
        if (!advisorId)
            return;
        api.get<Data>(`/advisors/${advisorId}/appointments`, { signal: controller.signal }).then(({ data }) => { if (!controller.signal.aborted)
            setData({ ...data, appointments: data.appointments.map(item => ({ ...item, appointment_status: (item.appointment_status || "pending").toLowerCase() as Status })) }); }).catch(e => { if (!controller.signal.aborted)
            setError(getApiErrorMessage(e, "Unable to load appointments.")); }).finally(() => { if (!controller.signal.aborted)
            setLoading(false); });
        return () => controller.abort();
    }, [advisorId, refresh]);
    const studentId = Number(params.get("student")) || null;
    const all = (data?.appointments || []).filter(item=>!studentId || item.student_id===studentId);
    const counts = Object.fromEntries(statuses.map(status => [status, status === "all" ? all.length : all.filter(item => item.appointment_status === status).length]));
    const visible = all.filter(item => (filter === "all" || item.appointment_status === filter) && [item.student_name, item.student_email, item.field_of_study, item.consultation_topic].some(value => value?.toLowerCase().includes(search.trim().toLowerCase())) && (!from || !!item.appointment_datetime && item.appointment_datetime.slice(0, 10) >= from) && (!to || !!item.appointment_datetime && item.appointment_datetime.slice(0, 10) <= to)).sort((a, b) => (a.appointment_datetime || "").localeCompare(b.appointment_datetime || "") * (sort === "asc" ? 1 : -1));
    const selected = visible.find(item => item.appointment_id === selectedId) || visible.find(item => ["pending", "confirmed"].includes(item.appointment_status) && !!item.appointment_datetime && new Date(item.appointment_datetime).getTime() > now) || visible[0];
    async function statusChange(status: Status) { if (!selected || updating || !advisorId)
        return; setUpdating(true); setError(""); setSuccess(""); try {
        await api.patch(`/advisors/${advisorId}/appointments/${selected.appointment_id}/status`, { status });
        setData(current => current && ({ ...current, appointments: current.appointments.map(item => item.appointment_id === selected.appointment_id ? { ...item, appointment_status: status } : item) }));
        setSuccess(`Appointment ${status}.`);
        setRescheduling(false);
        setRefresh(value => value + 1);
    }
    catch (e) {
        setError(getApiErrorMessage(e, "Unable to update this appointment."));
    }
    finally {
        setUpdating(false);
    } }
    return <div className="am-page am-appointments"><AdvisorPageHeader title="Appointments" description="Review student requests, confirm consultations, and track completed sessions."/>
    <ManagementStats items={[{ label: "Pending Requests", value: counts.pending, icon: "hourglass", tone: "amber" }, { label: "Confirmed", value: counts.confirmed, icon: "appointment", tone: "blue" }, { label: "Completed", value: counts.completed, icon: "flag", tone: "green" }, { label: "Total Appointments", value: counts.all, icon: "calendar", tone: "purple" }]}/>
    {error && <p className="am-feedback error" role="alert">{error} <button type="button" onClick={() => { setError(""); setRefresh(value => value + 1); }}>Retry</button></p>}{success && <p className="am-feedback success" role="status">{success}</p>}
    {studentId && <p className="am-feedback">Showing consultation history for the selected student. <a href="/advisor/appointments">View all appointments</a></p>}
    <div className="am-appointment-columns"><section className="am-card am-bookings"><div className="am-board-heading"><h2>Student Booking Requests</h2><label className="am-search"><AdvisorIcon name="search"/><input aria-label="Search bookings" value={search} onChange={event => { setSearch(event.target.value); setRescheduling(false); }} placeholder="Search by student name or topic…"/></label><button type="button" className="am-icon-button" aria-label="Show date and sort filters" aria-expanded={advanced} onClick={() => setAdvanced(value => !value)}><AdvisorIcon name="filter"/></button><button type="button" className="am-icon-button" aria-label="Refresh appointments" onClick={() => { setError(""); setRefresh(value => value + 1); }}><AdvisorIcon name="refresh"/></button></div>
      <div className="am-filter-tabs" aria-label="Filter by appointment status">{statuses.map(status => <button type="button" key={status} className={filter === status ? "active" : ""} aria-pressed={filter === status} onClick={() => { setFilter(status); setRescheduling(false); }}>{label(status)} ({counts[status]})</button>)}</div>
      {advanced && <div className="am-advanced"><label className="am-label">From<input type="date" value={from} max={to || undefined} onChange={event => { setFrom(event.target.value); setRescheduling(false); }}/></label><label className="am-label">To<input type="date" value={to} min={from || undefined} onChange={event => { setTo(event.target.value); setRescheduling(false); }}/></label><label className="am-label">Sort<select value={sort} onChange={event => setSort(event.target.value)}><option value="asc">Earliest first</option><option value="desc">Latest first</option></select></label><button type="button" onClick={() => { setFrom(""); setTo(""); setSearch(""); setFilter("all"); setSort("asc"); }}>Clear Filters</button></div>}
      {loading ? <p className="am-empty" role="status">Loading student bookings…</p> : visible.length ? <div className="am-booking-list">{visible.map(item => <article id={`appointment-${item.appointment_id}`} className={`am-request ${item.appointment_status} ${selected?.appointment_id === item.appointment_id ? "selected" : ""}`} key={item.appointment_id}><div className="am-request-date"><strong>{dateText(item.appointment_datetime)}</strong><span>{timeText(item.appointment_datetime)} – {timeText(item.appointment_datetime, item.duration_minutes)}</span></div><div className="am-request-student"><ProfileAvatar className="am-student-avatar" name={item.student_name} imageUrl={item.student_photo}/><div><strong>{item.student_name}</strong><small>{item.field_of_study || "Field of study not provided"}</small></div></div><span className="am-request-topic"><AdvisorIcon name="graduation"/>{item.consultation_topic || "Academic Consultation"}</span><StatusBadge status={item.appointment_status}/><button type="button" className="am-view-details" aria-label={`View details for ${item.student_name}`} aria-pressed={selected?.appointment_id === item.appointment_id} onClick={() => { setSelectedId(item.appointment_id); setRescheduling(false); requestAnimationFrame(() => { if (window.matchMedia("(max-width:1000px)").matches)
        details.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); details.current?.focus({ preventScroll: true }); }); }}>View Details <AdvisorIcon name="chevron"/></button></article>)}</div> : <div className="am-empty">{all.length ? "No bookings match your filters." : "No student bookings yet. New requests will appear here."}</div>}
    </section><aside className="am-card am-details" ref={details} tabIndex={-1}><h2><AdvisorIcon name="users"/>Appointment Details</h2>{selected ? <><div className="am-detail-card"><header><ProfileAvatar className="am-student-avatar" name={selected.student_name} imageUrl={selected.student_photo}/><div><strong>{selected.student_name}</strong><small>{selected.field_of_study || "Field of study not provided"}</small></div><StatusBadge status={selected.appointment_status}/></header><dl><div><dt><AdvisorIcon name="calendar"/>Date & Time</dt><dd>{dateText(selected.appointment_datetime)} · {timeText(selected.appointment_datetime)} – {timeText(selected.appointment_datetime, selected.duration_minutes)}<small>{selected.duration_minutes} minutes · Malaysia time</small></dd></div><div><dt><AdvisorIcon name="graduation"/>Consultation Topic</dt><dd>{selected.consultation_topic || "Academic Consultation"}</dd></div><div><dt><AdvisorIcon name="message"/>Student’s Message</dt><dd>{selected.student_message || "No message provided."}</dd></div>{selected.student_email && <div><dt><AdvisorIcon name="user"/>Contact</dt><dd>{selected.student_email}{selected.student_phone && <small>{selected.student_phone}</small>}</dd></div>}</dl></div><div className="am-actions am-detail-actions">{selected.appointment_status === "pending" && <button className="am-primary" type="button" disabled={updating} onClick={() => statusChange("confirmed")}><AdvisorIcon name="appointment"/>Confirm</button>}{selected.appointment_status === "confirmed" && <button type="button" disabled={updating} onClick={() => statusChange("completed")}><AdvisorIcon name="appointment"/>Mark as Completed</button>}{["pending", "confirmed"].includes(selected.appointment_status) && <><button type="button" disabled={updating} aria-expanded={rescheduling} onClick={() => setRescheduling(value => !value)}><AdvisorIcon name="calendar"/>Reschedule</button><button type="button" className="danger" disabled={updating} onClick={() => statusChange("cancelled")}><AdvisorIcon name="close"/>Cancel</button></>}</div>{rescheduling && advisorId && <RescheduleForm key={selected.appointment_id} appointment={selected} advisorId={advisorId} onClose={() => setRescheduling(false)} onSaved={() => { setRescheduling(false); setSuccess("Appointment rescheduled. The updated time is visible to the student."); setRefresh(value => value + 1); }}/>}</> : <p className="am-empty">Select a student booking to review its details.</p>}</aside></div>
  </div>;
}
