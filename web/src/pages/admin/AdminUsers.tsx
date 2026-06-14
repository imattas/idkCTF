import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../../api";
import { useStore } from "../../store";
import Modal from "../../components/Modal";
import { COUNTRIES } from "../../countries";

interface AdminUser {
  id: number; name: string; email: string; role: string;
  team_name: string | null; hidden: number; banned: number; verified: number;
}

export default function AdminUsers() {
  const { user: me } = useStore();
  const { data, refetch } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api.get<{ users: AdminUser[] }>("/admin/users"),
  });
  const [manageId, setManageId] = useState<number | null>(null);

  const remove = async (id: number) => {
    if (!confirm("Delete this user?")) return;
    await api.del(`/admin/users/${id}`); refetch();
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-white">Users</h1>
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left text-slate-400">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Team</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {data?.users.map((u) => (
              <tr key={u.id} className="border-b border-slate-900 hover:bg-slate-800/40">
                <td className="px-4 py-3 font-medium text-white">{u.name}</td>
                <td className="px-4 py-3 text-slate-400">{u.email}</td>
                <td className="px-4 py-3 text-slate-400">{u.team_name || "—"}</td>
                <td className="px-4 py-3">{u.role === "admin" ? <span className="badge border-sky-700 text-accent">admin</span> : "user"}</td>
                <td className="px-4 py-3 space-x-1">
                  {!u.verified ? <span className="badge border-amber-700 text-amber-400">unverified</span> : null}
                  {u.hidden ? <span className="badge border-slate-600 text-slate-400">hidden</span> : null}
                  {u.banned ? <span className="badge border-rose-700 text-rose-400">banned</span> : null}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button className="btn-ghost text-xs mr-1" onClick={() => setManageId(u.id)}>Manage</button>
                  {u.id !== me!.id && <button className="btn-danger text-xs" onClick={() => remove(u.id)}>Del</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {manageId != null && <UserModal id={manageId} self={manageId === me!.id} onClose={() => setManageId(null)} onSaved={refetch} />}
    </div>
  );
}

function UserModal({ id, self, onClose, onSaved }: { id: number; self: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<any>(null);
  const [pw, setPw] = useState("");
  const [grant, setGrant] = useState("");
  const [msg, setMsg] = useState("");

  const detail = useQuery({
    queryKey: ["admin-user", id],
    queryFn: async () => { const r = await api.get<any>(`/admin/users/${id}`); setForm(r.user); return r; },
  });
  const brackets = useQuery({ queryKey: ["admin-brackets"], queryFn: () => api.get<any>("/admin/brackets") });
  const challenges = useQuery({ queryKey: ["admin-challenges"], queryFn: () => api.get<any>("/admin/challenges") });

  if (!form) return <Modal open onClose={onClose} title="User"><p className="text-slate-500">Loading…</p></Modal>;
  const set = (k: string, v: any) => setForm({ ...form, [k]: v });

  const save = async () => {
    setMsg("");
    try {
      const payload: any = {
        name: form.name, email: form.email, affiliation: form.affiliation, country: form.country, website: form.website,
        role: self ? undefined : form.role, hidden: form.hidden ? 1 : 0,
        banned: self ? undefined : (form.banned ? 1 : 0), verified: form.verified ? 1 : 0,
        bracket_id: form.bracket_id || null,
      };
      if (pw) payload.password = pw;
      await api.patch(`/admin/users/${id}`, payload);
      setMsg("Saved."); setPw(""); onSaved(); detail.refetch();
    } catch (e) { setMsg(e instanceof ApiError ? e.message : "Error"); }
  };
  const kickTeam = async () => { await api.patch(`/admin/users/${id}`, { team_id: null, is_captain: 0 }); detail.refetch(); onSaved(); };
  const removeSolve = async (sid: number) => { await api.del(`/admin/solves/${sid}`); detail.refetch(); };
  const addSolve = async () => { if (!grant) return; await api.post(`/admin/users/${id}/grant-solve`, { challenge_id: Number(grant) }); setGrant(""); detail.refetch(); };

  const solvedIds = new Set((detail.data?.solves || []).map((s: any) => s.challenge_id));

  return (
    <Modal open onClose={onClose} wide title={`Manage: ${form.name}`}>
      <div className="space-y-5">
        {msg && <div className="rounded-md border border-slate-700 bg-slate-900 p-2 text-sm text-slate-300">{msg}</div>}

        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Name</label><input className="input" value={form.name || ""} onChange={(e) => set("name", e.target.value)} /></div>
          <div><label className="label">Email</label><input className="input" value={form.email || ""} onChange={(e) => set("email", e.target.value)} /></div>
          <div><label className="label">Affiliation</label><input className="input" value={form.affiliation || ""} onChange={(e) => set("affiliation", e.target.value)} /></div>
          <div>
            <label className="label">Country</label>
            <select className="input" value={form.country || ""} onChange={(e) => set("country", e.target.value)}>
              <option value="">—</option>{COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div><label className="label">Website</label><input className="input" value={form.website || ""} onChange={(e) => set("website", e.target.value)} /></div>
          <div>
            <label className="label">Bracket</label>
            <select className="input" value={form.bracket_id || ""} onChange={(e) => set("bracket_id", e.target.value ? Number(e.target.value) : null)}>
              <option value="">—</option>
              {(brackets.data?.brackets || []).filter((b: any) => b.type === "users").map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label className="label">Role</label>
            <select className="input w-32" value={form.role} disabled={self} onChange={(e) => set("role", e.target.value)}>
              <option value="user">user</option><option value="admin">admin</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-300 mt-5"><input type="checkbox" checked={!!form.verified} onChange={(e) => set("verified", e.target.checked)} /> Verified</label>
          <label className="flex items-center gap-2 text-sm text-slate-300 mt-5"><input type="checkbox" checked={!!form.hidden} onChange={(e) => set("hidden", e.target.checked)} /> Hidden</label>
          <label className="flex items-center gap-2 text-sm text-slate-300 mt-5"><input type="checkbox" disabled={self} checked={!!form.banned} onChange={(e) => set("banned", e.target.checked)} /> Banned</label>
        </div>

        <div className="flex items-end gap-3">
          <div className="flex-1"><label className="label">Reset password</label><input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="leave blank to keep" /></div>
          <div>
            <label className="label">Team</label>
            <div className="flex items-center gap-2 text-sm text-slate-300">
              {form.team_name ? <>{form.team_name} <button className="btn-ghost text-xs" onClick={kickTeam}>Remove</button></> : <span className="text-slate-500">no team</span>}
            </div>
          </div>
        </div>

        <button className="btn-primary" onClick={save}>Save changes</button>

        <div className="border-t border-slate-800 pt-4">
          <h4 className="mb-2 font-semibold text-white">Solves ({detail.data?.solves?.length || 0})</h4>
          <div className="mb-3 space-y-1">
            {(detail.data?.solves || []).map((s: any) => (
              <div key={s.id} className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-900/60 px-3 py-1.5 text-sm">
                <span className="text-slate-300">{s.name} <span className="text-slate-500">({s.value} pts · {new Date(s.created_at * 1000).toLocaleString()})</span></span>
                <button className="text-rose-400 hover:text-rose-300" onClick={() => removeSolve(s.id)}>remove</button>
              </div>
            ))}
            {!(detail.data?.solves || []).length && <p className="text-xs text-slate-500">No solves.</p>}
          </div>
          <div className="flex gap-2">
            <select className="input" value={grant} onChange={(e) => setGrant(e.target.value)}>
              <option value="">— grant a solve —</option>
              {(challenges.data?.challenges || []).filter((ch: any) => !solvedIds.has(ch.id)).map((ch: any) => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
            </select>
            <button className="btn-ghost" onClick={addSolve} disabled={!grant}>Grant solve</button>
          </div>
        </div>

        {!!(detail.data?.awards || []).length && (
          <div className="border-t border-slate-800 pt-4">
            <h4 className="mb-2 font-semibold text-white">Awards</h4>
            {(detail.data.awards).map((a: any) => (
              <div key={a.id} className="text-sm text-slate-400">{a.name}: {a.value} pts</div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
