import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../../api";

interface Appeal {
  id: number;
  user_name: string | null;
  team_name: string | null;
  review_case_id: number | null;
  target_type: string;
  email: string | null;
  reason: string;
  status: string;
  admin_notes: string;
  resolution: string | null;
  created_at: number;
  risk_score: number | null;
  case_reason: string | null;
  challenge_id: number | null;
  challenge_name: string | null;
}

export default function AdminAppeals() {
  const [status, setStatus] = useState("open");
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [msg, setMsg] = useState("");
  const { data, refetch } = useQuery({
    queryKey: ["admin-appeals", status],
    queryFn: () => api.get<{ appeals: Appeal[] }>(`/admin/appeals${status ? `?status=${status}` : ""}`),
  });
  const action = async (id: number, act: string) => {
    setMsg("");
    try {
      await api.post(`/admin/appeals/${id}/action`, { action: act, note: notes[id] || "", resolution: act });
      setNotes({ ...notes, [id]: "" });
      setMsg("Appeal updated.");
      refetch();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Action failed");
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-white">Appeals</h1>
        <select className="input w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Open</option>
          <option value="all">All</option>
          <option value="accepted">Accepted</option>
          <option value="rejected">Rejected</option>
          <option value="resolved">Resolved</option>
        </select>
        {msg && <span className="text-sm text-emerald-300">{msg}</span>}
      </div>
      <div className="space-y-3">
        {data?.appeals.map((a) => (
          <section key={a.id} className="card">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-sm text-slate-500 mono">{new Date(a.created_at * 1000).toLocaleString()}</div>
                <h2 className="mt-1 text-base text-white">{a.team_name || a.user_name || a.email || "Unknown account"}</h2>
                <p className="text-xs text-slate-500">
                  {a.target_type}
                  {a.review_case_id ? ` · case #${a.review_case_id}` : ""}
                  {a.challenge_name ? ` · ${a.challenge_name}` : a.challenge_id ? ` · challenge #${a.challenge_id}` : ""}
                  {a.risk_score != null ? ` · risk ${a.risk_score}` : ""}
                </p>
              </div>
              <span className="badge border-slate-700 text-slate-300">{a.status}</span>
            </div>
            {a.case_reason && <p className="mb-2 text-sm text-amber-300">Case{a.challenge_name ? ` (${a.challenge_name})` : ""}: {a.case_reason}</p>}
            <p className="whitespace-pre-wrap text-sm text-slate-300">{a.reason}</p>
            {a.admin_notes && <pre className="mt-3 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-slate-950 p-3 text-xs text-slate-400">{a.admin_notes}</pre>}
            <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <input
                className="input"
                placeholder="Internal note"
                value={notes[a.id] || ""}
                onChange={(e) => setNotes({ ...notes, [a.id]: e.target.value })}
              />
              <div className="flex flex-wrap gap-2">
                <button className="btn-ghost text-xs" onClick={() => action(a.id, "note")}>Note</button>
                <button className="btn-ghost text-xs" onClick={() => action(a.id, "accept")}>Accept</button>
                <button className="btn-ghost text-xs" onClick={() => action(a.id, "resolve")}>Resolve</button>
                <button className="btn-danger text-xs" onClick={() => action(a.id, "reject")}>Reject</button>
              </div>
            </div>
          </section>
        ))}
        {!data?.appeals.length && <div className="card py-8 text-center text-slate-500">No appeals.</div>}
      </div>
    </div>
  );
}
