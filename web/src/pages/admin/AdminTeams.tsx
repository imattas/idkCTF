import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../../api";
import Modal from "../../components/Modal";
import { COUNTRIES } from "../../countries";

interface AdminTeam {
  id: number; name: string; members: number; hidden: number; banned: number; invite_code: string;
}

export default function AdminTeams() {
  const { data, refetch } = useQuery({
    queryKey: ["admin-teams"],
    queryFn: () => api.get<{ teams: AdminTeam[] }>("/admin/teams"),
  });
  const [manageId, setManageId] = useState<number | null>(null);

  const remove = async (id: number) => {
    if (!confirm("Delete this team? Members will be unassigned.")) return;
    await api.del(`/admin/teams/${id}`); refetch();
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-white">Teams</h1>
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left text-slate-400">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Members</th>
              <th className="px-4 py-3">Invite</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {data?.teams.map((t) => (
              <tr key={t.id} className="border-b border-slate-900 hover:bg-slate-800/40">
                <td className="px-4 py-3 font-medium text-white">{t.name}</td>
                <td className="px-4 py-3 text-slate-400">{t.members}</td>
                <td className="px-4 py-3 mono text-xs text-slate-500">{t.invite_code}</td>
                <td className="px-4 py-3 space-x-1">
                  {t.hidden ? <span className="badge border-slate-600 text-slate-400">hidden</span> : null}
                  {t.banned ? <span className="badge border-rose-700 text-rose-400">banned</span> : null}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button className="btn-ghost text-xs mr-1" onClick={() => setManageId(t.id)}>Manage</button>
                  <button className="btn-danger text-xs" onClick={() => remove(t.id)}>Del</button>
                </td>
              </tr>
            ))}
            {!data?.teams.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No teams.</td></tr>}
          </tbody>
        </table>
      </div>
      {manageId != null && <TeamModal id={manageId} onClose={() => setManageId(null)} onSaved={refetch} />}
    </div>
  );
}

function TeamModal({ id, onClose, onSaved }: { id: number; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<any>(null);
  const [msg, setMsg] = useState("");

  const detail = useQuery({
    queryKey: ["admin-team", id],
    queryFn: async () => { const r = await api.get<any>(`/admin/teams/${id}`); setForm(r.team); return r; },
  });
  const brackets = useQuery({ queryKey: ["admin-brackets"], queryFn: () => api.get<any>("/admin/brackets") });

  if (!form) return <Modal open onClose={onClose} title="Team"><p className="text-slate-500">Loading…</p></Modal>;
  const set = (k: string, v: any) => setForm({ ...form, [k]: v });

  const save = async () => {
    setMsg("");
    try {
      await api.patch(`/admin/teams/${id}`, {
        name: form.name, affiliation: form.affiliation, country: form.country, website: form.website,
        hidden: form.hidden ? 1 : 0, banned: form.banned ? 1 : 0, bracket_id: form.bracket_id || null,
      });
      setMsg("Saved."); onSaved(); detail.refetch();
    } catch (e) { setMsg(e instanceof ApiError ? e.message : "Error"); }
  };
  const kick = async (uid: number) => { await api.post(`/admin/teams/${id}/kick`, { user_id: uid }); detail.refetch(); onSaved(); };
  const makeCaptain = async (uid: number) => { await api.post(`/admin/teams/${id}/captain`, { user_id: uid }); detail.refetch(); };
  const removeSolve = async (sid: number) => { await api.del(`/admin/solves/${sid}`); detail.refetch(); };

  return (
    <Modal open onClose={onClose} wide title={`Manage team: ${form.name}`}>
      <div className="space-y-5">
        {msg && <div className="rounded-md border border-slate-700 bg-slate-900 p-2 text-sm text-slate-300">{msg}</div>}

        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Name</label><input className="input" value={form.name || ""} onChange={(e) => set("name", e.target.value)} /></div>
          <div><label className="label">Affiliation</label><input className="input" value={form.affiliation || ""} onChange={(e) => set("affiliation", e.target.value)} /></div>
          <div>
            <label className="label">Country</label>
            <select className="input" value={form.country || ""} onChange={(e) => set("country", e.target.value)}>
              <option value="">—</option>{COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Bracket</label>
            <select className="input" value={form.bracket_id || ""} onChange={(e) => set("bracket_id", e.target.value ? Number(e.target.value) : null)}>
              <option value="">—</option>
              {(brackets.data?.brackets || []).filter((b: any) => b.type === "teams").map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={!!form.hidden} onChange={(e) => set("hidden", e.target.checked)} /> Hidden</label>
          <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={!!form.banned} onChange={(e) => set("banned", e.target.checked)} /> Banned</label>
          <span className="text-sm text-slate-500">Invite: <code className="mono">{form.invite_code}</code></span>
        </div>
        <button className="btn-primary" onClick={save}>Save changes</button>

        <div className="border-t border-slate-800 pt-4">
          <h4 className="mb-2 font-semibold text-white">Members</h4>
          <div className="space-y-1">
            {(detail.data?.members || []).map((m: any) => (
              <div key={m.id} className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-900/60 px-3 py-1.5 text-sm">
                <span className="text-slate-300">{m.name} {m.is_captain ? <span className="badge border-sky-700 text-accent">captain</span> : null} {m.banned ? <span className="badge border-rose-700 text-rose-400">banned</span> : null}</span>
                <span className="flex gap-2">
                  {!m.is_captain && <button className="btn-ghost text-xs" onClick={() => makeCaptain(m.id)}>Make captain</button>}
                  <button className="text-rose-400 hover:text-rose-300 text-xs" onClick={() => kick(m.id)}>kick</button>
                </span>
              </div>
            ))}
            {!(detail.data?.members || []).length && <p className="text-xs text-slate-500">No members.</p>}
          </div>
        </div>

        <div className="border-t border-slate-800 pt-4">
          <h4 className="mb-2 font-semibold text-white">Solves ({detail.data?.solves?.length || 0})</h4>
          <div className="space-y-1">
            {(detail.data?.solves || []).map((s: any) => (
              <div key={s.id} className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-900/60 px-3 py-1.5 text-sm">
                <span className="text-slate-300">{s.name} <span className="text-slate-500">({s.value} pts · by {s.solver || "?"} · {new Date(s.created_at * 1000).toLocaleString()})</span></span>
                <button className="text-rose-400 hover:text-rose-300" onClick={() => removeSolve(s.id)}>remove</button>
              </div>
            ))}
            {!(detail.data?.solves || []).length && <p className="text-xs text-slate-500">No solves.</p>}
          </div>
        </div>
      </div>
    </Modal>
  );
}
