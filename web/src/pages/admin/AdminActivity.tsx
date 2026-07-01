import { Navigate, useParams } from "react-router-dom";
import AdminTabs from "./AdminTabs";
import AdminSubmissions from "./AdminSubmissions";
import AdminReview from "./AdminReview";
import AdminLogs from "./AdminLogs";

const tabs = [
  { id: "submissions", label: "Submissions", to: "/admin/activity/submissions", component: AdminSubmissions },
  { id: "review", label: "Review", to: "/admin/activity/review", component: AdminReview },
  { id: "logs", label: "Logs", to: "/admin/activity/logs", component: AdminLogs },
];

export default function AdminActivity() {
  const { tab = "submissions" } = useParams();
  const active = tabs.find((item) => item.id === tab);
  if (!active) return <Navigate to="/admin/activity/submissions" replace />;

  const ActiveComponent = active.component;
  return (
    <div>
      <AdminTabs tabs={tabs} />
      <ActiveComponent />
    </div>
  );
}
