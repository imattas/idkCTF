import { Routes, Route, NavLink, Navigate } from "react-router-dom";
import Dashboard from "./Dashboard";
import AdminChallenges from "./AdminChallenges";
import AdminUsers from "./AdminUsers";
import AdminTeams from "./AdminTeams";
import AdminSubmissions from "./AdminSubmissions";
import AdminLogs from "./AdminLogs";
import AdminReview from "./AdminReview";
import AdminBans from "./AdminBans";
import AdminPlugins from "./AdminPlugins";
import AdminAppearance from "./AdminAppearance";
import AdminPages from "./AdminPages";
import AdminBrackets from "./AdminBrackets";
import Settings from "./Settings";

export default function Admin() {
  // Absolute paths so links never stack onto the current URL.
  const item = (to: string, label: string) => (
    <NavLink
      to={to}
      end={to === "/admin"}
      className={({ isActive }) =>
        `block rounded-md px-3 py-2 text-sm transition ${
          isActive ? "bg-sky-500/10 text-accent" : "text-slate-300 hover:bg-slate-800"
        }`
      }
    >
      {label}
    </NavLink>
  );

  return (
    <div className="grid grid-cols-[200px_1fr] gap-8">
      <aside className="space-y-1">
        <h2 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Admin</h2>
        {item("/admin", "Dashboard")}
        {item("/admin/challenges", "Challenges")}
        {item("/admin/users", "Users")}
        {item("/admin/teams", "Teams")}
        {item("/admin/submissions", "Submissions")}
        {item("/admin/review", "Review")}
        {item("/admin/bans", "Bans")}
        {item("/admin/logs", "Logs")}
        {item("/admin/pages", "Pages")}
        {item("/admin/brackets", "Brackets")}
        {item("/admin/webhooks", "Webhooks")}
        {item("/admin/appearance", "Appearance")}
        {item("/admin/settings", "Settings")}
      </aside>
      <div>
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="challenges" element={<AdminChallenges />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="teams" element={<AdminTeams />} />
          <Route path="submissions" element={<AdminSubmissions />} />
          <Route path="review" element={<AdminReview />} />
          <Route path="bans" element={<AdminBans />} />
          <Route path="logs" element={<AdminLogs />} />
          <Route path="pages" element={<AdminPages />} />
          <Route path="brackets" element={<AdminBrackets />} />
          <Route path="webhooks" element={<AdminPlugins />} />
          <Route path="plugins" element={<Navigate to="/admin/webhooks" />} />
          <Route path="appearance" element={<AdminAppearance />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/admin" />} />
        </Routes>
      </div>
    </div>
  );
}
