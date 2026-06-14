import { useStore } from "../store";

const METHOD_COLORS: Record<string, string> = {
  GET: "border-emerald-700 text-emerald-400",
  POST: "border-sky-700 text-accent",
  PATCH: "border-amber-700 text-amber-400",
  DELETE: "border-rose-700 text-rose-400",
};

function Endpoint({ method, path, desc, body, example }: { method: string; path: string; desc: string; body?: string; example?: string }) {
  return (
    <div className="card">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`badge ${METHOD_COLORS[method] || "border-slate-700 text-slate-300"}`}>{method}</span>
        <code className="mono text-sm text-slate-200">{path}</code>
      </div>
      <p className="mt-2 text-sm text-slate-400">{desc}</p>
      {body && (
        <div className="mt-2">
          <div className="label">Request body</div>
          <pre className="mono overflow-x-auto rounded-md bg-black/40 p-3 text-xs text-emerald-300">{body}</pre>
        </div>
      )}
      {example && (
        <div className="mt-2">
          <div className="label">Example</div>
          <pre className="mono overflow-x-auto rounded-md bg-black/40 p-3 text-xs text-slate-300">{example}</pre>
        </div>
      )}
    </div>
  );
}

export default function Docs() {
  const { config } = useStore();
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-bold text-white">{config.ctf_name} API</h1>
          <a href="/api/openapi.json" className="btn-ghost text-sm">⬇ OpenAPI spec</a>
        </div>
        <p className="mt-2 text-slate-400">
          A simple JSON REST API. The base URL is <code className="mono text-accent">{origin}/api</code>. All responses are JSON.
          Import the <a href="/api/openapi.json" className="text-accent hover:underline">OpenAPI spec</a> into Postman, Insomnia or Swagger UI.
        </p>
      </div>

      <div className="card">
        <h2 className="mb-2 text-lg font-semibold text-white">Authentication</h2>
        <p className="text-sm text-slate-400">
          Most endpoints require authentication. Create a personal token under{" "}
          <span className="text-accent">Profile → API tokens</span>, then send it on every request:
        </p>
        <pre className="mono mt-2 overflow-x-auto rounded-md bg-black/40 p-3 text-xs text-slate-300">{`Authorization: Bearer ctf_xxxxxxxxxxxxxxxxxxxxxxxx`}</pre>
        <p className="mt-2 text-xs text-slate-500">Tokens carry your account's permissions. Keep them secret; revoke them anytime in your profile.</p>
      </div>

      <h2 className="text-lg font-semibold text-white">Challenges</h2>
      <Endpoint method="GET" path="/api/challenges" desc="List all visible challenges with their current value, solve count, your solved/locked status."
        example={`curl ${origin}/api/challenges \\\n  -H "Authorization: Bearer $TOKEN"`} />
      <Endpoint method="GET" path="/api/challenges/:id" desc="Full detail for one challenge: description, files, hints, solvers (and reviews/writeups if enabled). Returns { locked: true } if prerequisites aren't met." />
      <Endpoint method="POST" path="/api/submit/:id" desc="Submit a flag for a challenge. Returns a status: correct, incorrect, already_solved, ratelimited, locked, or closed."
        body={`{ "flag": "flag{...}" }`}
        example={`curl -X POST ${origin}/api/submit/1 \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d '{"flag":"flag{example}"}'`} />
      <Endpoint method="GET" path="/api/files/:id" desc="Download a challenge attachment (binary)." />

      <h2 className="text-lg font-semibold text-white">You & your team</h2>
      <Endpoint method="GET" path="/api/me" desc="Your profile, current score, rank and solve count." />
      <Endpoint method="GET" path="/api/me/submissions" desc="Your (or, in team mode, your team's) full submission history — correct and incorrect."
        example={`curl ${origin}/api/me/submissions \\\n  -H "Authorization: Bearer $TOKEN"`} />
      <Endpoint method="GET" path="/api/me/solves" desc="Your (or your team's) solved challenges." />

      <h2 className="text-lg font-semibold text-white">Scoreboard</h2>
      <Endpoint method="GET" path="/api/scoreboard" desc="Ranked standings. Add ?bracket=<id> to filter by division." />
      <Endpoint method="GET" path="/api/scoreboard/graph?top=10" desc="Score-over-time series for the top N accounts." />

      <p className="pt-2 text-center text-xs text-slate-600">
        Rate limits apply to flag submissions. Times are Unix epoch seconds.
      </p>
    </div>
  );
}
