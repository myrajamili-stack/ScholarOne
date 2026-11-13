import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../../api/axios";
import { getApiErrorMessage } from "../../utils/apiError";
import { getStoredUser } from "../../utils/authStorage";
import AdvisorPageHeader, { ManagementStats } from "../../components/advisor/AdvisorPageHeader";
import AdvisorIcon from "../../components/advisor/AdvisorIcon";
import { Link } from "react-router-dom";
type ScheduleAppointment = {
    appointment_id: number;
    appointment_datetime: string | null;
    appointment_status: string | null;
    student_name: string;
    duration_minutes: number;
};
type AvailabilityDay = {
    day: string;
    enabled: boolean;
    start_time: string;
    end_time: string;
};
type PublishedAvailability = {
    daily_breaks: Array<{
        start_time: string;
        end_time: string;
    }>;
    published: boolean;
    slot_minutes: number;
    availability: AvailabilityDay[];
    blocked_dates: Array<{
        date: string;
        reason: string;
    }>;
};
type AdvisorScheduleData = PublishedAvailability & {
    summary: {
        this_week_count: number;
        pending_count: number;
    };
    appointments: ScheduleAppointment[];
};
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SESSION_LENGTHS = [15, 30, 45, 60, 90, 120];
const TIME_OPTIONS = Array.from({ length: 21 }, (_, index) => clock(8 * 60 + index * 30));
function localDate(value = new Date()) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}
function addDays(value: string, amount: number) {
    const date = new Date(`${value}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + amount);
    return date.toISOString().slice(0, 10);
}
function currentWeek(today = localDate()) {
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
    return addDays(today, -((weekday + 6) % 7));
}
function minutes(value: string) {
    const [hours, mins] = value.split(":").map(Number);
    return hours * 60 + mins;
}
function clock(value: number) {
    return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}
function statusOf(appointment: ScheduleAppointment) {
    return (appointment.appointment_status || "pending").toLowerCase();
}
function statusLabel(value: string) {
    return value.charAt(0).toUpperCase() + value.slice(1);
}
function appointmentTime(appointment: ScheduleAppointment) {
    const start = minutes(appointment.appointment_datetime!.slice(11, 16));
    const end = start + appointment.duration_minutes;
    return `${clock(start)} – ${clock(end % 1440)}${end >= 1440 ? " (+1 day)" : ""}`;
}
function TimeSelect({ label, value, disabled, onChange }: {
    label: string;
    value: string;
    disabled: boolean;
    onChange: (value: string) => void;
}) {
    const options = TIME_OPTIONS.includes(value) ? TIME_OPTIONS : [...TIME_OPTIONS, value].sort();
    return <select aria-label={label} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
    {options.map((time) => <option key={time} value={time}>{time}</option>)}
  </select>;
}
function AdvisorSchedulePage({ initialTab, onScheduleSaved, embedded = false }: {
    initialTab?: "calendar" | "availability" | "blocked";
    onScheduleSaved?: () => void;
    embedded?: boolean;
} = {}) {
    const [searchParams] = useSearchParams();
    const userId = getStoredUser()?.user_id;
    const [schedule, setSchedule] = useState<AdvisorScheduleData | null>(null);
    const [published, setPublished] = useState<PublishedAvailability | null>(null);
    const [tab, setTab] = useState<"calendar" | "availability" | "blocked">(() => initialTab || (searchParams.get("tab") === "availability" ? "availability" : "calendar"));
    const [weekStart, setWeekStart] = useState(() => {
        const requested = searchParams.get("date");
        if (requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) && !Number.isNaN(new Date(`${requested}T12:00:00Z`).getTime()))
            return currentWeek(requested);
        return currentWeek();
    });
    const [view, setView] = useState("week");
    const [refresh, setRefresh] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const dirtyRef = useRef(false);
    const [saveError, setSaveError] = useState("");
    const [success, setSuccess] = useState("");
    const [blockedDate, setBlockedDate] = useState("");
    const [blockedReason, setBlockedReason] = useState("");
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [updating, setUpdating] = useState(false);
    const [statusError, setStatusError] = useState("");
    useEffect(() => {
        const controller = new AbortController();
        async function load() {
            setLoading(true);
            setError("");
            try {
                if (!userId)
                    throw new Error("Please sign in to view your schedule.");
                const response = await api.get<AdvisorScheduleData>(`/advisors/${userId}/schedule`, {
                    params: { week_start: weekStart }, signal: controller.signal,
                });
                if (controller.signal.aborted)
                    return;
                const data = { ...response.data, daily_breaks: response.data.daily_breaks || [] };
                // Navigating weeks and refreshing bookings must preserve unsaved availability edits.
                setSchedule((current) => current && dirtyRef.current ? { ...current, appointments: data.appointments, summary: data.summary } : data);
                setPublished(data);
            }
            catch (error) {
                if (!controller.signal.aborted)
                    setError(getApiErrorMessage(error, "Unable to load your schedule."));
            }
            finally {
                if (!controller.signal.aborted)
                    setLoading(false);
            }
        }
        load();
        return () => controller.abort();
    }, [userId, weekStart, refresh]);
    function markChanged() {
        dirtyRef.current = true;
        setDirty(true);
        setSuccess("");
        setSaveError("");
    }
    function updateDay(name: string, change: Partial<AvailabilityDay>) {
        setSchedule((current) => current && ({ ...current, availability: current.availability.map((day) => day.day === name ? { ...day, ...change } : day) }));
        markChanged();
    }
    function addBlockedDate() {
        if (!schedule || !blockedDate)
            return;
        if (schedule.blocked_dates.some((item) => item.date === blockedDate)) {
            setSaveError("This date is already blocked.");
            return;
        }
        setSchedule({ ...schedule, blocked_dates: [...schedule.blocked_dates, { date: blockedDate, reason: blockedReason.trim() }].sort((a, b) => a.date.localeCompare(b.date)) });
        setBlockedDate("");
        setBlockedReason("");
        markChanged();
    }
    async function saveSchedule() {
        if (!schedule || !userId)
            return;
        setSaveError("");
        setSuccess("");
        const invalidDay = schedule.availability.find((day) => day.enabled && minutes(day.end_time) - minutes(day.start_time) < schedule.slot_minutes);
        if (invalidDay) {
            setSaveError(`${invalidDay.day} needs at least ${schedule.slot_minutes} minutes between its start and end times.`);
            return;
        }
        const breaks = schedule.daily_breaks;
        if (breaks.some((item, index) => item.end_time <= item.start_time || breaks.some((other, otherIndex) => index !== otherIndex && item.start_time < other.end_time && item.end_time > other.start_time))) {
            setSaveError("Daily breaks must end after they start and must not overlap.");
            return;
        }
        setSaving(true);
        try {
            const response = await api.put<PublishedAvailability>(`/advisors/${userId}/schedule`, {
                availability: schedule.availability, blocked_dates: schedule.blocked_dates, slot_minutes: schedule.slot_minutes, daily_breaks: schedule.daily_breaks,
            });
            setSchedule((current) => current && ({ ...current, ...response.data }));
            setPublished({ ...schedule, ...response.data });
            dirtyRef.current = false;
            setDirty(false);
            setSuccess("Availability saved. Students can now book using these hours and session length.");
            onScheduleSaved?.();
        }
        catch (error) {
            setSaveError(getApiErrorMessage(error, "Unable to save availability. Your changes are still here; please try again."));
        }
        finally {
            setSaving(false);
        }
    }
    async function updateStatus(appointment: ScheduleAppointment, status: string) {
        setUpdating(true);
        setStatusError("");
        try {
            await api.patch(`/advisors/${userId}/appointments/${appointment.appointment_id}/status`, { status });
            setRefresh((value) => value + 1);
        }
        catch (error) {
            setStatusError(getApiErrorMessage(error, "Unable to update this appointment."));
        }
        finally {
            setUpdating(false);
        }
    }
    function navigateWeek(value: string) {
        setWeekStart(value);
        setSelectedId(null);
        setStatusError("");
    }
    if (!schedule)
        return <div className="advisor-page"><section className="advisor-empty-state" role={error ? "alert" : "status"}>
    {error || "Loading your consultation schedule..."}
    {error && <button type="button" className="advisor-secondary-button" onClick={() => setRefresh((value) => value + 1)}>Try again</button>}
  </section></div>;
    const weekDates = DAY_LABELS.map((_, index) => addDays(weekStart, index));
    const appointments = schedule.appointments.filter((item) => item.appointment_datetime && weekDates.includes(item.appointment_datetime.slice(0, 10)));
    const selected = appointments.find((item) => item.appointment_id === selectedId);
    const starts = [9 * 60, ...appointments.map((item) => minutes(item.appointment_datetime!.slice(11, 16))), ...(published?.availability.filter((day) => day.enabled).map((day) => minutes(day.start_time)) || [])];
    const ends = [17 * 60, ...appointments.map((item) => minutes(item.appointment_datetime!.slice(11, 16)) + item.duration_minutes), ...(published?.availability.filter((day) => day.enabled).map((day) => minutes(day.end_time)) || [])];
    const firstHour = Math.max(0, Math.floor(Math.min(...starts) / 60));
    const lastHour = Math.min(24, Math.ceil(Math.max(...ends) / 60));
    const hours = Array.from({ length: lastHour - firstHour }, (_, index) => firstHour + index);
    const monthTitle = new Intl.DateTimeFormat("en-MY", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${weekStart}T12:00:00Z`));
    const weekRange = `${new Intl.DateTimeFormat("en-MY", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${weekStart}T12:00:00Z`))} – ${new Intl.DateTimeFormat("en-MY", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${weekDates[6]}T12:00:00Z`))}`;
    const shownDates = weekDates.slice(0, view === "workweek" ? 5 : 7);
    const scheduleTabs = [{ id: "calendar", label: "Weekly Calendar", icon: "calendar" }, { id: "availability", label: "Availability Settings", icon: "settings" }, { id: "blocked", label: "Blocked Dates", icon: "appointment" }] as const;
    return <div className="am-page am-schedule">
    {!embedded && <AdvisorPageHeader title="My Schedule" description="Manage your consultation availability, working hours, and time off."/>}
    <ManagementStats items={[{ label: "Available Days", value: published?.availability.filter(day => day.enabled).length || 0, icon: "calendar", tone: "purple" }, { label: "Consultation Duration", value: `${published?.slot_minutes || 30} min`, icon: "clock", tone: "amber" }, { label: "Daily Breaks", value: published?.daily_breaks?.length || 0, icon: "break", tone: "amber" }, { label: "Blocked Dates", value: published?.blocked_dates.length || 0, icon: "appointment", tone: "pink" }]}/>
    {error && <p className="am-feedback error" role="alert">{error} <button type="button" onClick={() => setRefresh(value => value + 1)}>Try again</button></p>}
    {success && <p className="am-feedback success" role="status">{success}</p>}
    <div className="am-schedule-columns"><section className="am-card am-calendar-card">
      <div className="am-tabs" role="tablist" aria-label="Schedule views">{scheduleTabs.map((item, index) => <button type="button" id={`${item.id}-tab`} key={item.id} role="tab" aria-selected={tab === item.id} aria-controls={`${item.id}-panel`} tabIndex={tab === item.id ? 0 : -1} onClick={() => setTab(item.id)} onKeyDown={event => { if (event.key !== "ArrowRight" && event.key !== "ArrowLeft")
        return; event.preventDefault(); const next = scheduleTabs[(index + (event.key === "ArrowRight" ? 1 : 2)) % 3]; setTab(next.id); document.getElementById(`${next.id}-tab`)?.focus(); }}><AdvisorIcon name={item.icon}/>{item.label}</button>)}</div>
      <section role="tabpanel" id="calendar-panel" aria-labelledby="calendar-tab" hidden={tab !== "calendar"}>
        <div className="am-calendar-toolbar"><div><button type="button" aria-label="Previous week" disabled={loading || saving} onClick={() => navigateWeek(addDays(weekStart, -7))}>‹</button><strong>{weekRange}</strong><button type="button" aria-label="Next week" disabled={loading || saving} onClick={() => navigateWeek(addDays(weekStart, 7))}>›</button></div><div><button type="button" onClick={() => navigateWeek(currentWeek())}>Today</button><select aria-label="Calendar view" value={view} onChange={event => setView(event.target.value)}><option value="week">Week</option><option value="workweek">Work week</option></select><button type="button" aria-label="Refresh bookings" disabled={loading || saving} onClick={() => setRefresh(value => value + 1)}><AdvisorIcon name="refresh"/></button></div></div>
        <div className="am-calendar-scroll" role="region" aria-label="Weekly appointment calendar" tabIndex={0} aria-busy={loading}><table className="am-calendar"><caption className="am-sr-only">{monthTitle}, {weekRange}. Malaysia time.</caption><thead><tr><th scope="col">Time</th>{shownDates.map((date, index) => <th scope="col" key={date} className={date === localDate() ? "today" : ""}>{DAY_LABELS[index]}<span>{new Intl.DateTimeFormat("en-MY", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`))}</span></th>)}</tr></thead><tbody>{hours.map(hour => <tr key={hour}><th scope="row">{clock(hour * 60)}</th>{shownDates.map((date, index) => {
                const day = published?.availability[index];
                const blocked = published?.blocked_dates.find(item => item.date === date);
                const available = published?.published && day?.enabled && !blocked && minutes(day.start_time) < (hour + 1) * 60 && minutes(day.end_time) > hour * 60;
                const breaks = available ? (published?.daily_breaks || []).filter(item => minutes(item.start_time) < (hour + 1) * 60 && minutes(item.end_time) > hour * 60) : [];
                const bookings = appointments.filter(item => item.appointment_datetime!.slice(0, 10) === date && minutes(item.appointment_datetime!.slice(11, 16)) < (hour + 1) * 60 && minutes(item.appointment_datetime!.slice(11, 16)) + item.duration_minutes > hour * 60);
                return <td key={date} className={available ? (breaks.length ? "break-time" : "available") : "unavailable"} title={blocked?.reason || (!available ? "Outside saved availability" : "Saved consultation hours")}>
            {bookings.map(item => <button type="button" key={item.appointment_id} className={`am-booking ${statusOf(item)} ${selectedId === item.appointment_id ? "selected" : ""}`} aria-pressed={selectedId === item.appointment_id} onClick={() => { setSelectedId(item.appointment_id); setStatusError(""); }}><strong>{item.student_name}</strong><small>{appointmentTime(item)} · {statusLabel(statusOf(item))}</small></button>)}
            {breaks.map(item => <span className="am-break-label" key={item.start_time}>Break<small>{item.start_time} – {item.end_time}</small></span>)}{!available && !bookings.length && <span className="am-unavailable-label">{blocked ? "Blocked" : "–"}</span>}
          </td>;
            })}</tr>)}</tbody></table></div>
        <div className="am-legend"><span><i className="available"/>Available hours</span><span><i className="confirmed"/>Confirmed</span><span><i className="pending"/>Pending</span><span><i className="completed"/>Completed</span><span><i className="cancelled"/>Cancelled</span><span><i className="break-time"/>Break</span><span><i className="unavailable"/>Unavailable</span></div>
        {!appointments.length && !loading && <p className="am-muted">No student bookings this week.</p>}
        {selected && <section className="am-selected"><div><strong>{selected.student_name}</strong><span>{selected.appointment_datetime?.slice(0, 10)} · {appointmentTime(selected)} · {statusLabel(statusOf(selected))}</span></div><div className="am-actions">{statusOf(selected) === "pending" && <button type="button" disabled={updating || loading} onClick={() => updateStatus(selected, "confirmed")}>Confirm</button>}{statusOf(selected) === "confirmed" && <button type="button" disabled={updating || loading} onClick={() => updateStatus(selected, "completed")}>Mark Completed</button>}{["pending", "confirmed"].includes(statusOf(selected)) && <button type="button" className="danger" disabled={updating || loading} onClick={() => updateStatus(selected, "cancelled")}>Cancel</button>}<Link to={`/advisor/appointments?appointment=${selected.appointment_id}`}>View Details ›</Link></div>{statusError && <p className="am-feedback error" role="alert">{statusError}</p>}</section>}
      </section>
      <section role="tabpanel" id="availability-panel" aria-labelledby="availability-tab" hidden={tab !== "availability"} className="am-settings-panel"><h2>Consultation Settings</h2><p className="am-muted">Choose a session length and daily breaks. Save to publish your changes.</p><label className="am-label">Session length<select value={schedule.slot_minutes} disabled={saving} onChange={event => { setSchedule({ ...schedule, slot_minutes: Number(event.target.value) }); markChanged(); }}>{SESSION_LENGTHS.map(length => <option key={length} value={length}>{length} minutes</option>)}</select></label><h3><AdvisorIcon name="break"/>Daily Breaks</h3><p className="am-muted">These breaks repeat on every available day and cannot be booked by students.</p>{schedule.daily_breaks.map((item, index) => <div className="am-break-editor" key={index}><TimeSelect label={`Break ${index + 1} start time`} value={item.start_time} disabled={saving} onChange={value => { setSchedule({ ...schedule, daily_breaks: schedule.daily_breaks.map((other, i) => i === index ? { ...other, start_time: value } : other) }); markChanged(); }}/><span>to</span><TimeSelect label={`Break ${index + 1} end time`} value={item.end_time} disabled={saving} onChange={value => { setSchedule({ ...schedule, daily_breaks: schedule.daily_breaks.map((other, i) => i === index ? { ...other, end_time: value } : other) }); markChanged(); }}/><button type="button" disabled={saving} aria-label={`Remove break ${index + 1}`} onClick={() => { setSchedule({ ...schedule, daily_breaks: schedule.daily_breaks.filter((_, i) => i !== index) }); markChanged(); }}>Remove</button></div>)}<button className="am-outline" type="button" disabled={saving || schedule.daily_breaks.length >= 10} onClick={() => { setSchedule({ ...schedule, daily_breaks: [...schedule.daily_breaks, { start_time: "12:00", end_time: "13:00" }] }); markChanged(); }}>+ Add Daily Break</button></section>
      <section role="tabpanel" id="blocked-panel" aria-labelledby="blocked-tab" hidden={tab !== "blocked"} className="am-settings-panel"><h2>Blocked Dates</h2><p className="am-muted">Block a full day for leave or university events. Existing appointments stay visible.</p><form className="am-block-form" onSubmit={event => { event.preventDefault(); addBlockedDate(); }}><label className="am-label">Date<input type="date" required value={blockedDate} disabled={saving} onChange={event => setBlockedDate(event.target.value)}/></label><label className="am-label">Reason (optional)<input maxLength={200} value={blockedReason} disabled={saving} onChange={event => setBlockedReason(event.target.value)} placeholder="e.g. University event"/></label><button className="am-outline" disabled={saving || !blockedDate}>Add Date</button></form>{schedule.blocked_dates.length ? <ul className="am-block-list">{schedule.blocked_dates.map(item => <li key={item.date}><div><strong>{item.date}</strong><span>{item.reason || "Unavailable"}</span></div><button type="button" disabled={saving} aria-label={`Remove blocked date ${item.date}`} onClick={() => { setSchedule({ ...schedule, blocked_dates: schedule.blocked_dates.filter(other => other.date !== item.date) }); markChanged(); }}>Remove</button></li>)}</ul> : <p className="am-muted">No blocked dates added.</p>}</section>
    </section><aside className="am-card am-hours-card"><h2><AdvisorIcon name="appointment"/>Availability Overview</h2><div className="am-hours">{schedule.availability.map(day => <div className={`am-hour-row ${day.enabled ? "enabled" : ""}`} key={day.day}><label><input type="checkbox" checked={day.enabled} disabled={saving} onChange={event => updateDay(day.day, { enabled: event.target.checked })}/><span className="am-switch"/>{day.day}</label>{day.enabled ? <div><TimeSelect label={`${day.day} start time`} value={day.start_time} disabled={saving} onChange={value => updateDay(day.day, { start_time: value })}/><span>to</span><TimeSelect label={`${day.day} end time`} value={day.end_time} disabled={saving} onChange={value => updateDay(day.day, { end_time: value })}/></div> : <span className="am-muted">Unavailable</span>}</div>)}</div><p className="am-hours-note">Malaysia time · UTC+08:00<br />{dirty ? "Unsaved changes — save to publish." : schedule.published ? "Your availability is published to students. Existing bookings keep their times." : "Save your hours to start accepting bookings."}</p>{saveError && <p className="am-feedback error" role="alert">{saveError}</p>}<button className="am-primary am-save-hours" type="button" disabled={saving || loading || (!dirty && schedule.published)} onClick={saveSchedule}><AdvisorIcon name="appointment"/>{saving ? "Saving…" : "Save Availability"}</button></aside></div>
  </div>;
}
export default AdvisorSchedulePage;
