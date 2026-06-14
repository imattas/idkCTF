import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api";

interface Bracket {
  id: number; name: string; description: string | null; type: string; users: number; teams: number;
}

export default function AdminBrackets() {
  const { data, refetch } = useQuery({
    queryKey: ["admin-brackets"],
    queryFn: () => api.get<{ brackets: Bracket[] }>("/admin/brackets"),
  });
  const [form, setForm] = useState({ name: "", description: "", type: "users" });

  const create = async () => {
    if (!form.name) return;
    await api.post("/admin/brackets", form);
    setForm({ name: "", description: "", type: "users" });
    refetch();
  };
  const remove = async (id: number) => {
    if (!confirm("Delete this bracket? Members will be unassigned.")) return;
    await api.del(`/admin/brackets/${id}`); refetch();
  };

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-white">Brackets / Divisions</h1>
      <p className="mb-6 text-sm text-slate-400">Group competitors into separate leaderboards (e.g. High School, University, Open). The scoreboard gets a tab per bracket.</p>

      <div className="card mb-6 space-y-3">
        <h2 className="font-semibold text-white">New bracket</h2>
        <div className="grid grid-cols-3 gap-3">
          <input className="input" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="input" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="users">Users</option>
            <option value="teams">Teams</option>
          </select>
        </div>
        <button className="btn-primary" onClick={create}>Add bracket</button>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left text-slate-400">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Members</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {data?.brackets.map((b) => (
              <tr key={b.id} className="border-b border-slate-900">
                <td className="px-4 py-3 font-medium text-white">{b.name}</td>
                <td className="px-4 py-3"><span className="badge border-slate-700 text-slate-300">{b.type}</span></td>
                <td className="px-4 py-3 text-slate-400">{b.description || "—"}</td>
                <td className="px-4 py-3 text-slate-400">{b.type === "teams" ? `${b.teams} teams` : `${b.users} users`}</td>
                <td className="px-4 py-3 text-right"><button className="btn-danger text-xs" onClick={() => remove(b.id)}>Delete</button></td>
              </tr>
            ))}
            {!data?.brackets.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No brackets yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
