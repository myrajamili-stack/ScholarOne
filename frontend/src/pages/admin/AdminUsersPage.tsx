import { useEffect, useMemo, useRef, useState } from "react";

import Icon from "../../components/advisor/AdvisorIcon";
import type { FormEvent } from "react";
import "../../styles/admin-users.css";
import api from "../../api/axios";
import { getApiErrorMessage } from "../../utils/apiError";
import { getInitials } from "../../utils/userDisplay";

type UserStatus = "active" | "disabled" | "suspended" | "pending";

type AdminUserRecord = {
  user_id: number;
  full_name: string;
  email: string;
  phone_number: string | null;
  role: string;
  status: UserStatus | string;
  created_at: string | null;
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
const statusOptions = ["all", "active", "pending", "disabled", "suspended"];

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

  async function updateUserStatus(userId: number, status: UserStatus) {
    if (operationPending.current) return;
    operationPending.current = true;
    setUpdatingUserId(userId);
    setFormError("");
    setSuccess("");
    try {
      const response = await api.patch<{ user: AdminUserRecord }>(`/admin/users/${userId}/status`, { status });
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
        full_name: fullName, email, phone_number: phone || null, password, role,
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
        <header><h2 id="aum-dialog-title">{addingUser ? "Add User" : "Manage Account"}</h2><button type="button" aria-label="Close account dialog" disabled={isCreating || updatingUserId !== null} onClick={() => modalRef.current?.close()}><Icon name="close" /></button></header>
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
          <form key={actionUser.user_id} onSubmit={(event) => { event.preventDefault(); const status = new FormData(event.currentTarget).get("status") as UserStatus; void updateUserStatus(actionUser.user_id, status); }}>
            <label>Account Status<select name="status" defaultValue={String(actionUser.status || "active").toLowerCase()}><option value="active">{actionUser.role === "sponsor" && actionUser.status === "pending" ? "Approve Provider" : "Active"}</option>{actionUser.role === "sponsor" && <option value="pending">Pending Verification</option>}<option value="disabled">Disabled</option><option value="suspended">Suspended</option></select></label>
            <button type="submit" className="aum-primary" disabled={updatingUserId !== null}>{updatingUserId !== null ? "Saving…" : "Save Status"}</button>
          </form>
        </div>}
      </dialog>
    </div>
  );
}

export default AdminUsersPage;
