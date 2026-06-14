import { useQuery } from "@tanstack/react-query";
import { api } from "../../api";

export default function Dashboard() {
  const { data } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => api.get<Record<string, number>>("/admin/stats"),
  });

  const cards = [
    ["Users", data?.users],
    ["Teams", data?.teams],
    ["Challenges", data?.challenges],
    ["Solves", data?.solves],
    ["Submissions", data?.submissions],
    ["Correct", data?.correct],
  ] as const;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-white">Dashboard</h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {cards.map(([label, val]) => (
          <div key={label} className="card">
            <div className="text-sm text-slate-400">{label}</div>
            <div className="mono text-3xl font-bold text-sky-400">{val ?? "—"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
