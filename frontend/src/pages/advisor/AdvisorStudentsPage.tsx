import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "../../api/axios";
import { getApiErrorMessage } from "../../utils/apiError";
import { getStoredUser } from "../../utils/authStorage";
import AdvisorPageHeader, { ManagementStats } from "../../components/advisor/AdvisorPageHeader";
import AdvisorIcon from "../../components/advisor/AdvisorIcon";
import ProfileAvatar from "../../components/advisor/ProfileAvatar";
import "../../styles/advisor-students.css";
type Consultation = {
    appointment_id: number;
    appointment_datetime: string | null;
    appointment_status: string;
    duration_minutes: number;
    consultation_topic: string;
};
type Student = {
    student_id: number;
    full_name: string;
    email: string;
    phone_number?: string | null;
    profile_picture?: string | null;
    account_status: string;
    education_level?: string | null;
    cgpa?: number | string | null;
    field_of_study?: string | null;
    university?: string | null;
    appointment_count: number;
    active_count: number;
    completed_count: number;
    latest_appointment: string | null;
    latest_consultation: Consultation;
};
type StudentsData = {
    summary: {
        total_guided: number;
        active_consultations: number;
        completed_consultations: number;
        average_rating: number | string;
    };
    students: Student[];
};
type SortKey = "full_name" | "field_of_study" | "cgpa" | "appointment_count" | "latest_appointment";
const pageSize = 5;
const cgpa = (value: Student['cgpa']) => value == null || value === "" ? "Not provided" : Number(value).toFixed(2);
const label = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
function dateText(value: string | null) { return value ? new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", year: "numeric" }).format(new Date(value)) : "Not scheduled"; }
function timeText(value: string, minutes = 0) { return new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", hour: "numeric", minute: "2-digit" }).format(new Date(new Date(value).getTime() + minutes * 60000)); }
function today() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function ScheduleConsultation({ student, advisorId, onClose, onSaved }: {
    student: Student;
    advisorId: number;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [date, setDate] = useState(today);
    const [slots, setSlots] = useState<string[]>([]);
    const [slot, setSlot] = useState("");
    const [minutes, setMinutes] = useState(30);
    const [topic, setTopic] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [refresh, setRefresh] = useState(0);
    const first = useRef<HTMLInputElement>(null);
    const previousFocus = useRef<Element | null>(null);
    const dialog = useRef<HTMLDivElement>(null);
    const last = new Date(`${today()}T12:00:00Z`);
    last.setUTCDate(last.getUTCDate() + 90);
    const url = `/advisors/${advisorId}/students/${student.student_id}/consultations`;
    useEffect(() => { previousFocus.current = document.activeElement; const previousOverflow = document.body.style.overflow; document.body.style.overflow = "hidden"; first.current?.focus(); return () => { document.body.style.overflow = previousOverflow; if (previousFocus.current instanceof HTMLElement)
        previousFocus.current.focus(); }; }, []);
    useEffect(() => { const controller = new AbortController(); api.get<{
        slots: string[];
        slot_minutes: number;
    }>(url, { params: { date }, signal: controller.signal }).then(({ data }) => { if (!controller.signal.aborted) {
        setSlots(data.slots);
        setMinutes(data.slot_minutes);
    } }).catch(e => { if (!controller.signal.aborted) {
        setSlots([]);
        setError(getApiErrorMessage(e, "Unable to load consultation times."));
    } }).finally(() => { if (!controller.signal.aborted)
        setLoading(false); }); return () => controller.abort(); }, [url, date, refresh]);
    async function submit(event: React.FormEvent) { event.preventDefault(); if (!slot || saving || loading)
        return; setSaving(true); setError(""); try {
        await api.post(url, { appointment_datetime: slot, slot_minutes: minutes, consultation_topic: topic.trim() });
        onSaved();
    }
    catch (e) {
        setError(getApiErrorMessage(e, "Unable to schedule this consultation."));
        setSlot("");
        setLoading(true);
        setRefresh(value => value + 1);
    }
    finally {
        setSaving(false);
    } }
    return <div className="as-modal-backdrop"><div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="as-book-title" className="as-modal" onKeyDown={event => { if (event.key === "Escape" && !saving) {
        onClose();
        return;
    } if (event.key === "Tab") {
        const controls = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)');
        if (!controls?.length)
            return;
        const start = controls[0], end = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === start) {
            event.preventDefault();
            end.focus();
        }
        else if (!event.shiftKey && document.activeElement === end) {
            event.preventDefault();
            start.focus();
        }
    } }}><div className="as-modal-heading"><h2 id="as-book-title">Schedule Consultation</h2><button type="button" aria-label="Close booking form" disabled={saving} onClick={onClose}><AdvisorIcon name="close"/></button></div><p className="am-muted">Book a confirmed {minutes}-minute session with {student.full_name}. The student will see the booking in My Appointments.</p><form onSubmit={submit}><label className="am-label">Date<input ref={first} type="date" required value={date} min={today()} max={last.toISOString().slice(0, 10)} disabled={saving} onChange={event => { setDate(event.target.value); setSlots([]); setSlot(""); setError(""); setLoading(true); }}/></label><label className="am-label">Available time<select required value={slot} disabled={loading || saving} onChange={event => { setSlot(event.target.value); setError(""); }}><option value="">{loading ? "Loading times…" : "Choose a time"}</option>{slots.map(value => <option key={value} value={value}>{value.slice(11, 16)}</option>)}</select></label><label className="am-label">Consultation topic (optional)<input maxLength={100} value={topic} disabled={saving} onChange={event => setTopic(event.target.value)} placeholder="e.g. Course selection"/></label>{!loading && !slots.length && !error && <p className="am-muted">No available times on this date. Choose another date or update My Schedule.</p>}{error && <p className="am-feedback error" role="alert">{error} <button type="button" disabled={loading || saving} onClick={() => { setError(""); setSlot(""); setLoading(true); setRefresh(value => value + 1); }}>Retry</button></p>}<p className="am-muted">Malaysia time · UTC+08:00</p><button className="am-primary" disabled={saving || loading || !slot || !!error}>{saving ? "Scheduling…" : "Confirm Consultation"}</button></form></div></div>;
}
export default function AdvisorStudentsPage() {
    const advisorId = getStoredUser()?.user_id;
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const focusedId = Number(params.get("student")) || null;
    const [data, setData] = useState<StudentsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [refresh, setRefresh] = useState(0);
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState("all");
    const [sort, setSort] = useState<{
        key: SortKey;
        direction: number;
    }>({ key: "latest_appointment", direction: -1 });
    const [pageOverride, setPage] = useState<number | null>(null);
    const [selectedId, setSelectedId] = useState<number | null>(focusedId);
    const [insights, setInsights] = useState(false);
    const [scheduling, setScheduling] = useState(false);
    const [startingMessage, setStartingMessage] = useState(false);
    const detail = useRef<HTMLElement>(null);
    useEffect(() => { const controller = new AbortController(); if (!advisorId)
        return; api.get<StudentsData>(`/advisors/${advisorId}/students`, { signal: controller.signal }).then(({ data }) => { if (!controller.signal.aborted)
        setData(data); }).catch(e => { if (!controller.signal.aborted)
        setError(getApiErrorMessage(e, "Unable to load your students.")); }).finally(() => { if (!controller.signal.aborted)
        setLoading(false); }); return () => controller.abort(); }, [advisorId, refresh]);
    const all = data?.students || [];
    const filtered = all.filter(student => `${student.full_name} ${student.email} #${student.student_id}`.toLowerCase().includes(search.trim().toLowerCase()) && (filter === "all" || filter === "active" && student.active_count > 0 || filter === "completed" && student.completed_count > 0 || filter === "inactive" && student.active_count === 0)).sort((a, b) => { const left = a[sort.key], right = b[sort.key]; const empty = (value: typeof left) => value == null || value === ""; if (empty(left) || empty(right))
        return empty(left) === empty(right) ? 0 : empty(left) ? 1 : -1; const result = sort.key === "cgpa" || sort.key === "appointment_count" ? Number(left) - Number(right) : String(left).localeCompare(String(right)); return result * sort.direction || a.student_id - b.student_id; });
    const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
    const focusedIndex = filtered.findIndex(student => student.student_id === (selectedId ?? focusedId));
    const page = Math.min(pageCount, Math.max(1, pageOverride ?? (focusedIndex < 0 ? 1 : Math.floor(focusedIndex / pageSize) + 1)));
    const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
    const selected = visible.find(student => student.student_id === selectedId) || visible[0];
    const recent = selected?.latest_consultation;
    const education = Object.entries(all.reduce<Record<string, number>>((result, student) => { const key = student.education_level || "Not provided"; result[key] = (result[key] || 0) + 1; return result; }, {})).sort((a, b) => b[1] - a[1]);
    const grades = all.filter(student => student.cgpa != null && student.cgpa !== "").map(student => Number(student.cgpa));
    function selectStudent(student: Student) { setSelectedId(student.student_id); setScheduling(false); requestAnimationFrame(() => { if (window.matchMedia("(max-width:1100px)").matches)
        detail.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); detail.current?.focus({ preventScroll: true }); }); }
    async function messageStudent() { if (!selected || startingMessage)
        return; setStartingMessage(true); setError(""); try {
        const { data } = await api.post<{
            conversation_id: number;
        }>("/messages/conversations", { contact_id: selected.student_id });
        navigate(`/advisor/messages?conversation=${data.conversation_id}`);
    }
    catch (e) {
        setError(getApiErrorMessage(e, "Unable to open this student’s conversation."));
    }
    finally {
        setStartingMessage(false);
    } }
    function sortBy(key: SortKey) { setSort(current => ({ key, direction: current.key === key ? -current.direction : 1 })); setPage(1); }
    function pageButton(value: number) { return <button type="button" key={value} aria-label={`Page ${value}`} aria-current={page === value ? "page" : undefined} onClick={() => setPage(value)}>{value}</button>; }
    const pageNumbers = Array.from(new Set([1, page - 1, page, page + 1, pageCount])).filter(value => value >= 1 && value <= pageCount).sort((a, b) => a - b);
    return <div className="am-page as-page"><AdvisorPageHeader title="Students" description="View and manage the students under your academic guidance."/><ManagementStats items={[{ label: "Total Students", value: data?.summary.total_guided || 0, icon: "users", tone: "blue" }, { label: "Active Consultations", value: data?.summary.active_consultations || 0, icon: "clock", tone: "amber" }, { label: "Completed Consultations", value: data?.summary.completed_consultations || 0, icon: "appointment", tone: "green" }, { label: "Average Student Rating", value: `${Number(data?.summary.average_rating || 0).toFixed(1)} / 5`, icon: "graduation", tone: "purple" }]}/>
 {error && <p className="am-feedback error" role="alert">{error} <button type="button" onClick={() => { setError(""); setRefresh(value => value + 1); }}>Retry</button></p>}{success && <p className="am-feedback success" role="status">{success}</p>}
 {insights && <section className="am-card as-insights" aria-labelledby="as-insights-title"><div><h2 id="as-insights-title"><AdvisorIcon name="chart"/>Student Insights</h2><p className="am-muted">Across {all.length} students who have booked or consulted with you.</p><strong>{grades.length ? (grades.reduce((total, value) => total + value, 0) / grades.length).toFixed(2) : "–"}</strong><span>Average reported CGPA · {grades.length} students</span></div><div className="as-education">{education.length ? education.map(([name, count]) => <div key={name}><span>{name}</span><meter min={0} max={Math.max(all.length, 1)} value={count} aria-label={`${name}: ${count} students`}/><strong>{count}</strong></div>) : <p className="am-muted">No student insights yet.</p>}</div></section>}
 <div className="as-columns"><section className="am-card as-roster"><div className="as-board-heading"><div className="as-board-icon"><AdvisorIcon name="users"/></div><div><h2>My Students</h2><p>Students who have booked or consulted with you.</p></div><button className="am-outline" type="button" aria-expanded={insights} onClick={() => setInsights(value => !value)}><AdvisorIcon name="chart"/>Student Insights</button></div><div className="as-controls"><label className="am-search"><AdvisorIcon name="search"/><input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} aria-label="Search students" placeholder="Search by name, email, or student ID…"/></label><label className="as-filter"><AdvisorIcon name="filter"/><select aria-label="Filter students" value={filter} onChange={event => { setFilter(event.target.value); setPage(1); }}><option value="all">All Students</option><option value="active">Active Consultations</option><option value="completed">Completed Consultations</option><option value="inactive">No Active Consultations</option></select></label><button className="am-icon-button" type="button" aria-label="Refresh student list" onClick={() => { setError(""); setRefresh(value => value + 1); }}><AdvisorIcon name="refresh"/></button></div>
 <div className="as-table-scroll" role="region" aria-label="Guided students" tabIndex={0} aria-busy={loading}><table className="as-table"><caption className="am-sr-only">Students under your academic guidance. Choose a student to view their profile and consultations.</caption><thead><tr>{([{ key: "full_name", name: "Student" }, { key: "field_of_study", name: "Field of Study" }, { key: "cgpa", name: "CGPA" }, { key: "appointment_count", name: "Consultations" }, { key: "latest_appointment", name: "Latest Consultation" }] as {
        key: SortKey;
        name: string;
    }[]).map(item => <th key={item.key} scope="col" aria-sort={sort.key === item.key ? (sort.direction === 1 ? "ascending" : "descending") : "none"}><button type="button" onClick={() => sortBy(item.key)}>{item.name}<span aria-hidden="true">{sort.key === item.key ? (sort.direction === 1 ? "↑" : "↓") : "↕"}</span></button></th>)}<th scope="col"><span className="am-sr-only">View student</span></th></tr></thead><tbody>{visible.map(student => <tr id={`student-${student.student_id}`} key={student.student_id} className={`${selected?.student_id === student.student_id ? "selected" : ""} as-tone-${student.student_id % 5}`} onClick={() => selectStudent(student)}><td><button type="button" className="as-student-name" aria-label={`View student ${student.full_name}`} onClick={event => { event.stopPropagation(); selectStudent(student); }}><ProfileAvatar className="as-avatar" name={student.full_name} imageUrl={student.profile_picture}/><span><strong>{student.full_name}</strong><small>{student.email}</small></span></button></td><td>{student.field_of_study || "Not provided"}</td><td><strong>{student.cgpa == null || student.cgpa === "" ? "–" : cgpa(student.cgpa)}</strong></td><td>{student.appointment_count}</td><td>{dateText(student.latest_appointment)}</td><td><button type="button" className="as-row-arrow" aria-label={`Show details for ${student.full_name}`} onClick={event => { event.stopPropagation(); selectStudent(student); }}><AdvisorIcon name="chevron"/></button></td></tr>)}</tbody></table></div>{loading && <p className="am-empty" role="status">Loading your students…</p>}{!loading && !visible.length && <p className="am-empty">{all.length ? "No students match your search or filter." : "No students yet. Students appear here after booking a consultation with you."}</p>}<footer className="as-pagination"><span>Showing {filtered.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, filtered.length)} of {filtered.length} students</span><nav aria-label="Student pages"><button type="button" aria-label="Previous student page" disabled={page === 1} onClick={() => setPage(page - 1)}>‹</button>{pageNumbers.map((value, index) => <span key={value}>{index > 0 && value - pageNumbers[index - 1] > 1 && <span className="as-page-gap">…</span>}{pageButton(value)}</span>)}<button type="button" aria-label="Next student page" disabled={page === pageCount} onClick={() => setPage(page + 1)}>›</button></nav></footer></section>
 <aside ref={detail} tabIndex={-1} className="am-card as-details" aria-label="Student details">{selected ? <><header className="as-profile"><ProfileAvatar className={`as-detail-avatar as-tone-${selected.student_id % 5}`} name={selected.full_name} imageUrl={selected.profile_picture}/><div><h2>{selected.full_name}</h2><p>{selected.email}</p><span className={`as-account-status ${selected.account_status !== "active" ? "inactive" : ""}`}><i />{selected.account_status === "active" ? "Active Student" : "Inactive Student"}</span></div></header><div className="as-profile-stats"><div><AdvisorIcon name="graduation"/><strong>{selected.education_level || "Not provided"}</strong><span>{selected.field_of_study || "Field not provided"}</span></div><div><AdvisorIcon name="chart"/><strong>CGPA</strong><span>{cgpa(selected.cgpa)}</span></div><div><AdvisorIcon name="calendar"/><strong>Consultations</strong><span>{selected.appointment_count}</span></div></div><p className="as-student-id">Student ID #{selected.student_id}{selected.university && ` · ${selected.university}`}</p><section className="as-recent"><h3><AdvisorIcon name="clock"/>Latest Consultation</h3>{recent?.appointment_id ? <Link to={`/advisor/appointments?student=${selected.student_id}&appointment=${recent.appointment_id}`} className="as-consultation"><div><strong>{dateText(recent.appointment_datetime)}{recent.appointment_datetime && ` · ${timeText(recent.appointment_datetime)} – ${timeText(recent.appointment_datetime, recent.duration_minutes)}`}</strong><span>{recent.consultation_topic || "Academic Consultation"}</span></div><span className={`am-status ${recent.appointment_status}`}>{label(recent.appointment_status)}</span></Link> : <p className="am-muted">No consultation details available.</p>}</section><section className="as-quick-actions"><h3><AdvisorIcon name="bolt"/>Quick Actions</h3><button type="button" disabled={selected.account_status !== "active"} onClick={() => setScheduling(true)}><span><AdvisorIcon name="appointment"/></span>Schedule Consultation<AdvisorIcon name="chevron"/></button><button type="button" disabled={startingMessage || selected.account_status !== "active"} onClick={messageStudent}><span><AdvisorIcon name="message"/></span>{startingMessage ? "Opening conversation…" : "Send Message"}<AdvisorIcon name="chevron"/></button><Link to={`/advisor/appointments?student=${selected.student_id}`}><span><AdvisorIcon name="quiz"/></span>View Consultation History<AdvisorIcon name="chevron"/></Link></section></> : <p className="am-empty">Select a student to see their profile and consultations.</p>}</aside></div>{scheduling && selected && advisorId && <ScheduleConsultation key={selected.student_id} student={selected} advisorId={advisorId} onClose={() => setScheduling(false)} onSaved={() => { setScheduling(false); setSelectedId(selected.student_id); setPage(null); setFilter("all"); setSuccess("Consultation confirmed. The new booking is visible to the student."); setRefresh(value => value + 1); }}/>}
 </div>;
}
