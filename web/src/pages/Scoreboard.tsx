import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { api, ApiError } from "../api";
import type { StandingRow, Bracket } from "../types";

const LINE_COLORS = ["#38bdf8", "#34d399", "#f472b6", "#fbbf24", "#a78bfa", "#fb7185", "#22d3ee", "#a3e635", "#f97316", "#e879f9"];

interface GraphSeries {
  name: string;
  points: { time: number; score: number }[];
}

export default function Scoreboard() {
  const [bracket, setBracket] = useState<number | null>(null);
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
  // Only show brackets relevant to the active mode.
  const relevantBrackets = (brk.data?.brackets ?? []).filter((b) => b.type === mode);

  if (sb.isLoading) return <p className="text-slate-500">Loading…</p>;
  if (sb.error) {
    const e = sb.error as ApiError;
    return <p className="text-slate-400">{e.status === 403 ? "Scoreboard is hidden." : e.message}</p>;
  }

  const standings = sb.data?.standings ?? [];

  // Merge series into chart rows keyed by timestamp.
  const series = gr.data?.series ?? [];
  const timeSet = new Set<number>();
  series.forEach((s) => s.points.forEach((p) => timeSet.add(p.time)));
  const times = [...timeSet].sort((a, b) => a - b);
  const chartData = times.map((t) => {
    const row: any = { time: t };
    series.forEach((s) => {
      const last = [...s.points].filter((p) => p.time <= t).pop();
      row[s.name] = last ? last.score : 0;
    });
    return row;
  });

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-2xl font-bold text-white">Scoreboard</h1>
        {sb.data?.frozen && <span className="badge border-sky-700 text-sky-400">❄ Frozen</span>}
      </div>

      {relevantBrackets.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          <button onClick={() => setBracket(null)} className={`badge ${bracket === null ? "border-sky-600 text-accent" : "border-slate-700 text-slate-400"}`}>Overall</button>
          {relevantBrackets.map((b) => (
            <button key={b.id} onClick={() => setBracket(b.id)} className={`badge ${bracket === b.id ? "border-sky-600 text-accent" : "border-slate-700 text-slate-400"}`}>{b.name}</button>
          ))}
        </div>
      )}

      {chartData.length > 1 && series.length > 0 && (
        <div className="card mb-6 h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="time"
                tickFormatter={(t) => new Date(t * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                stroke="#64748b"
                fontSize={11}
              />
              <YAxis stroke="#64748b" fontSize={11} />
              <Tooltip
                contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8 }}
                labelFormatter={(t) => new Date(Number(t) * 1000).toLocaleString()}
              />
              <Legend />
              {series.map((s, i) => (
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
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left text-slate-400">
              <th className="px-4 py-3 w-16">#</th>
              <th className="px-4 py-3">{sb.data?.mode === "teams" ? "Team" : "User"}</th>
              <th className="px-4 py-3 text-right">Solves</th>
              <th className="px-4 py-3 text-right">Score</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s) => (
              <tr key={s.account_id} className="border-b border-slate-900 hover:bg-slate-800/40">
                <td className="px-4 py-3 mono text-slate-500">{s.rank}</td>
                <td className="px-4 py-3 font-medium text-white">
                  <Link to={`/${mode === "teams" ? "teams" : "users"}/${s.account_id}`} className="hover:text-accent">{s.name}</Link>
                </td>
                <td className="px-4 py-3 text-right text-slate-400">{s.solves}</td>
                <td className="px-4 py-3 text-right mono text-sky-400">{s.score}</td>
              </tr>
            ))}
            {standings.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">No scores yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
