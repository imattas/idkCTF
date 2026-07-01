import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../../api";

interface AdminStats {
  users: number;
  teams: number;
  challenges: number;
  solves: number;
  submissions: number;
  correct: number;
  open_cases: number;
  high_risk_cases: number;
  open_appeals: number;
  honeypot_hits: number;
  traffic: { bucket: number; events: number; opens: number; submissions: number; downloads: number }[];
  active_accounts: { name: string; submissions: number; correct: number }[];
  review_by_status: { status: string; n: number }[];
}

export default function Dashboard() {
  const { data } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => api.get<AdminStats>("/admin/stats"),
  });

  const cards = [
    ["Users", data?.users],
    ["Teams", data?.teams],
    ["Challenges", data?.challenges],
    ["Solves", data?.solves],
    ["Submissions", data?.submissions],
    ["Correct", data?.correct],
    ["Open cases", data?.open_cases],
    ["High risk", data?.high_risk_cases],
    ["Appeals", data?.open_appeals],
    ["Honeypot", data?.honeypot_hits],
  ] as const;
  const traffic = (data?.traffic ?? []).map((row) => ({
    ...row,
    label: new Date(row.bucket * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  }));

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-white">Dashboard</h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {cards.map(([label, val]) => (
          <div key={label} className="card">
            <div className="text-sm text-slate-400">{label}</div>
            <div className="mono text-3xl font-bold text-sky-400">{val ?? "—"}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="card h-80">
          <div className="mb-4">
            <h2 className="font-semibold text-white">Traffic and gameplay</h2>
            <p className="text-xs text-slate-500">Last 24 hours from anti-abuse event logs.</p>
          </div>
          <ResponsiveContainer width="100%" height="82%">
            <LineChart data={traffic} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272f" />
              <XAxis dataKey="label" stroke="#8a8a95" fontSize={11} />
              <YAxis stroke="#8a8a95" fontSize={11} />
              <Tooltip contentStyle={{ background: "#111116", border: "1px solid #32323d", borderRadius: 8, color: "#ededf1" }} />
              <Line type="monotone" dataKey="opens" stroke="#60a5fa" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="submissions" stroke="#cf2336" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="downloads" stroke="#34d399" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </section>

        <section className="card h-80">
          <div className="mb-4">
            <h2 className="font-semibold text-white">Most active accounts</h2>
            <p className="text-xs text-slate-500">Submission volume over the last 24 hours.</p>
          </div>
          <ResponsiveContainer width="100%" height="82%">
            <BarChart data={data?.active_accounts ?? []} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272f" />
              <XAxis dataKey="name" stroke="#8a8a95" fontSize={11} interval={0} tick={{ width: 90 }} />
              <YAxis stroke="#8a8a95" fontSize={11} />
              <Tooltip contentStyle={{ background: "#111116", border: "1px solid #32323d", borderRadius: 8, color: "#ededf1" }} />
              <Bar dataKey="submissions" fill="#d8ab44" />
              <Bar dataKey="correct" fill="#34d399" />
            </BarChart>
          </ResponsiveContainer>
        </section>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <section className="card">
          <h2 className="mb-3 font-semibold text-white">Review queue</h2>
          <div className="space-y-2 text-sm">
            {(data?.review_by_status ?? []).map((row) => (
              <div key={row.status} className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="badge border-slate-700 text-slate-300">{row.status}</span>
                <span className="mono text-slate-300">{row.n}</span>
              </div>
            ))}
            {!data?.review_by_status?.length && <p className="text-slate-500">No review cases yet.</p>}
          </div>
        </section>
        <section className="card">
          <h2 className="mb-3 font-semibold text-white">Operational signal</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-md border border-slate-800 p-3">
              <div className="text-slate-500">Solve ratio</div>
              <div className="mono text-xl text-emerald-300">{data?.submissions ? Math.round((data.correct / data.submissions) * 100) : 0}%</div>
            </div>
            <div className="rounded-md border border-slate-800 p-3">
              <div className="text-slate-500">Review load</div>
              <div className="mono text-xl text-amber-300">{data?.open_cases ?? 0}</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
