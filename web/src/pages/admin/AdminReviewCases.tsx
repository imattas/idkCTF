import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../../api";
import Modal from "../../components/Modal";

interface ReviewCase {
  id: number;
  user_id: number | null;
  team_id: number | null;
  challenge_id: number | null;
  submission_id: number | null;
  risk_score: number;
  status: string;
  reason: string;
  evidence: string;
  admin_notes: string;
  proof_state: string;
  proof_text: string | null;
  proof_attachment_name: string | null;
  proof_attachment_type: string | null;
  proof_attachment_data: string | null;
  resolution: string | null;
  leaderboard_frozen: number;
  prize_disqualified: number;
  suspended: number;
  banned: number;
  created_at: number;
  updated_at: number;
  user_name: string | null;
  team_name: string | null;
  challenge_name: string | null;
}

interface EventRow {
  id: number;
  type: string;
  message: string | null;
  metadata: string | null;
  ip_hash: string | null;
  user_agent_hash: string | null;
  created_at: number;
}

function epoch(local: string): string {
  return local ? String(Math.floor(new Date(local).getTime() / 1000)) : "";
}

function prettyJson(raw: string | null): string {
  if (!raw) return "{}";
  try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; }
}

export default function AdminReviewCases() {
  const [filters, setFilters] = useState({ status: "", min_risk: "", challenge_id: "", user_id: "", team_id: "", from: "", to: "" });
  const [selected, setSelected] = useState<number | null>(null);
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    const v = key === "from" || key === "to" ? epoch(value) : value;
    if (v) query.set(key, v);
  });
  const { data, refetch } = useQuery({
    queryKey: ["admin-review-cases", filters],
    queryFn: () => api.get<{ cases: ReviewCase[] }>(`/admin/review-cases${query.toString() ? `?${query}` : ""}`),
  });
  const set = (key: keyof typeof filters, value: string) => setFilters({ ...filters, [key]: value });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-white">Anti-slop review</h1>
        <select className="input w-40" value={filters.status} onChange={(e) => set("status", e.target.value)}>
          <option value="">Open only</option>
          <option value="all">All</option>
          <option value="monitor">Monitor</option>
          <option value="open">Open</option>
          <option value="proof_required">Proof required</option>
          <option value="high_risk">High risk</option>
          <option value="clean">Clean</option>
          <option value="resolved">Resolved</option>
        </select>
        <input className="input w-24" placeholder="Risk >=" value={filters.min_risk} onChange={(e) => set("min_risk", e.target.value)} />
        <input className="input w-28" placeholder="Challenge" value={filters.challenge_id} onChange={(e) => set("challenge_id", e.target.value)} />
        <input className="input w-24" placeholder="User" value={filters.user_id} onChange={(e) => set("user_id", e.target.value)} />
        <input className="input w-24" placeholder="Team" value={filters.team_id} onChange={(e) => set("team_id", e.target.value)} />
        <input className="input w-48" type="datetime-local" value={filters.from} onChange={(e) => set("from", e.target.value)} />
        <input className="input w-48" type="datetime-local" value={filters.to} onChange={(e) => set("to", e.target.value)} />
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left text-slate-400">
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Risk</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Account</th>
              <th className="px-4 py-3">Challenge</th>
              <th className="px-4 py-3">Reason</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {data?.cases.map((c) => (
              <tr key={c.id} className="border-b border-slate-900 hover:bg-slate-800/40">
                <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500 mono">{new Date(c.created_at * 1000).toLocaleString()}</td>
                <td className="px-4 py-3"><span className={`badge ${c.risk_score >= 80 ? "border-rose-700 text-rose-300" : c.risk_score >= 65 ? "border-amber-700 text-amber-300" : "border-slate-700 text-slate-300"}`}>{c.risk_score}</span></td>
                <td className="px-4 py-3"><span className="badge border-slate-700 text-slate-300">{c.status}</span></td>
                <td className="px-4 py-3 text-slate-300">{c.team_name || c.user_name || "—"}</td>
                <td className="px-4 py-3 text-slate-400">{c.challenge_name || "—"}</td>
                <td className="max-w-sm truncate px-4 py-3 text-slate-400">{c.reason}</td>
                <td className="px-4 py-3 text-right"><button className="btn-ghost text-xs" onClick={() => setSelected(c.id)}>Open</button></td>
              </tr>
            ))}
            {!data?.cases.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No review cases.</td></tr>}
          </tbody>
        </table>
      </div>

      {selected != null && <CaseModal id={selected} onClose={() => setSelected(null)} onChanged={refetch} />}
    </div>
  );
}

function CaseModal({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const detail = useQuery({
    queryKey: ["admin-review-case", id],
    queryFn: () => api.get<{ case: ReviewCase; events: EventRow[]; submissions: any[]; appeals: any[] }>(`/admin/review-cases/${id}`),
  });
  const row = detail.data?.case;
  const act = async (action: string, resolution?: string) => {
    setMsg("");
    try {
      await api.post(`/admin/review-cases/${id}/action`, { action, note, resolution });
      setNote("");
      setMsg("Action logged.");
      await detail.refetch();
      onChanged();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Action failed");
    }
  };
  const downloadProof = () => {
    if (!row?.proof_attachment_data) return;
    const a = document.createElement("a");
    a.href = `data:${row.proof_attachment_type || "application/octet-stream"};base64,${row.proof_attachment_data}`;
    a.download = row.proof_attachment_name || "proof";
    a.click();
  };

  return (
    <Modal open onClose={onClose} wide title={row ? `Review case #${row.id}` : "Review case"}>
      {!row ? <p className="text-slate-500">Loading...</p> : (
        <div className="space-y-5">
          {msg && <div className="rounded-md border border-slate-700 bg-slate-900 p-2 text-sm text-slate-300">{msg}</div>}
          <div className="grid gap-3 md:grid-cols-4">
            <div><div className="label">Risk</div><div className="mono text-xl text-amber-300">{row.risk_score}</div></div>
            <div><div className="label">Status</div><span className="badge border-slate-700 text-slate-300">{row.status}</span></div>
            <div><div className="label">Proof</div><span className="badge border-slate-700 text-slate-300">{row.proof_state}</span></div>
            <div><div className="label">Account</div><div className="text-slate-300">{row.team_name || row.user_name || "—"}</div></div>
          </div>

          <section className="rounded-md border border-slate-800 p-3">
            <h3 className="mb-2 font-semibold text-white">Evidence</h3>
            <p className="mb-2 text-sm text-slate-300">{row.reason}</p>
            <pre className="max-h-56 overflow-auto rounded bg-slate-950 p-3 text-xs text-slate-300">{prettyJson(row.evidence)}</pre>
          </section>

          {(row.proof_text || row.proof_attachment_name) && (
            <section className="rounded-md border border-slate-800 p-3">
              <h3 className="mb-2 font-semibold text-white">Submitted proof</h3>
              {row.proof_text && <pre className="mb-2 whitespace-pre-wrap rounded bg-slate-950 p-3 text-sm text-slate-300">{row.proof_text}</pre>}
              {row.proof_attachment_name && <button className="btn-ghost text-xs" onClick={downloadProof}>Download {row.proof_attachment_name}</button>}
            </section>
          )}

          <section className="rounded-md border border-slate-800 p-3">
            <h3 className="mb-2 font-semibold text-white">Related events</h3>
            <div className="max-h-56 overflow-y-auto">
              {(detail.data?.events ?? []).map((e) => (
                <div key={e.id} className="border-b border-slate-900 py-2 text-xs">
                  <span className="mono text-slate-500">{new Date(e.created_at * 1000).toLocaleString()}</span>
                  <span className="ml-2 badge border-slate-700 text-slate-300">{e.type}</span>
                  <span className="ml-2 text-slate-300">{e.message || ""}</span>
                  <span className="ml-2 text-slate-600">ip {e.ip_hash?.slice(0, 10) || "—"} ua {e.user_agent_hash?.slice(0, 10) || "—"}</span>
                </div>
              ))}
              {!detail.data?.events.length && <p className="text-sm text-slate-500">No related events.</p>}
            </div>
          </section>

          <section className="rounded-md border border-slate-800 p-3">
            <h3 className="mb-2 font-semibold text-white">Admin note</h3>
            <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal note for the audit trail" />
            {row.admin_notes && <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-slate-950 p-3 text-xs text-slate-400">{row.admin_notes}</pre>}
          </section>

          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost text-xs" onClick={() => act("note")}>Add note</button>
            <button className="btn-ghost text-xs" onClick={() => act("mark_clean", "Marked clean")}>Mark clean</button>
            <button className="btn-ghost text-xs" onClick={() => act("request_proof")}>Request proof</button>
            <button className="btn-ghost text-xs" onClick={() => act("freeze_leaderboard")}>Freeze leaderboard</button>
            <button className="btn-ghost text-xs" onClick={() => act("accept_proof", "Proof accepted")}>Accept proof</button>
            <button className="btn-ghost text-xs" onClick={() => act("reject_proof", "Proof rejected")}>Reject proof</button>
            <button className="btn-ghost text-xs" onClick={() => act("remove_solve", "Solve removed")}>Remove solve</button>
            <button className="btn-ghost text-xs" onClick={() => act("disqualify_prizes", "Prize disqualification")}>Prize DQ</button>
            <button className="btn-ghost text-xs" onClick={() => act("suspend", "Suspended")}>Suspend</button>
            <button className="btn-danger text-xs" onClick={() => confirm("Manual ban this account/team?") && act("ban", "Banned by admin")}>Ban</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
