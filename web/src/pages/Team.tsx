import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import { useStore } from "../store";
import type { Bracket } from "../types";

interface TeamInfo {
  team: { id: number; name: string; invite_code?: string; affiliation?: string; country?: string } | null;
  members?: { id: number; name: string; is_captain: number }[];
  is_captain?: boolean;
}

export default function Team() {
  const { refresh } = useStore();
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["my-team"],
    queryFn: () => api.get<TeamInfo>("/teams/me"),
  });
  const [createName, setCreateName] = useState("");
  const [bracketId, setBracketId] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");

  const { data: brk } = useQuery({ queryKey: ["brackets"], queryFn: () => api.get<{ brackets: Bracket[] }>("/brackets") });
  const teamBrackets = (brk?.brackets ?? []).filter((b) => b.type === "teams");

  const create = async () => {
    setErr("");
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
      await api.post("/teams/join", { invite_code: code });
      await refresh();
      await refetch();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Error");
    }
  };
  const leave = async () => {
    if (!confirm("Leave your team?")) return;
    setErr("");
    try {
      await api.post("/teams/leave");
      await refresh();
      await refetch();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Error");
    }
  };
  const rotate = async () => {
    await api.post("/teams/rotate-code");
    await refetch();
  };

  if (isLoading) return <p className="text-slate-500">Loading…</p>;

  if (!data?.team) {
    return (
      <div className="mx-auto max-w-md space-y-6">
        <h1 className="text-2xl font-bold text-white">Team</h1>
        {err && <div className="rounded-md border border-rose-700 bg-rose-950/50 p-3 text-sm text-rose-300">{err}</div>}
        <div className="card space-y-3">
          <h2 className="font-semibold text-white">Create a team</h2>
          <input className="input" placeholder="Team name" value={createName} onChange={(e) => setCreateName(e.target.value)} />
          {teamBrackets.length > 0 && (
            <select className="input" value={bracketId} onChange={(e) => setBracketId(e.target.value)}>
              <option value="">— division: none —</option>
              {teamBrackets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          <button className="btn-primary w-full" onClick={create} disabled={!createName.trim()}>Create</button>
        </div>
        <div className="card space-y-3">
          <h2 className="font-semibold text-white">Join a team</h2>
          <input className="input mono uppercase" placeholder="INVITE CODE" value={code} onChange={(e) => setCode(e.target.value)} />
          <button className="btn-ghost w-full" onClick={join} disabled={!code.trim()}>Join</button>
        </div>
      </div>
    );
  }

  const t = data.team;
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">{t.name}</h1>
        <button className="btn-danger" onClick={leave}>Leave team</button>
      </div>
      {err && <div className="rounded-md border border-rose-700 bg-rose-950/50 p-3 text-sm text-rose-300">{err}</div>}

      {data.is_captain && t.invite_code && (
        <div className="card">
          <div className="label">Invite code (captain only)</div>
          <div className="flex items-center gap-3">
            <code className="mono text-lg text-sky-400">{t.invite_code}</code>
            <button className="btn-ghost text-xs" onClick={() => navigator.clipboard.writeText(t.invite_code!)}>Copy</button>
            <button className="btn-ghost text-xs" onClick={rotate}>Rotate</button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="label">Members ({data.members?.length})</div>
        <ul className="divide-y divide-slate-800">
          {data.members?.map((m) => (
            <li key={m.id} className="flex items-center justify-between py-2">
              <span className="text-slate-200">{m.name}</span>
              {m.is_captain ? <span className="badge border-sky-700 text-sky-400">Captain</span> : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
