import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import { useStore } from "../store";
import Modal from "../components/Modal";
import DownloadButton from "../components/DownloadButton";
import Markdown from "../components/Markdown";
import type { ChallengeSummary, ChallengeDetail } from "../types";

const CATEGORY_COLORS: Record<string, string> = {
  web: "border-emerald-700 text-emerald-400",
  pwn: "border-rose-700 text-rose-400",
  crypto: "border-violet-700 text-violet-400",
  forensics: "border-amber-700 text-amber-400",
  rev: "border-sky-700 text-sky-400",
  misc: "border-slate-600 text-slate-300",
};

function catClass(cat: string) {
  return CATEGORY_COLORS[cat.toLowerCase()] || "border-slate-600 text-slate-300";
}

export default function Challenges() {
  const { user, config } = useStore();
  const [openId, setOpenId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("default");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [activeCat, setActiveCat] = useState<string | null>(null);

  const { data, error, isLoading } = useQuery({
    queryKey: ["challenges"],
    queryFn: () => api.get<{ challenges: ChallengeSummary[] }>("/challenges"),
  });

  if (isLoading) return <p className="text-slate-500">Loading…</p>;

  if (error) {
    const e = error as ApiError;
    if (e.status === 403)
      return <Notice title="Challenges are private" body={user ? "You don't have access." : "Please log in to view challenges."} />;
    if (e.status === 425)
      return <Notice title="Not started yet" body="The competition hasn't started. Check back soon." />;
    return <Notice title="Unavailable" body={e.message} />;
  }

  const challenges = data?.challenges ?? [];
  const total = challenges.length;
  const solved = challenges.filter((c) => c.solved).length;

  // Filter (search + active tag/category), then sort.
  const q = search.trim().toLowerCase();
  let list = challenges.filter((c) => {
    if (activeCat && c.category !== activeCat) return false;
    if (activeTag && !(c.tags || []).includes(activeTag)) return false;
    if (q && !(c.name.toLowerCase().includes(q) || c.category.toLowerCase().includes(q) || (c.tags || []).some((t) => t.toLowerCase().includes(q)))) return false;
    return true;
  });
  const sorters: Record<string, ((a: ChallengeSummary, b: ChallengeSummary) => number) | null> = {
    default: null,
    points_desc: (a, b) => b.value - a.value,
    points_asc: (a, b) => a.value - b.value,
    solves_desc: (a, b) => b.solves - a.solves,
    solves_asc: (a, b) => a.solves - b.solves,
    name: (a, b) => a.name.localeCompare(b.name),
    unsolved: (a, b) => Number(a.solved) - Number(b.solved) || a.category.localeCompare(b.category),
  };
  if (sorters[sort]) list = [...list].sort(sorters[sort]!);
  const categories = [...new Set(list.map((c) => c.category))].sort();

  const renderCard = (c: ChallengeSummary) => (
    <div
      key={c.id}
      onClick={() => setOpenId(c.id)}
      className={`card cursor-pointer transition hover:border-sky-600 hover:bg-slate-800/60 ${
        c.solved ? "border-emerald-700/60 bg-emerald-950/20" : ""
      } ${c.locked ? "opacity-60" : ""}`}
    >
      <div className="mb-2 flex items-center justify-between">
        <button onClick={(e) => { e.stopPropagation(); setActiveCat(c.category); setActiveTag(null); }} className={`badge ${catClass(c.category)} hover:opacity-80`}>{c.category}</button>
        {c.locked ? <span title="Locked">🔒</span> : c.solved && <span className="text-emerald-400">✓</span>}
      </div>
      <div className="font-medium text-white">{c.name}</div>
      {c.tags?.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {c.tags.map((t) => (
            <button key={t} onClick={(e) => { e.stopPropagation(); setActiveTag(t); setActiveCat(null); }} className="badge border-slate-700 text-slate-400 text-[10px] hover:border-sky-600 hover:text-accent">{t}</button>
          ))}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
        <span className="mono text-sky-400">{c.value} pts</span>
        <span>{c.solves} solves</span>
      </div>
    </div>
  );

  return (
    <div>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Challenges</h1>
          {user && <p className="text-sm text-slate-400">Solved {solved} / {total}</p>}
        </div>
        {config.mode === "teams" && user && !user.team_id && (
          <span className="badge border-amber-700 text-amber-400">Join a team to submit flags</span>
        )}
      </div>

      {/* Toolbar: search · sort · active filter */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <input className="input max-w-xs" placeholder="🔍 Search challenges…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="input w-auto" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="default">Sort: Category</option>
          <option value="points_desc">Points: high → low</option>
          <option value="points_asc">Points: low → high</option>
          <option value="solves_desc">Most solved</option>
          <option value="solves_asc">Fewest solved</option>
          <option value="name">Name: A → Z</option>
          <option value="unsolved">Unsolved first</option>
        </select>
        {(activeCat || activeTag) && (
          <button onClick={() => { setActiveCat(null); setActiveTag(null); }} className="badge border-sky-600 text-accent">
            {activeCat ? `category: ${activeCat}` : `tag: ${activeTag}`} ✕
          </button>
        )}
        <span className="ml-auto text-xs text-slate-500">{list.length} of {total}</span>
      </div>

      {total === 0 && <p className="text-slate-500">No challenges released yet.</p>}
      {total > 0 && list.length === 0 && <p className="text-slate-500">No challenges match your filters.</p>}

      {sort === "default" ? (
        categories.map((cat) => (
          <section key={cat} className="mb-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">{cat}</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {list.filter((c) => c.category === cat).map(renderCard)}
            </div>
          </section>
        ))
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{list.map(renderCard)}</div>
      )}

      {openId != null && <ChallengeModal id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="mb-2 text-xl font-semibold text-white">{title}</h1>
      <p className="text-slate-400">{body}</p>
    </div>
  );
}

function ChallengeModal({ id, onClose }: { id: number; onClose: () => void }) {
  const { user, config, competition_state, features } = useStore();
  const qc = useQueryClient();
  const [flag, setFlag] = useState("");
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [fbKey, setFbKey] = useState(0);
  const [busy, setBusy] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["challenge", id],
    queryFn: () => api.get<{ challenge: ChallengeDetail }>(`/challenges/${id}`),
  });
  const ch = data?.challenge;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!flag.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await api.post<{ status: string; message: string }>(`/submit/${id}`, { flag });
      const ok = r.status === "correct";
      setResult({ ok, msg: r.message });
      setFbKey((k) => k + 1);
      if (ok || r.status === "already_solved") {
        setFlag("");
        await refetch();
        qc.invalidateQueries({ queryKey: ["challenges"] });
        qc.invalidateQueries({ queryKey: ["scoreboard"] });
      }
    } catch (e) {
      setResult({ ok: false, msg: e instanceof ApiError ? e.message : "Error" });
      setFbKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  };

  const unlockHint = async (hintId: number) => {
    if (!confirm("Unlock this hint? Its cost will be deducted from your score.")) return;
    try {
      await api.post(`/hints/${hintId}/unlock`);
      await refetch();
      qc.invalidateQueries({ queryKey: ["scoreboard"] });
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Failed to unlock");
    }
  };

  const canSubmit = user && competition_state === "running" && !(config.mode === "teams" && !user.team_id);

  return (
    <Modal open onClose={onClose} wide title={ch ? `${ch.name} · ${ch.value} pts` : "Challenge"}>
      {isLoading || !ch ? (
        <p className="text-slate-500">Loading…</p>
      ) : ch.locked ? (
        <div className="py-6 text-center">
          <div className="mb-3 text-4xl">🔒</div>
          <p className="text-slate-300">This challenge is locked.</p>
          {ch.requires?.length ? (
            <p className="mt-2 text-sm text-slate-400">First solve: {ch.requires.map((r) => <span key={r} className="badge mx-1 border-slate-700 text-slate-300">{r}</span>)}</p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className={`badge ${catClass(ch.category)}`}>{ch.category}</span>
            <span className="badge border-slate-700 text-slate-300">{ch.type}</span>
            <span className="text-slate-400">{ch.solves} solves</span>
            {ch.solved && <span className="badge border-emerald-700 text-emerald-400">Solved ✓</span>}
            {ch.tags?.map((t) => <span key={t} className="badge border-slate-700 text-slate-400">{t}</span>)}
          </div>

          <Markdown content={ch.description} format="markdown" />

          {ch.connection_info && (
            <div className="rounded-md border border-slate-800 bg-black/40 p-3">
              <div className="label">Connection</div>
              <code className="mono text-sm text-emerald-400">{ch.connection_info}</code>
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
              <div className="space-y-2">
                {ch.hints.map((h) => (
                  <div key={h.id} className="rounded-md border border-slate-800 bg-slate-900/60 p-3 text-sm">
                    {h.unlocked ? (
                      <p className="text-slate-300">{h.content}</p>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Locked hint</span>
                        <button onClick={() => unlockHint(h.id)} disabled={!user} className="btn-ghost text-xs">
                          Unlock ({h.cost} pts)
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!ch.solved && canSubmit && (
            <form onSubmit={submit} className="flex gap-2">
              <input
                className="input mono"
                placeholder="flag{...}"
                value={flag}
                onChange={(e) => setFlag(e.target.value)}
                autoFocus
              />
              <button className="btn-primary" disabled={busy}>{busy ? "…" : "Submit"}</button>
            </form>
          )}
          {!user && <p className="text-sm text-slate-400">Log in to submit a flag.</p>}
          {user && competition_state !== "running" && (
            <p className="text-sm text-amber-400">Submissions are closed.</p>
          )}

          {result && (
            <div
              key={fbKey}
              className={`flex items-center gap-2 rounded-md border p-3 text-base font-medium ${
                result.ok
                  ? "border-emerald-600 bg-emerald-950/50 text-emerald-300 feedback-correct"
                  : "border-rose-600 bg-rose-950/50 text-rose-300 feedback-wrong"
              }`}
            >
              <span className="text-xl">{result.ok ? "✅" : "❌"}</span>
              <span>{result.msg}</span>
            </div>
          )}

          {features.reviews && ch.reviews && (
            <Reviews id={id} data={ch.reviews} canReview={ch.solved} onChange={refetch} />
          )}
          {features.writeups && ch.writeups && (
            <Writeups id={id} data={ch.writeups} canPost={ch.solved} onChange={refetch} />
          )}

          {ch.attempts && ch.attempts.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-slate-400">Your attempts ({ch.attempts.length})</summary>
              <ul className="mt-2 space-y-1">
                {ch.attempts.map((a, i) => (
                  <li key={i} className="flex items-center justify-between rounded border border-slate-800 bg-slate-900/50 px-2 py-1">
                    <span className="mono text-xs text-slate-400 max-w-[60%] truncate">{a.provided}</span>
                    <span className="flex items-center gap-2">
                      {a.by_user && config.mode === "teams" && <span className="text-xs text-slate-500">{a.by_user}</span>}
                      {a.correct ? <span className="text-emerald-400">✓</span> : <span className="text-rose-400">✗</span>}
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
                  <li key={i} className="flex justify-between">
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

function Stars({ value, onPick }: { value: number; onPick?: (n: number) => void }) {
  return (
    <span>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" disabled={!onPick} onClick={() => onPick?.(n)} className={n <= value ? "text-amber-400" : "text-slate-600"} style={{ cursor: onPick ? "pointer" : "default" }}>★</button>
      ))}
    </span>
  );
}

function Reviews({ id, data, canReview, onChange }: { id: number; data: NonNullable<ChallengeDetail["reviews"]>; canReview: boolean; onChange: () => void }) {
  const [rating, setRating] = useState(data.mine?.rating || 0);
  const [comment, setComment] = useState(data.mine?.comment || "");
  const [msg, setMsg] = useState("");
  const submit = async () => {
    if (!rating) { setMsg("Pick a rating"); return; }
    try { await api.post(`/challenges/${id}/review`, { rating, comment }); setMsg("Thanks for your review!"); onChange(); }
    catch (e) { setMsg(e instanceof ApiError ? e.message : "Error"); }
  };
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/40 p-3">
      <div className="mb-2 flex items-center gap-2">
        <div className="label mb-0">Reviews</div>
        {data.average != null && <span className="text-sm text-amber-400">{data.average.toFixed(1)}★ <span className="text-slate-500">({data.count})</span></span>}
      </div>
      {canReview ? (
        <div className="mb-3 space-y-2">
          <Stars value={rating} onPick={setRating} />
          <textarea className="input" rows={2} placeholder="Optional comment…" value={comment} onChange={(e) => setComment(e.target.value)} />
          <div className="flex items-center gap-2"><button className="btn-ghost text-xs" onClick={submit}>{data.mine ? "Update review" : "Submit review"}</button>{msg && <span className="text-xs text-slate-400">{msg}</span>}</div>
        </div>
      ) : (
        <p className="mb-2 text-xs text-slate-500">Solve this challenge to leave a review.</p>
      )}
      <div className="space-y-2">
        {data.list.map((r, i) => (
          <div key={i} className="text-sm">
            <span className="text-slate-300">{r.name}</span> <Stars value={r.rating} />
            {r.comment && <p className="text-slate-400">{r.comment}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Writeups({ id, data, canPost, onChange }: { id: number; data: NonNullable<ChallengeDetail["writeups"]>; canPost: boolean; onChange: () => void }) {
  const [url, setUrl] = useState(data.mine?.url || "");
  const [msg, setMsg] = useState("");
  const submit = async () => {
    try { await api.post(`/challenges/${id}/writeup`, { url }); setMsg("Writeup saved!"); onChange(); }
    catch (e) { setMsg(e instanceof ApiError ? e.message : "Error"); }
  };
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/40 p-3">
      <div className="label">Writeups</div>
      {canPost && (
        <div className="mb-3 flex gap-2">
          <input className="input mono" placeholder="https://your-writeup…" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button className="btn-ghost text-xs" onClick={submit}>{data.mine ? "Update" : "Share"}</button>
        </div>
      )}
      {msg && <p className="mb-2 text-xs text-slate-400">{msg}</p>}
      <div className="space-y-1 text-sm">
        {data.list.length ? data.list.map((w, i) => (
          <div key={i}><a href={w.url} target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">{w.url}</a> <span className="text-slate-500">— {w.name}</span></div>
        )) : <p className="text-xs text-slate-500">No writeups yet.</p>}
      </div>
    </div>
  );
}
