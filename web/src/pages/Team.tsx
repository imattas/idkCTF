import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import { useStore } from "../store";
import { StatsChartGrid } from "../components/StatsCharts";
import type { Bracket, ProfileStats } from "../types";

interface TeamInfo {
  team: { id: number; name: string; invite_code?: string; affiliation?: string; country?: string } | null;
  members?: { id: number; name: string; is_captain: number }[];
  is_captain?: boolean;
}

export default function Team() {
  const { refresh } = useStore();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["my-team"],
    queryFn: () => api.get<TeamInfo>("/teams/me"),
  });
  const teamId = data?.team?.id ?? null;
  const stats = useQuery({
    queryKey: ["profile-stats", "team", teamId],
    enabled: !!teamId,
    queryFn: () => api.get<{ stats: ProfileStats }>(`/profile/team/${teamId}`),
  });
  const [createName, setCreateName] = useState("");
  const [bracketId, setBracketId] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const { data: brk } = useQuery({ queryKey: ["brackets"], queryFn: () => api.get<{ brackets: Bracket[] }>("/brackets") });
  const teamBrackets = (brk?.brackets ?? []).filter((b) => b.type === "teams");

  const create = async () => {
    setErr("");
    if (teamBrackets.length > 1 && !bracketId) {
      setErr("Choose a division before creating your team.");
      return;
    }
    try {
      await api.post("/teams/create", { name: createName, bracket_id: bracketId ? Number(bracketId) : null });
      await refresh();
      await refetch();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Error");
    }
  };

  const join = async () => {
    setErr("");
    try {
      await api.post("/teams/join", { invite_code: code.trim() });
      await refresh();
      await refetch();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Error");
    }
  };

  const leave = async () => {
    setErr("");
    try {
      await api.post("/teams/leave");
      await refresh();
      await refetch();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Error");
    } finally {
      setConfirmLeave(false);
    }
  };

  const rotate = async () => {
    await api.post("/teams/rotate-code");
    setCopied(false);
    await refetch();
  };

  const copyInvite = async (invite: string) => {
    await navigator.clipboard.writeText(invite);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  if (isLoading) return <p className="text-slate-500">Loading...</p>;

  if (!data?.team) {
    return (
      <div className="mx-auto max-w-3xl page-stack">
        <section className="page-header">
          <div>
            <div className="page-kicker">Team</div>
            <h1 className="page-title">Join the board</h1>
            <p className="page-subtitle">Create a new team or join an existing team with an invite code.</p>
          </div>
        </section>

        {err && <div className="rounded-md border border-rose-700 bg-rose-950/40 p-3 text-sm text-rose-300">{err}</div>}

        <div className="grid gap-4 md:grid-cols-2">
          <section className="card space-y-3">
            <h2 className="text-base">Create a team</h2>
            <input className="input" placeholder="Team name" value={createName} onChange={(e) => setCreateName(e.target.value)} />
            {teamBrackets.length > 0 && (
              <select className="input" value={bracketId} onChange={(e) => setBracketId(e.target.value)}>
                <option value="">{teamBrackets.length > 1 ? "Select a division" : "No division"}</option>
                {teamBrackets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}
            <button className="btn-primary w-full" onClick={create} disabled={!createName.trim()}>Create team</button>
          </section>

          <section className="card space-y-3">
            <h2 className="text-base">Join a team</h2>
            <input className="input mono uppercase" placeholder="Invite code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
            <button className="btn-ghost w-full" onClick={join} disabled={!code.trim()}>Join team</button>
          </section>
        </div>
      </div>
    );
  }

  const t = data.team;

  return (
    <div className="mx-auto max-w-3xl page-stack">
      <section className="page-header">
        <div>
          <div className="page-kicker">Team</div>
          <h1 className="page-title">{t.name}</h1>
          <p className="page-subtitle">{data.members?.length ?? 0} member{(data.members?.length ?? 0) === 1 ? "" : "s"}</p>
        </div>
        {confirmLeave ? (
          <div className="flex flex-wrap gap-2">
            <button className="btn-danger" onClick={leave}>Confirm leave</button>
            <button className="btn-ghost" onClick={() => setConfirmLeave(false)}>Cancel</button>
          </div>
        ) : (
          <button className="btn-danger" onClick={() => setConfirmLeave(true)}>Leave team</button>
        )}
      </section>

      {err && <div className="rounded-md border border-rose-700 bg-rose-950/40 p-3 text-sm text-rose-300">{err}</div>}

      {stats.data?.stats && <StatsChartGrid stats={stats.data.stats} />}

      {data.is_captain && t.invite_code && (
        <section className="card">
          <div className="label">Invite code</div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <code className="mono flex-1 break-all text-lg text-[var(--accent-strong)]">{t.invite_code}</code>
            <div className="flex gap-2">
              <button className="btn-ghost px-3 text-xs" onClick={() => copyInvite(t.invite_code!)}>{copied ? "Copied" : "Copy"}</button>
              <button className="btn-ghost px-3 text-xs" onClick={rotate}>Rotate</button>
            </div>
          </div>
        </section>
      )}

      <section className="card">
        <div className="label">Members</div>
        <ul className="divide-y divide-[var(--border)]">
          {data.members?.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 py-3">
              <span className="text-slate-200">{m.name}</span>
              {m.is_captain ? <span className="badge badge-accent">Captain</span> : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
