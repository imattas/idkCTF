import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ProfileStats } from "../types";

const CHART_HEIGHT = 240;
const GRID = "#21212a";
const AXIS = "#7f7f8a";
const SURFACE = "#111116";
const BORDER = "#32323d";
const FG = "#ededf1";

function tooltipStyle() {
  return { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 8, color: FG };
}

export function StatsOverview({ stats }: { stats: ProfileStats }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="card">
        <div className="stat-label">Score</div>
        <div className="stat-value">{stats.score}</div>
      </div>
      <div className="card">
        <div className="stat-label">Rank</div>
        <div className="stat-value">{stats.rank ? `#${stats.rank}` : "-"}</div>
      </div>
      <div className="card">
        <div className="stat-label">Solves</div>
        <div className="stat-value">{stats.solve_count}</div>
      </div>
    </div>
  );
}

export function ScoreTimelineChart({ stats, title = "Score over time" }: { stats: ProfileStats; title?: string }) {
  if (stats.timeline.length < 2) return null;
  return (
    <section className="card h-80">
      <div className="label">{title}</div>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <LineChart data={stats.timeline} margin={{ top: 8, right: 18, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
          <XAxis dataKey="time" tickFormatter={(t) => new Date(t * 1000).toLocaleDateString()} stroke={AXIS} fontSize={11} />
          <YAxis stroke={AXIS} fontSize={11} />
          <Tooltip contentStyle={tooltipStyle()} labelFormatter={(t) => new Date(Number(t) * 1000).toLocaleString()} />
          <Line type="stepAfter" dataKey="score" stroke="var(--accent)" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </section>
  );
}

export function CategoryPointsChart({ stats }: { stats: ProfileStats }) {
  const rows = Object.entries(stats.categories)
    .map(([category, value]) => ({ category, points: value.points, solves: value.count }))
    .sort((a, b) => b.points - a.points);
  if (!rows.length) return null;
  return (
    <section className="card h-80">
      <div className="label">Category points</div>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <BarChart data={rows} margin={{ top: 8, right: 18, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
          <XAxis dataKey="category" stroke={AXIS} fontSize={11} />
          <YAxis stroke={AXIS} fontSize={11} />
          <Tooltip contentStyle={tooltipStyle()} />
          <Bar dataKey="points" fill="var(--accent)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </section>
  );
}

export function SolvePaceChart({ stats }: { stats: ProfileStats }) {
  if (stats.solves.length < 2) return null;
  const rows = [...stats.solves]
    .sort((a, b) => a.created_at - b.created_at)
    .map((solve, index) => ({ time: solve.created_at, solves: index + 1 }));
  return (
    <section className="card h-80">
      <div className="label">Solve pace</div>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <LineChart data={rows} margin={{ top: 8, right: 18, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
          <XAxis dataKey="time" tickFormatter={(t) => new Date(t * 1000).toLocaleDateString()} stroke={AXIS} fontSize={11} />
          <YAxis allowDecimals={false} stroke={AXIS} fontSize={11} />
          <Tooltip contentStyle={tooltipStyle()} labelFormatter={(t) => new Date(Number(t) * 1000).toLocaleString()} />
          <Line type="stepAfter" dataKey="solves" stroke="#d8ab44" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </section>
  );
}

export function StatsChartGrid({ stats }: { stats: ProfileStats }) {
  return (
    <>
      <StatsOverview stats={stats} />
      <div className="grid gap-4 lg:grid-cols-2">
        <ScoreTimelineChart stats={stats} />
        <SolvePaceChart stats={stats} />
        <CategoryPointsChart stats={stats} />
      </div>
    </>
  );
}
