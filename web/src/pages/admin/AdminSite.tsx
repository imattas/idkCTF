import { Navigate, useParams } from "react-router-dom";
import AdminTabs from "./AdminTabs";
import AdminPages from "./AdminPages";
import AdminBrackets from "./AdminBrackets";
import AdminAppearance from "./AdminAppearance";
import Settings from "./Settings";

const tabs = [
  { id: "settings", label: "Settings", to: "/admin/site/settings", component: Settings },
  { id: "appearance", label: "Appearance", to: "/admin/site/appearance", component: AdminAppearance },
  { id: "pages", label: "Pages", to: "/admin/site/pages", component: AdminPages },
  { id: "brackets", label: "Brackets", to: "/admin/site/brackets", component: AdminBrackets },
];

export default function AdminSite() {
  const { tab = "settings" } = useParams();
  const active = tabs.find((item) => item.id === tab);
  if (!active) return <Navigate to="/admin/site/settings" replace />;

  const ActiveComponent = active.component;
  return (
    <div>
      <AdminTabs tabs={tabs} />
      <ActiveComponent />
    </div>
  );
}
