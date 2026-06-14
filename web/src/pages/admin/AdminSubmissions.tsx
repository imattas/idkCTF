import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api";

interface Sub {
  id: number; provided: string; correct: number; created_at: number; ip: string | null;
  user_name: string; team_name: string | null; challenge_name: string;
}

export default function AdminSubmissions() {
  const [filter, setFilter] = useState("");
  const { data } = useQuery({
    queryKey: ["admin-submissions", filter],
    queryFn: () => api.get<{ submissions: Sub[] }>(`/admin/submissions${filter ? `?correct=${filter}` : ""}`),
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Submissions</h1>
        <select className="input w-40" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All</option>
          <option value="1">Correct only</option>
          <option value="0">Incorrect only</option>
        </select>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left text-slate-400">
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Team</th>
              <th className="px-4 py-3">Challenge</th>
              <th className="px-4 py-3">Provided</th>
              <th className="px-4 py-3">Result</th>
            </tr>
          </thead>
          <tbody>
            {data?.submissions.map((s) => (
              <tr key={s.id} className="border-b border-slate-900 hover:bg-slate-800/40">
                <td className="px-4 py-3 mono text-xs text-slate-500">{new Date(s.created_at * 1000).toLocaleString()}</td>
                <td className="px-4 py-3 text-slate-300">{s.user_name}</td>
                <td className="px-4 py-3 text-slate-400">{s.team_name || "—"}</td>
                <td className="px-4 py-3 text-slate-300">{s.challenge_name}</td>
                <td className="px-4 py-3 mono text-xs text-slate-400 max-w-xs truncate">{s.provided}</td>
                <td className="px-4 py-3">
                  {s.correct ? <span className="badge border-emerald-700 text-emerald-400">correct</span> : <span className="badge border-rose-700 text-rose-400">wrong</span>}
                </td>
              </tr>
            ))}
            {!data?.submissions.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No submissions.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
