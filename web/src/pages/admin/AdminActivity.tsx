import { Navigate, useParams } from "react-router-dom";
import AdminTabs from "./AdminTabs";
import AdminSubmissions from "./AdminSubmissions";
import AdminReviewCases from "./AdminReviewCases";
import AdminAppeals from "./AdminAppeals";
import AdminReview from "./AdminReview";
import AdminLogs from "./AdminLogs";

const tabs = [
  { id: "cases", label: "Anti-slop", to: "/admin/activity/cases", component: AdminReviewCases },
  { id: "appeals", label: "Appeals", to: "/admin/activity/appeals", component: AdminAppeals },
  { id: "submissions", label: "Submissions", to: "/admin/activity/submissions", component: AdminSubmissions },
  { id: "review", label: "Legacy review", to: "/admin/activity/review", component: AdminReview },
  { id: "logs", label: "Logs", to: "/admin/activity/logs", component: AdminLogs },
];

export default function AdminActivity() {
  const { tab = "cases" } = useParams();
  const active = tabs.find((item) => item.id === tab);
  if (!active) return <Navigate to="/admin/activity/cases" replace />;

  const ActiveComponent = active.component;
  return (
    <div>
      <AdminTabs tabs={tabs} />
      <ActiveComponent />
    </div>
  );
}
