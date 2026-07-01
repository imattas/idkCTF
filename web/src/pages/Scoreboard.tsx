import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { api, ApiError } from "../api";
import type { StandingRow, Bracket } from "../types";

const LINE_COLORS = ["#cf2336", "#d8ab44", "#34d399", "#60a5fa", "#a78bfa", "#f472b6", "#22d3ee", "#a3e635", "#f97316", "#e879f9"];

interface GraphSeries {
  name: string;
  points: { time: number; score: number }[];
}

type ChartRow = { time: number } & Record<string, number>;

export default function Scoreboard() {
  const [bracket, setBracket] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const q = bracket ? `?bracket=${bracket}` : "";

  const brk = useQuery({ queryKey: ["brackets"], queryFn: () => api.get<{ brackets: Bracket[] }>("/brackets") });
  const sb = useQuery({
    queryKey: ["scoreboard", bracket],
    queryFn: () => api.get<{ mode: string; frozen: boolean; standings: StandingRow[] }>(`/scoreboard${q}`),
  });
  const gr = useQuery({
    queryKey: ["scoreboard-graph", bracket],
    queryFn: () => api.get<{ series: GraphSeries[] }>(`/scoreboard/graph?top=10${bracket ? `&bracket=${bracket}` : ""}`),
  });

  const mode = sb.data?.mode;
  const relevantBrackets = (brk.data?.brackets ?? []).filter((b) => b.type === mode);
  const standings = sb.data?.standings ?? [];
  const filteredStandings = standings.filter((s) => s.name.toLowerCase().includes(search.trim().toLowerCase()));

  const chartData = useMemo(() => {
    const series = gr.data?.series ?? [];
    const timeSet = new Set<number>();
    series.forEach((s) => s.points.forEach((p) => timeSet.add(p.time)));
    const times = [...timeSet].sort((a, b) => a - b);
    return times.map((t) => {
      const row: ChartRow = { time: t };
      series.forEach((s) => {
        const last = [...s.points].filter((p) => p.time <= t).pop();
        row[s.name] = last ? last.score : 0;
      });
      return row;
    });
  }, [gr.data?.series]);

  if (sb.isLoading) return <p className="text-slate-500">Loading...</p>;
  if (sb.error) {
    const e = sb.error as ApiError;
    return <p className="text-slate-400">{e.status === 403 ? "Scoreboard is hidden." : e.message}</p>;
  }

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <div className="page-kicker">Rankings</div>
          <h1 className="page-title">Scoreboard</h1>
          <p className="page-subtitle">{standings.length} {mode === "teams" ? "teams" : "players"} on the board.</p>
        </div>
        {sb.data?.frozen && <span className="badge badge-accent">Frozen</span>}
      </section>

      {relevantBrackets.length > 0 && (
        <section className="flex flex-wrap gap-2">
          <button onClick={() => setBracket(null)} className={`badge ${bracket === null ? "badge-accent" : ""}`}>Overall</button>
          {relevantBrackets.map((b) => (
            <button key={b.id} onClick={() => setBracket(b.id)} className={`badge ${bracket === b.id ? "badge-accent" : ""}`}>{b.name}</button>
          ))}
        </section>
      )}

      {standings.length > 0 && (
        <section className="grid gap-3 md:grid-cols-3">
          {standings.slice(0, 3).map((s) => (
            <Link key={s.account_id} to={`/${mode === "teams" ? "teams" : "users"}/${s.account_id}`} className="card transition hover:border-[var(--accent-line)] hover:bg-[var(--surface-2)]">
              <div className="stat-value">#{s.rank}</div>
              <div className="mt-2 truncate text-lg font-semibold text-white">{s.name}</div>
              <div className="stat-label">{s.score} pts / {s.solves} solves</div>
            </Link>
          ))}
        </section>
      )}

      {chartData.length > 1 && (gr.data?.series?.length ?? 0) > 0 && (
        <section className="card h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#21212a" />
              <XAxis
                dataKey="time"
                tickFormatter={(t) => new Date(t * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                stroke="#7f7f8a"
                fontSize={11}
              />
              <YAxis stroke="#7f7f8a" fontSize={11} />
              <Tooltip
                contentStyle={{ background: "#111116", border: "1px solid #32323d", borderRadius: 8, color: "#ededf1" }}
                labelFormatter={(t) => new Date(Number(t) * 1000).toLocaleString()}
              />
              <Legend />
              {(gr.data?.series ?? []).map((s, i) => (
                <Line
                  key={s.name}
                  type="stepAfter"
                  dataKey={s.name}
                  stroke={LINE_COLORS[i % LINE_COLORS.length]}
                  dot={false}
                  strokeWidth={2}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <input className="input" placeholder={`Search ${mode === "teams" ? "teams" : "players"}`} value={search} onChange={(e) => setSearch(e.target.value)} />
        <span className="text-xs text-[var(--fg-faint)] mono">{filteredStandings.length} / {standings.length}</span>
      </section>

      <section className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-[var(--fg-faint)]">
              <th className="w-16 px-4 py-3">#</th>
              <th className="px-4 py-3">{mode === "teams" ? "Team" : "User"}</th>
              <th className="px-4 py-3 text-right">Solves</th>
              <th className="px-4 py-3 text-right">Score</th>
            </tr>
          </thead>
          <tbody>
            {filteredStandings.map((s) => (
              <tr key={s.account_id} className="border-b border-[var(--border-soft)] hover:bg-[var(--surface-2)]">
                <td className="px-4 py-3 mono text-[var(--fg-faint)]">{s.rank}</td>
                <td className="px-4 py-3 font-medium text-white">
                  <Link to={`/${mode === "teams" ? "teams" : "users"}/${s.account_id}`} className="hover:text-[var(--accent-strong)]">{s.name}</Link>
                </td>
                <td className="px-4 py-3 text-right text-slate-400">{s.solves}</td>
                <td className="px-4 py-3 text-right text-[var(--accent-strong)] mono">{s.score}</td>
              </tr>
            ))}
            {filteredStandings.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">No scores match.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
