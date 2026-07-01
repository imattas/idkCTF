import { useMemo, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import { useStore } from "../store";
import Modal from "../components/Modal";
import DownloadButton from "../components/DownloadButton";
import Markdown from "../components/Markdown";
import type { ChallengeSummary, ChallengeDetail } from "../types";

const CATEGORY_COLORS: Record<string, string> = {
  web: "border-emerald-700 text-emerald-300",
  pwn: "border-rose-700 text-rose-300",
  crypto: "border-violet-700 text-violet-300",
  forensics: "border-amber-700 text-amber-300",
  rev: "border-sky-700 text-sky-300",
  misc: "border-slate-600 text-slate-300",
};

type SolveFilter = "all" | "todo" | "solved" | "locked";

function catClass(cat: string) {
  return CATEGORY_COLORS[cat.toLowerCase()] || "border-slate-600 text-slate-300";
}

function Notice({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="mb-2 text-xl font-semibold text-white">{title}</h1>
      <p>{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export default function Challenges() {
  const { user, config } = useStore();
  const [openId, setOpenId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("default");
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [solveFilter, setSolveFilter] = useState<SolveFilter>("all");

  const { data, error, isLoading } = useQuery({
    queryKey: ["challenges"],
    queryFn: () => api.get<{ challenges: ChallengeSummary[] }>("/challenges"),
  });

  const challenges = data?.challenges ?? [];
  const total = challenges.length;
  const solved = challenges.filter((c) => c.solved).length;
  const locked = challenges.filter((c) => c.locked).length;

  const allCategories = useMemo(() => [...new Set(challenges.map((c) => c.category))].sort(), [challenges]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    let next = challenges.filter((c) => {
      if (activeCat && c.category !== activeCat) return false;
      if (solveFilter === "todo" && (c.solved || c.locked)) return false;
      if (solveFilter === "solved" && !c.solved) return false;
      if (solveFilter === "locked" && !c.locked) return false;
      if (q) {
        const haystack = [c.name, c.category].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    const sorters: Record<string, ((a: ChallengeSummary, b: ChallengeSummary) => number) | null> = {
      default: null,
      points_desc: (a, b) => b.value - a.value,
      points_asc: (a, b) => a.value - b.value,
      solves_desc: (a, b) => b.solves - a.solves,
      solves_asc: (a, b) => a.solves - b.solves,
      name: (a, b) => a.name.localeCompare(b.name),
      unsolved: (a, b) => Number(a.solved) - Number(b.solved) || Number(a.locked) - Number(b.locked) || a.category.localeCompare(b.category),
    };

    if (sorters[sort]) next = [...next].sort(sorters[sort]!);
    return next;
  }, [activeCat, challenges, search, solveFilter, sort]);

  const categories = sort === "default"
    ? allCategories.filter((cat) => list.some((c) => c.category === cat))
    : [];

  const clearFilters = () => {
    setSearch("");
    setActiveCat(null);
    setSolveFilter("all");
  };

  if (isLoading) return <p className="text-slate-500">Loading...</p>;

  if (error) {
    const e = error as ApiError;
    if (e.status === 403) {
      return <Notice title="Challenges are private" body={user ? "Your account does not have access." : "Log in to view the board."} />;
    }
    if (e.status === 425) {
      return <Notice title="Not started yet" body="The competition has not started. Check back when the event opens." />;
    }
    return <Notice title="Unavailable" body={e.message} />;
  }

  const renderCard = (c: ChallengeSummary) => {
    const open = () => setOpenId(c.id);
    const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    };

    return (
      <article
        key={c.id}
        role="button"
        tabIndex={0}
        onClick={open}
        onKeyDown={onKeyDown}
        className={`card cursor-pointer p-4 transition hover:border-[var(--accent-line)] hover:bg-[var(--surface-2)] ${c.solved ? "border-emerald-700/70 bg-emerald-950/10" : ""} ${c.locked ? "opacity-65" : ""}`}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setActiveCat(c.category); }}
            className={`badge ${catClass(c.category)} hover:border-[var(--accent)]`}
          >
            {c.category}
          </button>
          <span className={`badge ${c.solved ? "border-emerald-700 text-emerald-300" : c.locked ? "border-slate-700 text-slate-400" : "badge-accent"}`}>
            {c.solved ? "Solved" : c.locked ? "Locked" : `${c.value} pts`}
          </span>
        </div>

        <h2 className="line-clamp-2 min-h-11 text-base">{c.name}</h2>

        <div className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-3 text-xs text-[var(--fg-faint)]">
          <span className="mono">{c.solves} solves</span>
          <span className="mono">{c.type}</span>
        </div>
      </article>
    );
  };

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <div className="page-kicker">Board</div>
          <h1 className="page-title">Challenges</h1>
          {user ? <p className="page-subtitle">Solved {solved} of {total}. {locked ? `${locked} locked.` : "All visible challenges are unlocked."}</p> : <p className="page-subtitle">Browse the released challenge board.</p>}
        </div>
        {config.mode === "teams" && user && !user.team_id && (
          <span className="badge border-amber-700 text-amber-300">Join a team to submit</span>
        )}
      </section>

      <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_170px]">
        <input
          className="input"
          placeholder="Search name or category"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="input" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="default">Group by category</option>
          <option value="unsolved">Unsolved first</option>
          <option value="points_desc">Points high to low</option>
          <option value="points_asc">Points low to high</option>
          <option value="solves_desc">Most solved</option>
          <option value="solves_asc">Fewest solved</option>
          <option value="name">Name A to Z</option>
        </select>
        <select className="input" value={solveFilter} onChange={(e) => setSolveFilter(e.target.value as SolveFilter)}>
          <option value="all">All states</option>
          <option value="todo">Open only</option>
          <option value="solved">Solved</option>
          <option value="locked">Locked</option>
        </select>
      </section>

      {allCategories.length > 0 && (
        <section className="flex flex-wrap items-center gap-2">
          <button type="button" className={`badge ${!activeCat ? "badge-accent" : ""}`} onClick={() => { setActiveCat(null); }}>
            All
          </button>
          {allCategories.map((cat) => (
            <button key={cat} type="button" className={`badge ${activeCat === cat ? "badge-accent" : ""}`} onClick={() => { setActiveCat(cat); }}>
              {cat}
            </button>
          ))}
          {(search || activeCat || solveFilter !== "all") && (
            <button type="button" className="btn-ghost ml-auto px-3 py-1 text-xs" onClick={clearFilters}>
              Clear
            </button>
          )}
          <span className="ml-auto text-xs text-[var(--fg-faint)] mono">{list.length} / {total}</span>
        </section>
      )}

      {total === 0 && <Notice title="No challenges" body="No challenges have been released yet." />}
      {total > 0 && list.length === 0 && <Notice title="No matches" body="No challenges match the current filters." action={<button className="btn-primary" onClick={clearFilters}>Clear filters</button>} />}

      {sort === "default" ? (
        categories.map((cat) => (
          <section key={cat}>
            <div className="mb-3 flex items-center gap-3">
              <h2 className="text-sm uppercase text-[var(--fg-muted)]">{cat}</h2>
              <div className="h-px flex-1 bg-[var(--border)]" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.filter((c) => c.category === cat).map(renderCard)}
            </div>
          </section>
        ))
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{list.map(renderCard)}</div>
      )}

      {openId != null && <ChallengeModal id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function ChallengeModal({ id, onClose }: { id: number; onClose: () => void }) {
  const { user, config, competition_state } = useStore();
  const qc = useQueryClient();
  const [flag, setFlag] = useState("");
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pendingHint, setPendingHint] = useState<number | null>(null);
  const [hintError, setHintError] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["challenge", id],
    queryFn: () => api.get<{ challenge: ChallengeDetail }>(`/challenges/${id}`),
  });
  const ch = data?.challenge;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!flag.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await api.post<{ status: string; message: string }>(`/submit/${id}`, { flag });
      const ok = r.status === "correct" || r.status === "already_solved";
      setResult({ ok, msg: r.message });
      if (ok) {
        setFlag("");
        await refetch();
        qc.invalidateQueries({ queryKey: ["challenges"] });
        qc.invalidateQueries({ queryKey: ["scoreboard"] });
      }
    } catch (e) {
      setResult({ ok: false, msg: e instanceof ApiError ? e.message : "Submission failed" });
    } finally {
      setBusy(false);
    }
  };

  const unlockHint = async (hintId: number) => {
    setHintError("");
    try {
      await api.post(`/hints/${hintId}/unlock`);
      setPendingHint(null);
      await refetch();
      qc.invalidateQueries({ queryKey: ["scoreboard"] });
    } catch (e) {
      setHintError(e instanceof ApiError ? e.message : "Failed to unlock hint");
    }
  };

  const copyConnection = async (value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const canSubmit = !!user && !!ch && !ch.solved && competition_state === "running" && !(config.mode === "teams" && !user.team_id);
  const attemptsLeft = ch && ch.max_attempts > 0 ? Math.max(0, ch.max_attempts - (ch.attempts?.length ?? 0)) : null;

  return (
    <Modal open onClose={onClose} wide title={ch ? `${ch.name} · ${ch.value} pts` : "Challenge"}>
      {isLoading || !ch ? (
        <p className="text-slate-500">Loading...</p>
      ) : ch.locked ? (
        <div className="py-6 text-center">
          <div className="mx-auto mb-4 w-fit rounded-full border border-[var(--border)] px-4 py-2 text-sm text-[var(--fg-muted)] mono">Locked</div>
          <p className="text-slate-300">Solve the prerequisite challenge first.</p>
          {ch.requires?.length ? (
            <p className="mt-3 text-sm text-slate-400">Required: {ch.requires.map((r) => <span key={r} className="badge mx-1">{r}</span>)}</p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className={`badge ${catClass(ch.category)}`}>{ch.category}</span>
            <span className="badge">{ch.type}</span>
            <span className="badge">{ch.solves} solves</span>
            {attemptsLeft != null && <span className="badge">{attemptsLeft} attempts left</span>}
            {ch.solved && <span className="badge border-emerald-700 text-emerald-300">Solved</span>}
          </div>

          <Markdown content={ch.description} format="markdown" />

          {ch.connection_info && (
            <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <div className="label">Connection</div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <code className="mono flex-1 overflow-x-auto text-sm text-emerald-300">{ch.connection_info}</code>
                <button type="button" className="btn-ghost px-3 text-xs" onClick={() => copyConnection(ch.connection_info!)}>
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          )}

          {ch.files.length > 0 && (
            <div>
              <div className="label">Files</div>
              <div className="flex flex-wrap gap-2">
                {ch.files.map((f) => (
                  <DownloadButton key={f.id} id={f.id} name={f.name} size={f.size} />
                ))}
              </div>
            </div>
          )}

          {ch.hints.length > 0 && (
            <div>
              <div className="label">Hints</div>
              {hintError && <p className="mb-2 text-sm text-rose-300">{hintError}</p>}
              <div className="space-y-2">
                {ch.hints.map((h) => (
                  <div key={h.id} className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm">
                    {h.unlocked ? (
                      <p className="text-slate-300">{h.content}</p>
                    ) : pendingHint === h.id ? (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-slate-400">Spend {h.cost} points to unlock this hint?</span>
                        <span className="flex gap-2">
                          <button type="button" onClick={() => unlockHint(h.id)} disabled={!user} className="btn-primary px-3 text-xs">Unlock</button>
                          <button type="button" onClick={() => setPendingHint(null)} className="btn-ghost px-3 text-xs">Cancel</button>
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-slate-400">Locked hint · {h.cost} pts</span>
                        <button type="button" onClick={() => setPendingHint(h.id)} disabled={!user} className="btn-ghost px-3 text-xs">
                          Preview cost
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {canSubmit && (
            <form onSubmit={submit} className="flex flex-col gap-2 border-t border-[var(--border)] pt-4 sm:flex-row">
              <input
                className="input mono"
                placeholder="flag{...}"
                value={flag}
                onChange={(e) => setFlag(e.target.value)}
                autoFocus
              />
              <button className="btn-primary sm:w-32" disabled={busy || !flag.trim()}>{busy ? "Checking" : "Submit"}</button>
            </form>
          )}
          {!user && <p className="text-sm text-slate-400">Log in to submit a flag.</p>}
          {user && config.mode === "teams" && !user.team_id && <p className="text-sm text-amber-300">Join a team before submitting flags.</p>}
          {user && competition_state !== "running" && <p className="text-sm text-amber-300">Submissions are closed.</p>}

          {result && (
            <div
              className={`rounded-md border p-3 text-sm font-medium ${
                result.ok
                  ? "border-emerald-700 bg-emerald-950/40 text-emerald-300"
                  : "border-rose-700 bg-rose-950/40 text-rose-300"
              }`}
            >
              {result.msg}
            </div>
          )}

          {ch.attempts && ch.attempts.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-slate-400">Attempts ({ch.attempts.length})</summary>
              <ul className="mt-2 space-y-1">
                {ch.attempts.map((a, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1">
                    <span className="mono max-w-[60%] truncate text-xs text-slate-400">{a.provided}</span>
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      {a.by_user && config.mode === "teams" && <span className="text-xs text-slate-500">{a.by_user}</span>}
                      <span className={a.correct ? "text-emerald-300" : "text-rose-300"}>{a.correct ? "Correct" : "Wrong"}</span>
                      <span className="mono text-xs text-slate-600">{new Date(a.created_at * 1000).toLocaleTimeString()}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {ch.solvers.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-slate-400">Solvers ({ch.solvers.length})</summary>
              <ul className="mt-2 space-y-1 text-slate-400">
                {ch.solvers.map((s, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span>{s.name}</span>
                    <span className="mono text-xs">{new Date(s.created_at * 1000).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </Modal>
  );
}
