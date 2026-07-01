import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { useStore } from "../store";
import Markdown from "../components/Markdown";

function fmtDate(ts: number | null) {
  if (!ts) return "Not scheduled";
  return new Date(ts * 1000).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Countdown({ target, label }: { target: number; label: string }) {
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));

  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  let s = Math.max(0, target - now);
  const d = Math.floor(s / 86400);
  s -= d * 86400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;

  const box = (value: number, unit: string) => (
    <div className="min-w-16">
      <div className="stat-value text-2xl">{String(value).padStart(2, "0")}</div>
      <div className="stat-label mt-1">{unit}</div>
    </div>
  );

  return (
    <div>
      <div className="page-kicker">{label}</div>
      <div className="grid grid-cols-4 gap-3">
        {box(d, "days")}
        {box(h, "hrs")}
        {box(m, "min")}
        {box(s, "sec")}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <div className="break-words text-xl font-semibold leading-tight text-[var(--fg)] mono">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export default function Home() {
  const { config, user, competition_state } = useStore();
  const status =
    competition_state === "before" ? "Not started" :
    competition_state === "ended" ? "Ended" :
    config.paused ? "Paused" :
    "Running";

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <div className="page-kicker">Competition</div>
          <h1 className="page-title">{config.ctf_name}</h1>
          <p className="page-subtitle">{config.ctf_description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/challenges" className="btn-primary">{user ? "Open challenges" : "View challenges"}</Link>
          {config.scoreboard_visible && <Link to="/scoreboard" className="btn-ghost">Scoreboard</Link>}
          {!user && config.registration_open && !config.site_lockdown && <Link to="/register" className="btn-ghost">Register</Link>}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <Stat label="Status" value={status} />
        <Stat label="Mode" value={config.mode === "teams" ? "Teams" : "Users"} />
        <Stat label="Starts" value={fmtDate(config.start_time)} />
        <Stat label="Ends" value={fmtDate(config.end_time)} />
      </section>

      {(competition_state === "before" && config.start_time) || (competition_state === "running" && config.end_time) ? (
        <section className="card">
          {competition_state === "before" && config.start_time && <Countdown target={config.start_time} label="Starts in" />}
          {competition_state === "running" && config.end_time && <Countdown target={config.end_time} label="Ends in" />}
        </section>
      ) : null}

      {config.mode === "teams" && user && !user.team_id && (
        <section className="card flex flex-col justify-between gap-3 border-amber-700/60 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-base">Team required</h2>
            <p className="mt-1 text-sm">Join or create a team before submitting flags.</p>
          </div>
          <Link to="/team" className="btn-primary">Set up team</Link>
        </section>
      )}

      {config.home_content && (
        <section className="border-t border-[var(--border)] pt-8">
          <Markdown content={config.home_content} format={config.home_format} />
        </section>
      )}
    </div>
  );
}
