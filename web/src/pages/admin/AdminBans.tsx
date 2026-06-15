import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api";

interface Ban { id: number; type: string; value: string; match: string; reason: string | null; created_at: number; }

export default function AdminBans() {
  const { data, refetch } = useQuery({ queryKey: ["admin-bans"], queryFn: () => api.get<{ bans: Ban[] }>("/admin/bans") });
  const [form, setForm] = useState({ type: "ip", value: "", match: "exact", reason: "" });

  const add = async () => {
    if (!form.value.trim()) return;
    await api.post("/admin/bans", form);
    setForm({ type: "ip", value: "", match: "exact", reason: "" });
    refetch();
  };
  const remove = async (id: number) => { await api.del(`/admin/bans/${id}`); refetch(); };

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-white">Bans</h1>
      <p className="mb-6 text-sm text-slate-400">Block sign-ups & logins by IP, or block usernames (exact or containing a string). VPN/proxy sign-up blocking is in Settings.</p>

      <div className="card mb-6 space-y-3">
        <h2 className="font-semibold text-white">Add ban</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">Type</label>
            <select className="input w-32" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="ip">IP address</option>
              <option value="username">Username</option>
            </select>
          </div>
          {form.type === "username" && (
            <div>
              <label className="label">Match</label>
              <select className="input w-32" value={form.match} onChange={(e) => setForm({ ...form, match: e.target.value })}>
                <option value="exact">Exact</option>
                <option value="contains">Contains</option>
              </select>
            </div>
          )}
          <div className="flex-1 min-w-[200px]">
            <label className="label">{form.type === "ip" ? "IP address" : "Username / substring"}</label>
            <input className="input mono" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder={form.type === "ip" ? "203.0.113.5" : "badword"} />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="label">Reason (optional)</label>
            <input className="input" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </div>
          <button className="btn-primary" onClick={add}>Add ban</button>
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left text-slate-400">
              <th className="px-4 py-3">Type</th><th className="px-4 py-3">Value</th><th className="px-4 py-3">Match</th><th className="px-4 py-3">Reason</th><th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {data?.bans.map((b) => (
              <tr key={b.id} className="border-b border-slate-900">
                <td className="px-4 py-3"><span className="badge border-slate-700 text-slate-300">{b.type}</span></td>
                <td className="px-4 py-3 mono text-slate-200">{b.value}</td>
                <td className="px-4 py-3 text-slate-400">{b.type === "username" ? b.match : "—"}</td>
                <td className="px-4 py-3 text-slate-400">{b.reason || "—"}</td>
                <td className="px-4 py-3 text-right"><button className="btn-danger text-xs" onClick={() => remove(b.id)}>Remove</button></td>
              </tr>
            ))}
            {!data?.bans.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No bans.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
