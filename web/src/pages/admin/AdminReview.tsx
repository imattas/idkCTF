import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api";

interface Flag {
  id: number; user_id: number; team_id: number | null; challenge_id: number | null;
  type: string; detail: string; resolved: number; created_at: number;
  user_name: string | null; team_name: string | null; challenge_name: string | null;
}

const TYPE_COLORS: Record<string, string> = {
  fast_solve: "border-amber-700 text-amber-400",
  no_view: "border-rose-700 text-rose-400",
  rapid: "border-orange-700 text-orange-400",
  manual: "border-violet-700 text-violet-400",
};

export default function AdminReview() {
  const [all, setAll] = useState(false);
  const { data, refetch } = useQuery({
    queryKey: ["admin-review", all],
    queryFn: () => api.get<{ flags: Flag[] }>(`/admin/review-flags${all ? "?all=1" : ""}`),
  });
  const resolve = async (id: number) => { await api.post(`/admin/review-flags/${id}/resolve`); refetch(); };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Review queue</h1>
        <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Show resolved</label>
      </div>
      <p className="mb-6 text-sm text-slate-400">Solves auto-flagged as suspicious (fast solves, solved-without-viewing, rapid solves) plus manual flags. Thresholds in Settings.</p>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left text-slate-400">
              <th className="px-4 py-3">Time</th><th className="px-4 py-3">User</th><th className="px-4 py-3">Challenge</th><th className="px-4 py-3">Flag</th><th className="px-4 py-3">Detail</th><th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {data?.flags.map((f) => (
              <tr key={f.id} className={`border-b border-slate-900 ${f.resolved ? "opacity-50" : ""}`}>
                <td className="px-4 py-3 mono text-xs text-slate-500 whitespace-nowrap">{new Date(f.created_at * 1000).toLocaleString()}</td>
                <td className="px-4 py-3">
                  <Link to={`/users/${f.user_id}`} className="text-white hover:text-accent">{f.user_name || `#${f.user_id}`}</Link>
                  {f.team_name && <span className="text-slate-500"> · {f.team_name}</span>}
                </td>
                <td className="px-4 py-3 text-slate-400">{f.challenge_name || "—"}</td>
                <td className="px-4 py-3"><span className={`badge ${TYPE_COLORS[f.type] || "border-slate-600 text-slate-300"}`}>{f.type}</span></td>
                <td className="px-4 py-3 text-slate-400">{f.detail}</td>
                <td className="px-4 py-3 text-right">{!f.resolved && <button className="btn-ghost text-xs" onClick={() => resolve(f.id)}>Resolve</button>}</td>
              </tr>
            ))}
            {!data?.flags.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Nothing flagged. 🎉</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
