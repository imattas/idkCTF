import { Navigate, useParams } from "react-router-dom";
import AdminTabs from "./AdminTabs";
import AdminUsers from "./AdminUsers";
import AdminTeams from "./AdminTeams";
import AdminBans from "./AdminBans";

const tabs = [
  { id: "users", label: "Users", to: "/admin/people/users", component: AdminUsers },
  { id: "teams", label: "Teams", to: "/admin/people/teams", component: AdminTeams },
  { id: "bans", label: "Bans", to: "/admin/people/bans", component: AdminBans },
];

export default function AdminPeople() {
  const { tab = "users" } = useParams();
  const active = tabs.find((item) => item.id === tab);
  if (!active) return <Navigate to="/admin/people/users" replace />;

  const ActiveComponent = active.component;
  return (
    <div>
      <AdminTabs tabs={tabs} />
      <ActiveComponent />
    </div>
  );
}
