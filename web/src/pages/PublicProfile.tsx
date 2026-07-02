import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import { StatsChartGrid } from "../components/StatsCharts";
import type { ProfileStats } from "../types";

export default function PublicProfile({ kind }: { kind: "user" | "team" }) {
  const { id } = useParams();
  const { data, error, isLoading } = useQuery({
    queryKey: ["profile", kind, id],
    queryFn: () => api.get<any>(`/profile/${kind}/${id}`),
  });

  if (isLoading) return <p className="text-slate-500">Loading...</p>;
  if (error) {
    const e = error as ApiError;
    return <p className="py-16 text-center text-slate-400">{e.status === 403 ? "Profiles are private." : "Not found."}</p>;
  }

  const entity = kind === "user" ? data.user : data.team;
  const stats: ProfileStats = data.stats;

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <div className="page-kicker">{kind}</div>
          <h1 className="page-title">{entity.name}</h1>
          <div className="mt-1 flex flex-wrap gap-2 text-sm text-slate-400">
            {entity.bracket_name && <span className="badge badge-accent">{entity.bracket_name}</span>}
            {entity.affiliation && <span>{entity.affiliation}</span>}
            {entity.country && <span>{entity.country}</span>}
            {kind === "user" && entity.team_name && (
              <Link to={`/teams/${entity.team_id}`} className="text-accent hover:underline">team {entity.team_name}</Link>
            )}
          </div>
        </div>
      </section>

      <StatsChartGrid stats={stats} />

      {kind === "team" && data.members?.length > 0 && (
        <div className="card">
          <div className="label">Members</div>
          <div className="flex flex-wrap gap-2">
            {data.members.map((m: any) => (
              <Link key={m.id} to={`/users/${m.id}`} className="badge border-slate-700 text-slate-200 hover:border-sky-600">
                {m.name}{m.is_captain ? " (captain)" : ""}
              </Link>
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
