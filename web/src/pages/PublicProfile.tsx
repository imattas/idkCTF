import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { api, ApiError } from "../api";
import type { ProfileStats } from "../types";

const CAT_COLOR = "#38bdf8";

export default function PublicProfile({ kind }: { kind: "user" | "team" }) {
  const { id } = useParams();
  const { data, error, isLoading } = useQuery({
    queryKey: ["profile", kind, id],
    queryFn: () => api.get<any>(`/profile/${kind}/${id}`),
  });

  if (isLoading) return <p className="text-slate-500">Loading…</p>;
  if (error) {
    const e = error as ApiError;
    return <p className="py-16 text-center text-slate-400">{e.status === 403 ? "Profiles are private." : "Not found."}</p>;
  }

  const entity = kind === "user" ? data.user : data.team;
  const stats: ProfileStats = data.stats;
  const cats = Object.entries(stats.categories);
  const maxCat = Math.max(1, ...cats.map(([, v]) => v.points));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-white">{entity.name}</h1>
          <div className="mt-1 flex flex-wrap gap-2 text-sm text-slate-400">
            {entity.bracket_name && <span className="badge border-sky-700 text-accent">{entity.bracket_name}</span>}
            {entity.affiliation && <span>{entity.affiliation}</span>}
            {entity.country && <span>· {entity.country}</span>}
            {kind === "user" && entity.team_name && (
              <Link to={`/teams/${entity.team_id}`} className="text-accent hover:underline">· team {entity.team_name}</Link>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Stat label="Score" value={stats.score} />
        <Stat label="Rank" value={stats.rank ? `#${stats.rank}` : "—"} />
        <Stat label="Solves" value={stats.solve_count} />
      </div>

      {kind === "team" && data.members?.length > 0 && (
        <div className="card">
          <div className="label">Members</div>
          <div className="flex flex-wrap gap-2">
            {data.members.map((m: any) => (
              <Link key={m.id} to={`/users/${m.id}`} className="badge border-slate-700 text-slate-200 hover:border-sky-600">
                {m.name}{m.is_captain ? " ★" : ""}
              </Link>
            ))}
          </div>
        </div>
      )}

      {stats.timeline.length > 1 && (
        <div className="card h-64">
          <div className="label">Score over time</div>
          <ResponsiveContainer width="100%" height="90%">
            <LineChart data={stats.timeline} margin={{ top: 5, right: 20, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="time" tickFormatter={(t) => new Date(t * 1000).toLocaleDateString()} stroke="#64748b" fontSize={11} />
              <YAxis stroke="#64748b" fontSize={11} />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8 }} labelFormatter={(t) => new Date(Number(t) * 1000).toLocaleString()} />
              <Line type="stepAfter" dataKey="score" stroke={CAT_COLOR} dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {cats.length > 0 && (
        <div className="card">
          <div className="label">Category breakdown</div>
          <div className="space-y-2">
            {cats.map(([cat, v]) => (
              <div key={cat}>
                <div className="mb-1 flex justify-between text-sm"><span className="text-slate-300">{cat}</span><span className="text-slate-500">{v.count} solves · {v.points} pts</span></div>
                <div className="h-2 rounded-full bg-slate-800"><div className="h-2 rounded-full" style={{ width: `${(v.points / maxCat) * 100}%`, background: "var(--accent)" }} /></div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left text-slate-400">
              <th className="px-4 py-3">Challenge</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3 text-right">Value</th>
              <th className="px-4 py-3 text-right">Solved</th>
            </tr>
          </thead>
          <tbody>
            {stats.solves.map((s) => (
              <tr key={s.challenge_id} className="border-b border-slate-900">
                <td className="px-4 py-2 text-white">{s.name}</td>
                <td className="px-4 py-2 text-slate-400">{s.category}</td>
                <td className="px-4 py-2 text-right mono text-accent">{s.value}</td>
                <td className="px-4 py-2 text-right mono text-xs text-slate-500">{new Date(s.created_at * 1000).toLocaleString()}</td>
              </tr>
            ))}
            {!stats.solves.length && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">No solves yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="card">
      <div className="text-sm text-slate-400">{label}</div>
      <div className="mono text-3xl font-bold text-accent">{value}</div>
    </div>
  );
}
