import { useEffect, useMemo, useRef, useState } from "react";

import Icon from "../../components/advisor/AdvisorIcon";
import type { FormEvent } from "react";
import "../../styles/admin-users.css";
import api from "../../api/axios";
import { getApiErrorMessage } from "../../utils/apiError";
import { getInitials } from "../../utils/userDisplay";
import { getStoredUser, storeUser } from "../../utils/authStorage";

type UserStatus = "active" | "disabled" | "suspended" | "pending" | "rejected";

type AdminUserRecord = {
  user_id: number;
  full_name: string;
  email: string;
  phone_number: string | null;
  role: string;
  status: UserStatus | string;
  provider_rejection_reason?: string | null;
  created_at: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  nationality?: string | null;
  cgpa?: number | string | null;
  experience_years?: number | string | null;
  institution?: string | null;
  professional_title?: string | null;
  bio?: string | null;
  education_level?: string | null;
  field_of_study?: string | null;
  university?: string | null;
  organization_name?: string | null;
  organization_type?: string | null;
  website?: string | null;
  specialization?: string | null;
  qualification?: string | null;
  department?: string | null;
  role_level?: string | null;
};

type UserSummary = {
  total_users: number;
  students: number;
  sponsors: number;
  advisors: number;
  admins: number;
  active_users: number;
  restricted_users: number;
};

type UsersResponse = {
  summary: UserSummary;
  users: AdminUserRecord[];
};

const roleOptions = ["all", "student", "sponsor", "advisor", "admin"];
const statusOptions = ["all", "active", "pending", "disabled", "suspended", "rejected"];
const profileFields: Record<string, { name: keyof AdminUserRecord; label: string; maxLength: number }[]> = {
  student: [{name:"date_of_birth",label:"Date of Birth",maxLength:10},{name:"gender",label:"Gender",maxLength:30},{name:"nationality",label:"Nationality",maxLength:100},{name:"cgpa",label:"CGPA",maxLength:10},{ name: "education_level", label: "Education Level", maxLength: 100 }, { name: "field_of_study", label: "Field of Study", maxLength: 100 }, { name: "university", label: "University / Institution", maxLength: 150 }],
  advisor: [{name:"experience_years",label:"Years of Experience",maxLength:10},{name:"institution",label:"Institution",maxLength:150},{name:"professional_title",label:"Professional Title",maxLength:100},{name:"bio",label:"Biography",maxLength:300},{ name: "specialization", label: "Specialization", maxLength: 100 }, { name: "qualification", label: "Qualification", maxLength: 150 }],
  sponsor: [{ name: "organization_name", label: "Organisation Name", maxLength: 200 }, { name: "website", label: "Website", maxLength: 500 }],
  admin: [{ name: "department", label: "Department", maxLength: 100 }],
};

function formatRole(role: string) {
  const labels: Record<string, string> = {
    admin: "Administrator",
    advisor: "Academic Advisor",
    sponsor: "Sponsorship Provider",
    student: "Student",
  };

  return labels[role] ?? role;
}

function formatDate(value: string | null) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "Not recorded";

  return new Intl.DateTimeFormat("en-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function getAccountInfo(user: AdminUserRecord) {
  if (user.role === "student") {
    return {
      primary: [user.education_level, user.field_of_study].filter(Boolean).join(" · ") || "Academic profile pending",
      secondary: user.university || "University not set",
    };
  }

  if (user.role === "sponsor") {
    return {
      primary: user.organization_name || "Organization profile pending",
      secondary: user.organization_type || user.website || "Provider details not set",
    };
  }

  if (user.role === "advisor") {
    return {
      primary: user.specialization || "Expertise not set",
      secondary: user.qualification || "Qualification not set",
    };
  }

  return {
    primary: user.department || "System administration",
    secondary: user.role_level || "Administrator access",
  };
}

function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [activeTab, setActiveTab] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [actionUser, setActionUser] = useState<AdminUserRecord | null>(null);
  const [addingUser, setAddingUser] = useState(false);
  const [editingUser, setEditingUser] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [success, setSuccess] = useState("");
  const [formError, setFormError] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const operationPending = useRef(false);
  const modalRef = useRef<HTMLDialogElement>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingUserId, setUpdatingUserId] = useState<number | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadUsers() {
      try {
        setLoading(true);
        setError("");
        const response = await api.get<UsersResponse>("/admin/users");

        if (isMounted) {
          setUsers(response.data.users);
        }
      } catch (requestError) {
        if (isMounted) {
          setError(getApiErrorMessage(requestError, "Unable to load user accounts."));
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadUsers();

    return () => {
      isMounted = false;
    };
  }, []);

  const summary = useMemo(() => ({
    total_users: users.length,
    students: users.filter((user) => user.role === "student").length,
    sponsors: users.filter((user) => user.role === "sponsor").length,
    staff: users.filter((user) => user.role === "advisor" || user.role === "admin").length,
    active_users: users.filter((user) => String(user.status || "active").toLowerCase() === "active").length,
  }), [users]);

  const filteredUsers = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return users.filter((user) => {
      const matchesSearch =
        !normalizedSearch ||
        user.full_name.toLowerCase().includes(normalizedSearch) ||
        user.email.toLowerCase().includes(normalizedSearch) ||
        String(user.phone_number || "").toLowerCase().includes(normalizedSearch);
      const matchesTab = activeTab === "all" || (activeTab === "staff" ? ["advisor", "admin"].includes(user.role) : user.role === activeTab);
      const matchesRole = roleFilter === "all" || user.role === roleFilter;
      const normalizedStatus = String(user.status || "active").toLowerCase();
      const matchesStatus = statusFilter === "all" || normalizedStatus === statusFilter;

      return matchesSearch && matchesRole && matchesStatus && matchesTab;
    });
  }, [activeTab, roleFilter, searchTerm, statusFilter, users]);

  const pageSize = 5;
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleUsers = filteredUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const allPageSelected = visibleUsers.length > 0 && visibleUsers.every((user) => selectedIds.has(user.user_id));

  function openDialog(user: AdminUserRecord | null) {
    setActionUser(user);
    setAddingUser(user === null);
    setEditingUser(false);
    setConfirmingDelete(false);
    setFormError("");
    modalRef.current?.showModal();
  }

  function selectUser(userId: number) {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function selectPage() {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      visibleUsers.forEach((user) => {
        if (allPageSelected) next.delete(user.user_id);
        else next.add(user.user_id);
      });
      return next;
    });
  }

  async function updateUserStatus(userId: number, status: UserStatus, rejection_reason = "") {
    if (operationPending.current) return;
    operationPending.current = true;
    setUpdatingUserId(userId);
    setFormError("");
    setSuccess("");
    try {
      const response = await api.patch<{ user: AdminUserRecord }>(`/admin/users/${userId}/status`, { status, rejection_reason });
      setUsers((current) => current.map((user) => user.user_id === userId ? { ...user, ...response.data.user } : user));
      setSuccess("Account status updated successfully.");
      modalRef.current?.close();
    } catch (requestError) {
      setFormError(getApiErrorMessage(requestError, "Unable to update account status."));
    } finally {
      setUpdatingUserId(null);
      operationPending.current = false;
    }
  }

  async function deleteUserAccount() {
    if (!actionUser || operationPending.current) return;
    operationPending.current = true;
    setIsDeleting(true); setFormError(""); setSuccess("");
    try {
      await api.delete(`/admin/users/${actionUser.user_id}`, { data: { confirm_user_id: actionUser.user_id } });
      setUsers(current => current.filter(user => user.user_id !== actionUser.user_id));
      setSelectedIds(current => { const next = new Set(current); next.delete(actionUser.user_id); return next; });
      setSuccess("Account deleted successfully.");
      modalRef.current?.close();
    } catch (requestError) {
      setFormError(getApiErrorMessage(requestError, "Unable to delete the account."));
    } finally {
      setIsDeleting(false); operationPending.current = false;
    }
  }

  async function updateUserProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!actionUser || operationPending.current) return;
    const values = new FormData(event.currentTarget);
    const payload = Object.fromEntries(values.entries());
    if (/\p{Decimal_Number}/u.test(String(payload.full_name))) {
      setFormError("Full name must not contain numbers."); return;
    }
    operationPending.current = true;
    setIsCreating(true);
    setFormError(""); setSuccess("");
    try {
      const response = await api.patch<{ user: AdminUserRecord }>(`/admin/users/${actionUser.user_id}`, payload);
      setUsers(current => current.map(user => user.user_id === actionUser.user_id ? { ...user, ...response.data.user } : user));
      setActionUser(current => current ? { ...current, ...response.data.user } : current);
      const signedIn = getStoredUser();
      if (signedIn?.user_id === actionUser.user_id) {
        storeUser({ ...signedIn, full_name: response.data.user.full_name, email: response.data.user.email, phone_number: response.data.user.phone_number });
      }
      setSuccess("User information updated successfully.");
      modalRef.current?.close();
    } catch (requestError) {
      setFormError(getApiErrorMessage(requestError, "Unable to update user information."));
    } finally {
      setIsCreating(false);
      operationPending.current = false;
    }
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (operationPending.current) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const fullName = String(values.get("full_name") || "").trim();
    const email = String(values.get("email") || "").trim().toLowerCase();
    const phone = String(values.get("phone_number") || "").trim();
    const password = String(values.get("password") || "");
    if (fullName.length < 2) { setFormError("Enter a name with at least 2 characters."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setFormError("Enter a valid email address."); return; }
    if (phone && (!/^\+?[\d ()-]+$/.test(phone) || phone.replace(/\D/g, "").length < 7 || phone.replace(/\D/g, "").length > 15)) {
      setFormError("Enter a phone number with 7–15 digits. Letters are not allowed."); return;
    }
    if (password.length < 8) { setFormError("Use a password with at least 8 characters."); return; }
    operationPending.current = true;
    setIsCreating(true);
    setFormError("");
    setSuccess("");
    const role = String(values.get("role"));
    try {
      const response = await api.post<{ user: AdminUserRecord }>("/auth/register", {
        full_name: fullName, email, phone_number: phone.replace(/[ ()-]/g, "") || null, password, confirm_password: password, role,
        organization_name: String(values.get("organization_name") || "").trim() || null,
        organization_type: String(values.get("organization_type") || ""),
      });
      const created = { ...response.data.user, organization_name: String(values.get("organization_name") || "").trim() || null };
      setUsers((current) => [created, ...current]);
      setActiveTab("all"); setRoleFilter("all"); setStatusFilter("all"); setSearchTerm(""); setPage(1);
      setSuccess(`${created.full_name}'s account was created successfully.`);
      form.reset();
      modalRef.current?.close();
    } catch (requestError) {
      setFormError(getApiErrorMessage(requestError, "Unable to create user account."));
    } finally {
      setIsCreating(false);
      operationPending.current = false;
    }
  }

  function exportUsers() {
    const exportRows = selectedIds.size ? users.filter((user) => selectedIds.has(user.user_id)) : filteredUsers;
    const rows = [["User ID", "Name", "Email", "Role", "Account Information", "Phone", "Status", "Joined"],
      ...exportRows.map((user) => [String(user.user_id), user.full_name, user.email, formatRole(user.role), getAccountInfo(user).primary, user.phone_number || "", user.status || "active", formatDate(user.created_at)])];
    const csv = rows.map((row) => row.map((value) => {
      const text = String(value);
      const safeText = /^\s*[=+@-]/.test(text) ? `'${text}` : text;
      return `"${safeText.replace(/"/g, '""')}"`;
    }).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "scholarone-users.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setSuccess(`Exported ${exportRows.length} user account${exportRows.length === 1 ? "" : "s"}.`);
  }

  return (
    <div className="admin-page aum-page">
      {error && <div className="admin-alert" role="alert">{error}</div>}
      {success && <div className="aum-success" role="status">{success}</div>}
      <section className="adh-metrics" aria-label="User account summary">
        {([
          { label: "Total Accounts", value: summary.total_users, note: `${summary.active_users} active accounts`, icon: "users", color: "purple" },
          { label: "Students", value: summary.students, note: "Student accounts", icon: "graduation", color: "blue" },
          { label: "Providers", value: summary.sponsors, note: "Sponsorship providers", icon: "layers", color: "blue" },
          { label: "Staff", value: summary.staff, note: "Advisors and administrators", icon: "shield", color: "purple" },
        ] as const).map((stat) => <article className={`adh-metric ${stat.color}`} key={stat.label}><span className="adh-icon"><Icon name={stat.icon} /></span><div><h2>{stat.label}</h2><strong>{loading ? "—" : stat.value}</strong><small>{stat.note}</small></div></article>)}
      </section>

      <section className="aum-directory" aria-label="User directory">
        <div className="aum-tabs-row"><div className="aum-tabs" role="group" aria-label="User groups">
          {([
            { id: "all", label: "All Users", count: summary.total_users, icon: "users" },
            { id: "student", label: "Students", count: summary.students, icon: "graduation" },
            { id: "sponsor", label: "Providers", count: summary.sponsors, icon: "layers" },
            { id: "staff", label: "Staff", count: summary.staff, icon: "shield" },
          ] as const).map((tab) => <button type="button" key={tab.id} aria-pressed={activeTab === tab.id} onClick={() => { setActiveTab(tab.id); setRoleFilter("all"); setPage(1); }}><Icon name={tab.icon} />{tab.label} ({tab.count})</button>)}
        </div><button className="aum-primary" type="button" onClick={() => openDialog(null)} disabled={loading || !!error}><Icon name="user" />Add User</button></div>
        <div className="aum-filters">
          <label className="aum-search"><Icon name="search" /><input aria-label="Search users" type="search" placeholder="Search by name, email, or phone..." value={searchTerm} onChange={(event) => { setSearchTerm(event.target.value); setPage(1); }} /></label>
          <select aria-label="Filter by role" value={roleFilter} onChange={(event) => { setRoleFilter(event.target.value); setPage(1); }}>{roleOptions.map((role) => <option key={role} value={role}>{role === "all" ? "All Roles" : formatRole(role)}</option>)}</select>
          <select aria-label="Filter by status" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}>{statusOptions.map((status) => <option key={status} value={status}>{status === "all" ? "All Statuses" : status[0].toUpperCase() + status.slice(1)}</option>)}</select>
          <button className="aum-outline" type="button" onClick={exportUsers} disabled={loading || (selectedIds.size === 0 && filteredUsers.length === 0)}>↓ Export{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}</button>
        </div>
        {selectedIds.size > 0 && <div className="aum-selected"><span>{selectedIds.size} selected for export</span><button type="button" onClick={() => setSelectedIds(new Set())}>Clear selection</button></div>}
        <div className="aum-table-panel">
          <div className="aum-table-scroll"><table className="aum-table"><thead><tr>
            <th><input type="checkbox" aria-label="Select all users on this page" checked={allPageSelected} onChange={selectPage} disabled={!visibleUsers.length} /></th><th>User</th><th>Role</th><th>Account Information</th><th>Phone</th><th>Status</th><th>Joined</th><th>Action</th>
          </tr></thead><tbody>
            {visibleUsers.map((user) => {
              const account = getAccountInfo(user);
              const status = String(user.status || "active").toLowerCase();
              return <tr key={user.user_id} className={selectedIds.has(user.user_id) ? "aum-checked" : ""}>
                <td><input type="checkbox" aria-label={`Select ${user.full_name}`} checked={selectedIds.has(user.user_id)} onChange={() => selectUser(user.user_id)} /></td>
                <td><div className="aum-user"><span className={`aum-avatar ${user.role}`}>{getInitials(user.full_name)}</span><div><strong>{user.full_name}</strong><small>{user.email}</small></div></div></td>
                <td><span className={`admin-role-badge ${user.role}`}>{user.role === "sponsor" ? "Provider" : formatRole(user.role)}</span></td>
                <td><div className="aum-account"><strong>{account.primary}</strong><small>{account.secondary}</small></div></td>
                <td>{user.phone_number || "Not set"}</td><td><span className={`admin-status-badge ${status}`}><i />{status}</span></td><td className="aum-date">{formatDate(user.created_at)}</td>
                <td><button className="aum-more" type="button" aria-label={`Manage ${user.full_name}`} onClick={() => openDialog(user)}>•••</button></td>
              </tr>;
            })}
            {(loading || visibleUsers.length === 0) && <tr><td colSpan={8} className="aum-empty">{loading ? "Loading user accounts..." : error ? "User records could not be loaded." : "No users match your search or filters."}</td></tr>}
          </tbody></table></div>
          <footer className="aum-table-footer"><span>Showing {filteredUsers.length ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, filteredUsers.length)} of {filteredUsers.length} users</span>
            <nav aria-label="User pagination"><button type="button" aria-label="Previous page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>‹</button>
              {Array.from({ length: totalPages }, (_, index) => index + 1).filter((number) => number === 1 || number === totalPages || Math.abs(number - currentPage) <= 1).map((number, index, numbers) => <span key={number}>{index > 0 && number - numbers[index - 1] > 1 && <span className="aum-page-gap">…</span>}<button type="button" aria-label={`Page ${number}`} aria-current={currentPage === number ? "page" : undefined} onClick={() => setPage(number)}>{number}</button></span>)}
              <button type="button" aria-label="Next page" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>›</button>
            </nav>
          </footer>
        </div>
      </section>

      <dialog className="aum-dialog" aria-labelledby="aum-dialog-title" ref={modalRef} onCancel={(event) => { if (operationPending.current) event.preventDefault(); }}>
        <header><h2 id="aum-dialog-title">{addingUser ? "Add User" : "Manage Account"}</h2><div className="aum-dialog-tools">{!addingUser && !editingUser && <button type="button" aria-label="Edit account information" title="Edit account information" disabled={isDeleting} onClick={() => { setEditingUser(true); setConfirmingDelete(false); setFormError(""); }}><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m16 3 5 5-12 12-6 1 1-6L16 3Zm-3 3 5 5" /></svg></button>}<button type="button" aria-label="Close account dialog" disabled={isCreating || isDeleting || updatingUserId !== null} onClick={() => modalRef.current?.close()}><Icon name="close" /></button></div></header>
        {formError && <p className="aum-form-error" role="alert">{formError}</p>}
        {addingUser ? <form onSubmit={createUser} key="create">
          <label>Full Name<input name="full_name" required maxLength={150} autoComplete="name" /></label>
          <label>Email<input name="email" type="email" required maxLength={254} autoComplete="email" /></label>
          <label>Phone Number<input name="phone_number" type="tel" autoComplete="tel" maxLength={25} /></label>
          <label>Role<select name="role" defaultValue="student">{roleOptions.filter((role) => role !== "all").map((role) => <option key={role} value={role}>{formatRole(role)}</option>)}</select></label>
          <label>Organization Name <small>(for providers)</small><input name="organization_name" maxLength={200} /></label>
          <label>Organisation Type <small>(for providers)</small><select name="organization_type" defaultValue=""><option value="">Select organisation type</option>{["Government Agency", "Foundation", "Private Company", "NGO", "Educational Institution"].map(type => <option key={type}>{type}</option>)}</select></label>
          <label>Password<input name="password" type="password" required minLength={8} autoComplete="new-password" /><small>Use at least 8 characters.</small></label>
          <button type="submit" className="aum-primary" disabled={isCreating}>{isCreating ? "Creating Account…" : "Create Account"}</button>
        </form> : actionUser && <div className="aum-manage">
          <h3>{actionUser.full_name}</h3><p>{actionUser.email}</p><p>{formatRole(actionUser.role)} · {String(actionUser.status || "active")}</p>
          {actionUser.provider_rejection_reason && <p><strong>Rejection reason:</strong> {actionUser.provider_rejection_reason}</p>}
          {!editingUser ? <dl className="aum-account-details">
            <div><dt>Full Name</dt><dd>{actionUser.full_name}</dd></div>
            <div><dt>Email</dt><dd>{actionUser.email}</dd></div>
            <div><dt>Phone Number</dt><dd>{actionUser.phone_number || "Not set"}</dd></div>
            {(profileFields[actionUser.role] || []).map(field => <div key={field.name}><dt>{field.label}</dt><dd>{String(actionUser[field.name] ?? "Not set")}</dd></div>)}
            {actionUser.role === "sponsor" && <div><dt>Organisation Type</dt><dd>{actionUser.organization_type || "Not set"}</dd></div>}
            <div><dt>Account Status</dt><dd><span className={`admin-status-badge ${actionUser.status}`}>{actionUser.status}</span></dd></div>
            <div><dt>Joined</dt><dd>{formatDate(actionUser.created_at)}</dd></div>
          </dl> : <><form key={`profile-${actionUser.user_id}`} onSubmit={updateUserProfile}>
            <h3>Edit User Information</h3>
            <label>Full Name<input name="full_name" required maxLength={150} defaultValue={actionUser.full_name} autoComplete="name" /></label>
            <label>Email<input name="email" type="email" required maxLength={254} defaultValue={actionUser.email} autoComplete="email" /></label>
            <label>Phone Number<input name="phone_number" type="tel" maxLength={25} defaultValue={actionUser.phone_number || ""} autoComplete="tel" /></label>
            {(profileFields[actionUser.role] || []).map(field => <label key={field.name}>{field.label}<input name={field.name} maxLength={field.maxLength} type={field.name === "website" ? "url" : field.name === "date_of_birth" ? "date" : ["cgpa","experience_years"].includes(field.name) ? "number" : "text"} step={field.name === "cgpa" ? "0.01" : "1"} min={["cgpa","experience_years"].includes(field.name) ? "0" : undefined} max={field.name === "cgpa" ? "4" : field.name === "experience_years" ? "60" : undefined} required={field.name === "organization_name"} defaultValue={String(actionUser[field.name] ?? "")} /></label>)}
            {actionUser.role === "sponsor" && <label>Organisation Type<select name="organization_type" required defaultValue={actionUser.organization_type || ""}><option value="">Select organisation type</option>{["Government Agency", "Foundation", "Private Company", "NGO", "Educational Institution", "Corporate", "University", "Non-Profit Organization"].map(type => <option key={type}>{type}</option>)}</select></label>}
            <button type="submit" className="aum-primary" disabled={isCreating || updatingUserId !== null}>{isCreating ? "Saving Information…" : "Save Information"}</button>
            <button type="button" className="aum-outline" disabled={isCreating || updatingUserId !== null} onClick={() => { setEditingUser(false); setFormError(""); }}>Cancel Editing</button>
          </form></>}
          {editingUser && <form key={actionUser.user_id} onSubmit={(event) => { event.preventDefault(); const status = new FormData(event.currentTarget).get("status") as UserStatus; void updateUserStatus(actionUser.user_id, status, String(new FormData(event.currentTarget).get("rejection_reason") || "")); }}>
            <label>Account Status<select name="status" defaultValue={String(actionUser.status || "active").toLowerCase()}><option value="active">{actionUser.role === "sponsor" && actionUser.status === "pending" ? "Approve Provider" : "Active"}</option>{actionUser.role === "sponsor" && <><option value="pending">Pending Verification</option><option value="rejected">Reject Provider Registration</option></>}<option value="disabled">Disabled</option><option value="suspended">Suspended</option></select></label>
            {actionUser.role === "sponsor" && <label>Rejection reason (required when rejecting)<textarea name="rejection_reason" maxLength={2000} defaultValue={actionUser.provider_rejection_reason || ""} /></label>}
            <button type="submit" className="aum-primary" disabled={isCreating || updatingUserId !== null}>{updatingUserId !== null ? "Saving…" : "Save Status"}</button>
          </form>}
          <div className="aum-delete-area">
            {confirmingDelete ? <div role="group" aria-label="Confirm account deletion"><h3>Delete this account?</h3><p>This permanently deletes {actionUser.full_name}'s account. Accounts with linked records must be disabled instead.</p><div className="aum-delete-actions"><button type="button" className="aum-delete-button" disabled={isDeleting} onClick={() => void deleteUserAccount()}>{isDeleting ? "Deleting…" : "Yes, Delete Account"}</button><button type="button" className="aum-outline" disabled={isDeleting} onClick={() => setConfirmingDelete(false)}>Cancel</button></div></div>
              : <button type="button" className="aum-delete-button" disabled={isCreating || updatingUserId !== null || actionUser.user_id === getStoredUser()?.user_id} onClick={() => { setConfirmingDelete(true); setFormError(""); }}>Delete Account</button>}
            {actionUser.user_id === getStoredUser()?.user_id && <p>You cannot delete your own administrator account.</p>}
          </div>
        </div>}
      </dialog>
    </div>
  );
}

export default AdminUsersPage;
