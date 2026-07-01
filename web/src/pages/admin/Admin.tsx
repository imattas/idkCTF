import { Routes, Route, NavLink, Navigate } from "react-router-dom";
import Dashboard from "./Dashboard";
import AdminChallenges from "./AdminChallenges";
import AdminPeople from "./AdminPeople";
import AdminActivity from "./AdminActivity";
import AdminSite from "./AdminSite";
import AdminPlugins from "./AdminPlugins";

export default function Admin() {
  // Absolute paths so links never stack onto the current URL.
  const item = (to: string, label: string) => (
    <NavLink
      to={to}
      end={to === "/admin"}
      className={({ isActive }) =>
        `block rounded-md px-3 py-2 text-sm transition ${
          isActive
            ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
            : "text-[var(--fg-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
        }`
      }
    >
      {label}
    </NavLink>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[180px_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <h2 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-[var(--fg-disabled)]">Admin</h2>
        <nav className="flex gap-2 overflow-x-auto rounded-md border border-[var(--border)] bg-[var(--surface)] p-2 lg:block lg:space-y-1 lg:overflow-visible">
          {item("/admin", "Dashboard")}
          {item("/admin/challenges", "Challenges")}
          {item("/admin/people", "People")}
          {item("/admin/activity", "Activity")}
          {item("/admin/site", "Site")}
          {item("/admin/webhooks", "Webhooks")}
        </nav>
      </aside>
      <div className="min-w-0">
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="challenges" element={<AdminChallenges />} />
          <Route path="people" element={<Navigate to="/admin/people/users" replace />} />
          <Route path="people/:tab" element={<AdminPeople />} />
          <Route path="activity" element={<Navigate to="/admin/activity/submissions" replace />} />
          <Route path="activity/:tab" element={<AdminActivity />} />
          <Route path="site" element={<Navigate to="/admin/site/settings" replace />} />
          <Route path="site/:tab" element={<AdminSite />} />
          <Route path="webhooks" element={<AdminPlugins />} />
          <Route path="plugins" element={<Navigate to="/admin/webhooks" />} />
          <Route path="users" element={<Navigate to="/admin/people/users" replace />} />
          <Route path="teams" element={<Navigate to="/admin/people/teams" replace />} />
          <Route path="bans" element={<Navigate to="/admin/people/bans" replace />} />
          <Route path="submissions" element={<Navigate to="/admin/activity/submissions" replace />} />
          <Route path="review" element={<Navigate to="/admin/activity/review" replace />} />
          <Route path="logs" element={<Navigate to="/admin/activity/logs" replace />} />
          <Route path="pages" element={<Navigate to="/admin/site/pages" replace />} />
          <Route path="brackets" element={<Navigate to="/admin/site/brackets" replace />} />
          <Route path="appearance" element={<Navigate to="/admin/site/appearance" replace />} />
          <Route path="settings" element={<Navigate to="/admin/site/settings" replace />} />
          <Route path="*" element={<Navigate to="/admin" />} />
        </Routes>
      </div>
    </div>
  );
}
