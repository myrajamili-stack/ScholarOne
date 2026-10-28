import { useEffect, useMemo, useState } from "react";

import api from "../../api/axios";
import { getApiErrorMessage } from "../../utils/apiError";
import { getInitials } from "../../utils/userDisplay";

type UserStatus = "active" | "disabled" | "suspended";

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
const statusOptions = ["all", "active", "disabled", "suspended"];

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
  if (!value) return "Not recorded";

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
  const [summary, setSummary] = useState<UserSummary | null>(null);
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
          setSummary(response.data.summary);
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

  const filteredUsers = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return users.filter((user) => {
      const matchesSearch =
        !normalizedSearch ||
        user.full_name.toLowerCase().includes(normalizedSearch) ||
        user.email.toLowerCase().includes(normalizedSearch);
      const matchesRole = roleFilter === "all" || user.role === roleFilter;
      const normalizedStatus = String(user.status || "active").toLowerCase();
      const matchesStatus = statusFilter === "all" || normalizedStatus === statusFilter;

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [roleFilter, searchTerm, statusFilter, users]);

  const updateUserStatus = async (userId: number, status: UserStatus) => {
    const previousUsers = users;

    setUpdatingUserId(userId);
    setError("");
    setUsers((currentUsers) =>
      currentUsers.map((user) => (user.user_id === userId ? { ...user, status } : user)),
    );

    try {
      await api.patch(`/admin/users/${userId}/status`, { status });
    } catch (requestError) {
      setUsers(previousUsers);
      setError(getApiErrorMessage(requestError, "Unable to update account status."));
    } finally {
      setUpdatingUserId(null);
    }
  };

  return (
    <div className="admin-page">
      <section className="admin-module-hero">
        <div>
          <span>User Control</span>
          <h1>User Management</h1>
          <p>Review accounts by role, inspect profile details, and manage account access across ScholarOne.</p>
        </div>
      </section>

      {error && <div className="admin-alert">{error}</div>}

      <section className="admin-users-summary">
        <article className="admin-stat-card">
          <span>Total Accounts</span>
          <strong>{summary?.total_users ?? 0}</strong>
          <p>{summary?.active_users ?? 0} active users</p>
        </article>
        <article className="admin-stat-card">
          <span>Students</span>
          <strong>{summary?.students ?? 0}</strong>
          <p>General scholarship users</p>
        </article>
        <article className="admin-stat-card">
          <span>Providers</span>
          <strong>{summary?.sponsors ?? 0}</strong>
          <p>Sponsorship organization accounts</p>
        </article>
        <article className="admin-stat-card">
          <span>Staff</span>
          <strong>{(summary?.advisors ?? 0) + (summary?.admins ?? 0)}</strong>
          <p>{summary?.restricted_users ?? 0} restricted accounts</p>
        </article>
      </section>

      <section className="admin-users-panel">
        <div className="admin-users-panel-header">
          <div>
            <span>Account Directory</span>
            <h2>System users</h2>
          </div>
          <div className="admin-users-controls">
            <input
              aria-label="Search users"
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search name or email..."
              type="search"
              value={searchTerm}
            />
            <select
              aria-label="Filter by role"
              onChange={(event) => setRoleFilter(event.target.value)}
              value={roleFilter}
            >
              {roleOptions.map((role) => (
                <option key={role} value={role}>
                  {role === "all" ? "All roles" : formatRole(role)}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by status"
              onChange={(event) => setStatusFilter(event.target.value)}
              value={statusFilter}
            >
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status === "all" ? "All statuses" : status}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="admin-empty-state">
            <strong>Loading user accounts...</strong>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="admin-empty-state">
            <strong>No user accounts found.</strong>
            <p className="admin-empty-copy">Try changing the search or role filters.</p>
          </div>
        ) : (
          <div className="admin-users-table-wrap">
            <table className="admin-users-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Account info</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Joined</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => {
                  const accountInfo = getAccountInfo(user);
                  const normalizedStatus = String(user.status || "active").toLowerCase() as UserStatus;

                  return (
                    <tr key={user.user_id}>
                      <td>
                        <div className="admin-user-cell">
                          <span className="admin-user-avatar">{getInitials(user.full_name)}</span>
                          <div>
                            <strong>{user.full_name}</strong>
                            <small>{user.email}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`admin-role-badge ${user.role}`}>{formatRole(user.role)}</span>
                      </td>
                      <td>
                        <div className="admin-account-detail">
                          <strong>{accountInfo.primary}</strong>
                          <small>{accountInfo.secondary}</small>
                        </div>
                      </td>
                      <td>{user.phone_number || "Not set"}</td>
                      <td>
                        <span className={`admin-status-badge ${normalizedStatus}`}>{normalizedStatus}</span>
                      </td>
                      <td>{formatDate(user.created_at)}</td>
                      <td>
                        <select
                          aria-label={`Update ${user.full_name} status`}
                          className="admin-action-select"
                          disabled={updatingUserId === user.user_id}
                          onChange={(event) => updateUserStatus(user.user_id, event.target.value as UserStatus)}
                          value={normalizedStatus}
                        >
                          <option value="active">Active</option>
                          <option value="disabled">Disabled</option>
                          <option value="suspended">Suspended</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default AdminUsersPage;
