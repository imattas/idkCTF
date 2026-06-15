import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { useStore } from "../store";
import Markdown from "../components/Markdown";

function Countdown({ target, label }: { target: number; label: string }) {
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  let s = Math.max(0, target - now);
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  const box = (v: number, l: string) => (
    <div className="text-center">
      <div className="mono text-3xl font-bold text-sky-400">{String(v).padStart(2, "0")}</div>
      <div className="text-xs uppercase text-slate-500">{l}</div>
    </div>
  );
  return (
    <div>
      <div className="mb-2 text-sm text-slate-400">{label}</div>
      <div className="flex gap-6">{box(d, "days")}{box(h, "hrs")}{box(m, "min")}{box(s, "sec")}</div>
    </div>
  );
}

export default function Home() {
  const { config, user, competition_state } = useStore();

  return (
    <div className="mx-auto max-w-3xl py-10 text-center">
      <h1 className="mb-3 text-5xl font-bold text-white">{config.ctf_name}</h1>
      <p className="mx-auto mb-8 max-w-xl text-lg text-slate-400">{config.ctf_description}</p>

      <div className="mb-10 flex justify-center">
        {competition_state === "before" && config.start_time && (
          <Countdown target={config.start_time} label="Starts in" />
        )}
        {competition_state === "running" && config.end_time && (
          <Countdown target={config.end_time} label="Ends in" />
        )}
        {competition_state === "ended" && (
          <span className="badge border-rose-700 text-rose-400 text-base">Competition has ended</span>
        )}
      </div>

      <div className="flex justify-center gap-3">
        {user ? (
          <Link to="/challenges" className="btn-primary">Go to challenges</Link>
        ) : (
          <>
            <Link to="/login" className="btn-primary">Log in</Link>
            {config.registration_open && <Link to="/register" className="btn-ghost">Register</Link>}
          </>
        )}
        {config.scoreboard_visible && <Link to="/scoreboard" className="btn-ghost">Scoreboard</Link>}
      </div>

      {config.home_content && (
        <div className="mt-12 text-left">
          <Markdown content={config.home_content} format={config.home_format} />
        </div>
      )}
    </div>
  );
}
