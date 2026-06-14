import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api";

interface EventRow {
  id: number;
  type: string;
  user_name: string | null;
  challenge_name: string | null;
  ip: string | null;
  country: string | null;
  as_org: string | null;
  is_vpn: number;
  message: string | null;
  created_at: number;
}

const TYPE_COLORS: Record<string, string> = {
  first_blood: "border-rose-700 text-rose-400",
  solve: "border-emerald-700 text-emerald-400",
  "flag.submit": "border-slate-600 text-slate-300",
  "challenge.view": "border-sky-700 text-sky-400",
  "challenge.download": "border-cyan-700 text-cyan-400",
  "page.view": "border-slate-700 text-slate-500",
  "hint.unlock": "border-fuchsia-700 text-fuchsia-400",
  "auth.login": "border-violet-700 text-violet-400",
  "auth.logout": "border-violet-700 text-violet-400",
  "auth.register": "border-violet-700 text-violet-400",
  "vpn.blocked": "border-amber-700 text-amber-400",
};

export default function AdminLogs() {
  const [type, setType] = useState("");
  const [vpn, setVpn] = useState(false);
  const [page, setPage] = useState(0);

  const { data } = useQuery({
    queryKey: ["admin-events", type, vpn, page],
    queryFn: () =>
      api.get<{ events: EventRow[]; types: string[]; page: number }>(
        `/admin/events?page=${page}${type ? `&type=${encodeURIComponent(type)}` : ""}${vpn ? "&vpn=1" : ""}`
      ),
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-white">Event log</h1>
        <select className="input w-48" value={type} onChange={(e) => { setType(e.target.value); setPage(0); }}>
          <option value="">All event types</option>
          {data?.types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={vpn} onChange={(e) => { setVpn(e.target.checked); setPage(0); }} /> VPN/proxy only
        </label>
        <div className="ml-auto flex items-center gap-2">
          <button className="btn-ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>← Prev</button>
          <span className="text-sm text-slate-500">page {page + 1}</span>
          <button className="btn-ghost" disabled={(data?.events.length ?? 0) < 100} onClick={() => setPage(page + 1)}>Next →</button>
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left text-slate-400">
              <th className="px-3 py-3">Time</th>
              <th className="px-3 py-3">Type</th>
              <th className="px-3 py-3">User</th>
              <th className="px-3 py-3">Challenge</th>
              <th className="px-3 py-3">IP</th>
              <th className="px-3 py-3">Network</th>
              <th className="px-3 py-3">Detail</th>
            </tr>
          </thead>
          <tbody>
            {data?.events.map((e) => (
              <tr key={e.id} className="border-b border-slate-900 hover:bg-slate-800/40">
                <td className="px-3 py-2 mono text-xs text-slate-500 whitespace-nowrap">{new Date(e.created_at * 1000).toLocaleString()}</td>
                <td className="px-3 py-2"><span className={`badge ${TYPE_COLORS[e.type] || "border-slate-600 text-slate-300"}`}>{e.type}</span></td>
                <td className="px-3 py-2 text-slate-300">{e.user_name || "—"}</td>
                <td className="px-3 py-2 text-slate-400">{e.challenge_name || "—"}</td>
                <td className="px-3 py-2 mono text-xs text-slate-400">{e.ip || "—"} {e.country ? <span className="text-slate-600">({e.country})</span> : null}</td>
                <td className="px-3 py-2 text-xs text-slate-500 max-w-[180px] truncate">
                  {e.is_vpn ? <span className="badge border-amber-700 text-amber-400 mr-1">VPN?</span> : null}
                  {e.as_org || "—"}
                </td>
                <td className="px-3 py-2 text-xs text-slate-400 max-w-[200px] truncate">{e.message || "—"}</td>
              </tr>
            ))}
            {!data?.events.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No events.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-600">VPN/proxy detection is heuristic, based on the connecting network's AS organization (Cloudflare metadata).</p>
    </div>
  );
}
