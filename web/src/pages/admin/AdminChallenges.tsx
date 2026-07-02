import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../../api";
import Markdown from "../../components/Markdown";
import DownloadButton from "../../components/DownloadButton";

interface AdminChallenge {
  id: number;
  name: string;
  category: string;
  type: string;
  state: string;
  value: number;
  solves: number;
  flag_count: number;
  difficulty: string;
  generated_team_flags: number;
  wave_id: number | null;
  wave_name: string | null;
  wave_state: string | null;
  wave_release_at: number | null;
}

interface ChallengeWave {
  id: number;
  name: string;
  description: string | null;
  state: "draft" | "released";
  release_at: number | null;
  released_at: number | null;
  sort_order: number;
  challenge_count: number;
  visible_count: number;
  hidden_count: number;
  created_at: number;
  updated_at: number | null;
}

function toLocalInput(ts?: number | null) {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

function formatTime(ts?: number | null) {
  return ts ? new Date(ts * 1000).toLocaleString() : "Manual";
}

export default function AdminChallenges() {
  const qc = useQueryClient();
  const { data, refetch } = useQuery({
    queryKey: ["admin-challenges"],
    queryFn: () => api.get<{ challenges: AdminChallenge[] }>("/admin/challenges"),
  });
  const waves = useQuery({
    queryKey: ["admin-waves"],
    queryFn: () => api.get<{ waves: ChallengeWave[] }>("/admin/waves"),
  });
  const [notice, setNotice] = useState("");

  const syncBoard = () => {
    refetch();
    waves.refetch();
    qc.invalidateQueries({ queryKey: ["challenges"] });
  };

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2500);
  };

  const remove = async (id: number) => {
    if (!confirm("Delete this challenge and all its solves/flags?")) return;
    await api.del(`/admin/challenges/${id}`);
    syncBoard();
  };
  const clone = async (id: number) => {
    await api.post(`/admin/challenges/${id}/clone`);
    flash("Draft clone created.");
    syncBoard();
  };
  const release = async (id: number) => {
    try {
      await api.post(`/admin/challenges/${id}/release`);
      flash("Challenge released.");
      syncBoard();
    } catch (e) {
      flash(e instanceof ApiError ? e.message : "Could not release challenge");
    }
  };
  const hide = async (id: number) => {
    await api.post(`/admin/challenges/${id}/hide`);
    flash("Challenge hidden.");
    syncBoard();
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Challenges</h1>
        <Link className="btn-primary" to="/admin/challenges/new">+ New challenge</Link>
      </div>
      {notice && <div className="mb-4 rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-300">{notice}</div>}

      <WavesPanel
        waves={waves.data?.waves || []}
        refetch={syncBoard}
        flash={flash}
      />

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left text-slate-400">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Wave</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Value</th>
              <th className="px-4 py-3">Flags</th>
              <th className="px-4 py-3">Solves</th>
              <th className="px-4 py-3">State</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {data?.challenges.map((c) => (
              <tr key={c.id} className="border-b border-slate-900 hover:bg-slate-800/40">
                <td className="px-4 py-3 font-medium text-white">{c.name}</td>
                <td className="px-4 py-3 text-slate-400">{c.category}</td>
                <td className="px-4 py-3">
                  {c.wave_name ? (
                    <div className="flex flex-col gap-1">
                      <span className="text-slate-300">{c.wave_name}</span>
                      <span className={`badge w-fit ${c.wave_state === "released" ? "border-emerald-700 text-emerald-400" : "border-sky-700 text-sky-300"}`}>
                        {c.wave_state === "released" ? "released" : c.wave_release_at ? formatTime(c.wave_release_at) : "draft"}
                      </span>
                    </div>
                  ) : <span className="text-slate-600">-</span>}
                </td>
                <td className="px-4 py-3 text-slate-400">{c.type}</td>
                <td className="px-4 py-3 mono text-accent">{c.value}</td>
                <td className="px-4 py-3">
                  {c.flag_count === 0
                    ? <span className="badge border-rose-700 text-rose-400">0</span>
                    : <span className="text-slate-400">{c.flag_count}</span>}
                </td>
                <td className="px-4 py-3 text-slate-400">{c.solves}</td>
                <td className="px-4 py-3">
                  <span className={`badge ${c.state === "visible" ? "border-emerald-700 text-emerald-400" : "border-amber-700 text-amber-400"}`}>{c.state}</span>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <Link className="btn-ghost text-xs mr-1" to={`/admin/challenges/${c.id}/edit`}>Edit</Link>
                  {c.state === "visible" ? (
                    <button className="btn-ghost text-xs mr-1" onClick={() => hide(c.id)}>Hide</button>
                  ) : (
                    <button
                      className="btn-ghost text-xs mr-1"
                      onClick={() => release(c.id)}
                      disabled={c.flag_count === 0 && !c.generated_team_flags}
                      title={c.flag_count === 0 && !c.generated_team_flags ? "Add a flag or enable generated flags before release" : ""}
                    >
                      {c.flag_count === 0 && !c.generated_team_flags ? "Needs flag" : "Release"}
                    </button>
                  )}
                  <button className="btn-ghost text-xs mr-1" onClick={() => clone(c.id)}>Clone</button>
                  <button className="btn-danger text-xs" onClick={() => remove(c.id)}>Delete</button>
                </td>
              </tr>
            ))}
            {!data?.challenges.length && (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-500">No challenges yet. Click <b>New challenge</b> to create one.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AdminChallengeCreate() {
  return <Editor id="new" />;
}

export function AdminChallengeEdit() {
  const { id } = useParams();
  const challengeId = Number(id);
  if (!Number.isFinite(challengeId) || challengeId <= 0) {
    return <div className="card p-6 text-sm text-rose-300">Invalid challenge id.</div>;
  }
  return <Editor id={challengeId} />;
}

function WavesPanel({ waves, refetch, flash }: { waves: ChallengeWave[]; refetch: () => void; flash: (message: string) => void }) {
  const [create, setCreate] = useState({ name: "", description: "", release_at: "", sort_order: 0 });
  const [edits, setEdits] = useState<Record<number, { name: string; description: string; release_at: string; sort_order: number | string }>>({});

  const draftFor = (wave: ChallengeWave) => edits[wave.id] || {
    name: wave.name,
    description: wave.description || "",
    release_at: toLocalInput(wave.release_at),
    sort_order: wave.sort_order,
  };

  const patchDraft = (wave: ChallengeWave, patch: Partial<ReturnType<typeof draftFor>>) => {
    setEdits({ ...edits, [wave.id]: { ...draftFor(wave), ...patch } });
  };

  const add = async () => {
    if (!create.name.trim()) return;
    try {
      await api.post("/admin/waves", {
        name: create.name.trim(),
        description: create.description.trim() || null,
        release_at: fromLocalInput(create.release_at),
        sort_order: Number(create.sort_order || 0),
      });
      setCreate({ name: "", description: "", release_at: "", sort_order: 0 });
      flash("Wave created.");
      refetch();
    } catch (e) {
      flash(e instanceof ApiError ? e.message : "Could not create wave");
    }
  };

  const save = async (wave: ChallengeWave) => {
    const d = draftFor(wave);
    try {
      await api.patch(`/admin/waves/${wave.id}`, {
        name: d.name.trim(),
        description: d.description.trim() || null,
        release_at: fromLocalInput(d.release_at),
        sort_order: Number(d.sort_order || 0),
      });
      const next = { ...edits };
      delete next[wave.id];
      setEdits(next);
      flash("Wave saved.");
      refetch();
    } catch (e) {
      flash(e instanceof ApiError ? e.message : "Could not save wave");
    }
  };

  const release = async (wave: ChallengeWave) => {
    try {
      await api.post(`/admin/waves/${wave.id}/release`);
      flash("Wave released.");
      refetch();
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      const failures = Array.isArray(err?.data?.failures) ? err.data.failures : [];
      const first = failures[0] ? `${failures[0].name}: ${failures[0].error}` : err?.message;
      flash(first || "Could not release wave");
    }
  };

  const hide = async (wave: ChallengeWave) => {
    await api.post(`/admin/waves/${wave.id}/hide`);
    flash("Wave hidden.");
    refetch();
  };

  const remove = async (wave: ChallengeWave) => {
    if (!confirm(`Delete wave "${wave.name}"? Challenges will stay as drafts without a wave.`)) return;
    await api.del(`/admin/waves/${wave.id}`);
    flash("Wave deleted.");
    refetch();
  };

  return (
    <section className="card mb-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Release waves</h2>
          <p className="text-sm text-slate-400">{waves.length} wave{waves.length === 1 ? "" : "s"}</p>
        </div>
        <div className="grid flex-1 gap-2 md:grid-cols-[minmax(150px,1fr)_minmax(150px,1fr)_210px_90px_auto]">
          <input className="input" placeholder="Wave name" value={create.name} onChange={(e) => setCreate({ ...create, name: e.target.value })} />
          <input className="input" placeholder="Description" value={create.description} onChange={(e) => setCreate({ ...create, description: e.target.value })} />
          <input className="input" type="datetime-local" value={create.release_at} onChange={(e) => setCreate({ ...create, release_at: e.target.value })} />
          <input className="input" type="number" value={create.sort_order} onChange={(e) => setCreate({ ...create, sort_order: Number(e.target.value) })} />
          <button className="btn-primary whitespace-nowrap" onClick={add} disabled={!create.name.trim()}>Add wave</button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left text-slate-400">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Schedule</th>
              <th className="px-3 py-2">Order</th>
              <th className="px-3 py-2">Challenges</th>
              <th className="px-3 py-2">State</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {waves.map((wave) => {
              const draft = draftFor(wave);
              return (
                <tr key={wave.id} className="border-b border-slate-900">
                  <td className="px-3 py-2">
                    <input className="input min-w-44" value={draft.name} onChange={(e) => patchDraft(wave, { name: e.target.value })} />
                    <input className="input mt-2 min-w-44" placeholder="Description" value={draft.description} onChange={(e) => patchDraft(wave, { description: e.target.value })} />
                  </td>
                  <td className="px-3 py-2"><input className="input min-w-48" type="datetime-local" value={draft.release_at} onChange={(e) => patchDraft(wave, { release_at: e.target.value })} /></td>
                  <td className="px-3 py-2"><input className="input w-24" type="number" value={draft.sort_order} onChange={(e) => patchDraft(wave, { sort_order: e.target.value })} /></td>
                  <td className="px-3 py-2 text-slate-300">
                    <span className="mono">{wave.challenge_count}</span>
                    <span className="ml-2 text-xs text-slate-500">{wave.visible_count} visible / {wave.hidden_count} hidden</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`badge ${wave.state === "released" ? "border-emerald-700 text-emerald-400" : "border-sky-700 text-sky-300"}`}>
                      {wave.state === "released" ? "released" : wave.release_at ? formatTime(wave.release_at) : "draft"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button className="btn-ghost mr-1 text-xs" onClick={() => save(wave)}>Save</button>
                    {wave.state === "released" ? (
                      <button className="btn-ghost mr-1 text-xs" onClick={() => hide(wave)}>Hide</button>
                    ) : (
                      <button className="btn-ghost mr-1 text-xs" onClick={() => release(wave)}>Release</button>
                    )}
                    <button className="btn-danger text-xs" onClick={() => remove(wave)}>Delete</button>
                  </td>
                </tr>
              );
            })}
            {!waves.length && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">No waves yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const EMPTY = {
  name: "", category: "misc", description: "", connection_info: "",
  type: "static", state: "hidden", value: 100, initial: 500, minimum: 100, decay: 20,
  max_attempts: 0, sort_order: 0, prerequisites: [] as number[],
  wave_id: null as number | null,
  difficulty: "medium", generated_team_flags: 0,
  quality_checklist: {
    intended_solve_path: false,
    writeup: false,
    reviewer_tested: false,
    flag_validation: false,
    files_attached: false,
    remote_health_check: false,
    no_guessing: false,
    difficulty_calibrated: false,
  },
};

function parsePrereqs(raw: any): number[] {
  if (Array.isArray(raw)) return raw.map(Number);
  if (typeof raw === "string" && raw) { try { const a = JSON.parse(raw); return Array.isArray(a) ? a.map(Number) : []; } catch { return []; } }
  return [];
}

function parseChecklist(raw: any) {
  const base = { ...EMPTY.quality_checklist };
  if (!raw) return base;
  if (typeof raw === "object") return { ...base, ...raw };
  try { return { ...base, ...JSON.parse(raw) }; } catch { return base; }
}

type Tab = "details" | "quality" | "flags" | "hints" | "files";

function Editor({ id }: { id: number | "new" }) {
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const routeState = location.state as { tab?: Tab; toast?: string } | null;
  const isNew = id === "new";
  const [chId, setChId] = useState<number | null>(isNew ? null : (id as number));
  const [form, setForm] = useState<any>(EMPTY);
  const [tab, setTab] = useState<Tab>(routeState?.tab || "details");
  const [err, setErr] = useState("");
  const [toast, setToast] = useState(routeState?.toast || "");
  const [descPreview, setDescPreview] = useState(false);
  const set = (k: string) => (e: any) => setForm({ ...form, [k]: e.target.value });

  const detail = useQuery({
    queryKey: ["admin-challenge", chId],
    enabled: chId != null,
    queryFn: () => api.get<any>(`/admin/challenges/${chId}`),
  });
  const waves = useQuery({
    queryKey: ["admin-waves"],
    queryFn: () => api.get<{ waves: ChallengeWave[] }>("/admin/waves"),
  });
  const ch = detail.data?.challenge;
  const [loaded, setLoaded] = useState(false);
  if (ch && !loaded) {
    setForm({ ...EMPTY, ...ch, wave_id: ch.wave_id ?? null, connection_info: ch.connection_info ?? "", prerequisites: parsePrereqs(ch.prerequisites), quality_checklist: parseChecklist(ch.quality_checklist) });
    setLoaded(true);
  }

  // Other challenges available as prerequisites.
  const allCh = useQuery({ queryKey: ["admin-challenges"], queryFn: () => api.get<{ challenges: AdminChallenge[] }>("/admin/challenges") });
  const togglePrereq = (pid: number) => {
    const cur: number[] = form.prerequisites || [];
    setForm({ ...form, prerequisites: cur.includes(pid) ? cur.filter((x) => x !== pid) : [...cur, pid] });
  };

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2500); };
  const onSaved = () => {
    qc.invalidateQueries({ queryKey: ["admin-challenges"] });
    qc.invalidateQueries({ queryKey: ["admin-waves"] });
    qc.invalidateQueries({ queryKey: ["challenges"] });
  };

  const saveBase = async (makeVisible?: boolean) => {
    setErr("");
    const payload = {
      name: form.name, category: form.category, description: form.description,
      connection_info: form.connection_info || null, type: form.type,
      state: chId == null ? "hidden" : form.state,
      value: Number(form.type === "dynamic" ? form.initial : form.value),
      initial: form.type === "dynamic" ? Number(form.initial) : null,
      minimum: form.type === "dynamic" ? Number(form.minimum) : null,
      decay: form.type === "dynamic" ? Number(form.decay) : null,
      max_attempts: Number(form.max_attempts), sort_order: Number(form.sort_order),
      prerequisites: form.prerequisites || [],
      wave_id: form.wave_id ? Number(form.wave_id) : null,
      difficulty: form.difficulty || "medium",
      generated_team_flags: form.generated_team_flags ? 1 : 0,
      quality_checklist: form.quality_checklist || EMPTY.quality_checklist,
    };
    try {
      if (chId == null) {
        const r = await api.post<{ id: number }>("/admin/challenges", payload);
        onSaved();
        navigate(`/admin/challenges/${r.id}/edit`, {
          replace: true,
          state: { tab: "flags", toast: "Challenge created. Add a flag in the Flags tab." },
        });
        return;
      } else {
        await api.patch(`/admin/challenges/${chId}`, payload);
        if (makeVisible) {
          await api.post(`/admin/challenges/${chId}/release`);
          setForm({ ...form, state: "visible" });
          flash("Saved and released.");
        } else {
          flash("Saved.");
        }
      }
      onSaved();
      detail.refetch();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Error saving");
    }
  };

  const flagCount = detail.data?.flags?.length ?? 0;
  const refetchDetail = () => {
    detail.refetch();
    onSaved();
  };
  const tabBtn = (t: Tab, label: string, badge?: string) => (
    <button
      onClick={() => chId != null || t === "details" ? setTab(t) : null}
      disabled={chId == null && t !== "details"}
      className={`px-4 py-2 text-sm border-b-2 transition ${
        tab === t ? "border-sky-500 text-accent" : "border-transparent text-slate-400 hover:text-slate-200"
      } ${chId == null && t !== "details" ? "opacity-40 cursor-not-allowed" : ""}`}
    >
      {label}{badge ? <span className="ml-1">{badge}</span> : null}
    </button>
  );
  const selectedWave = (waves.data?.waves || []).find((w) => w.id === Number(form.wave_id));
  const releaseDisabled = flagCount === 0 && !form.generated_team_flags;
  const footer = (
    <div className="flex flex-wrap items-center gap-3">
      <button className="btn-primary" onClick={() => saveBase(false)} disabled={!form.name}>
        {chId == null ? "Create challenge" : "Save"}
      </button>
      {chId != null && form.state !== "visible" && (
        <button
          className="btn-ghost"
          onClick={() => saveBase(true)}
          disabled={releaseDisabled}
          title={releaseDisabled ? "Add a flag or enable generated flags first" : ""}
        >
          Save & release
        </button>
      )}
      <button className="btn-ghost ml-auto" onClick={() => navigate("/admin/challenges")}>Back to list</button>
      {toast && <span className="text-sm text-sky-400">{toast}</span>}
    </div>
  );

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col">
      <div className="-mx-1 flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--border)] bg-[var(--bg)] px-1 py-3">
        <div className="min-w-0 flex-1">
          <div className="page-kicker">Challenges</div>
          <h1 className="truncate text-2xl font-bold text-white">{isNew && chId == null ? "New challenge" : `Edit: ${form.name || "challenge"}`}</h1>
        </div>
        {chId != null && <span className={`badge ${form.state === "visible" ? "border-emerald-700 text-emerald-400" : "border-amber-700 text-amber-400"}`}>{form.state}</span>}
        {selectedWave && <span className="badge border-sky-700 text-sky-300">{selectedWave.name}</span>}
        <Link className="btn-ghost" to="/admin/challenges">Back</Link>
      </div>

      <div className="flex-1 py-5">
        {chId != null && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-slate-800 bg-slate-950/50 px-3 py-2 text-xs">
            {flagCount === 0
              ? <span className="text-rose-400">No flags yet. Add one before release.</span>
              : <span className="text-emerald-400">{flagCount} flag{flagCount > 1 ? "s" : ""} configured</span>}
          </div>
        )}

        <div className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-800 bg-[var(--bg)] pt-1">
          {tabBtn("details", "Details")}
          {tabBtn("quality", "Quality")}
          {tabBtn("flags", "Flags", flagCount === 0 ? "!" : `(${flagCount})`)}
          {tabBtn("hints", "Hints", `(${detail.data?.hints?.length ?? 0})`)}
          {tabBtn("files", "Files", `(${detail.data?.files?.length ?? 0})`)}
        </div>

        {err && <div className="mb-3 rounded-md border border-rose-700 bg-rose-950/50 p-2 text-sm text-rose-300">{err}</div>}

        {tab === "details" && (
          <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Name</label><input className="input" value={form.name} onChange={set("name")} placeholder="e.g. Baby RSA" /></div>
            <div><label className="label">Category</label><input className="input" value={form.category} onChange={set("category")} placeholder="web / pwn / crypto / rev / forensics / misc" /></div>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="label">Description (markdown supported)</label>
              <button type="button" className="btn-ghost text-xs" onClick={() => setDescPreview(!descPreview)}>{descPreview ? "Edit" : "Preview"}</button>
            </div>
            {descPreview ? (
              <div className="min-h-[110px] rounded-md border border-slate-800 bg-slate-950/50 p-3"><Markdown content={form.description} format="markdown" /></div>
            ) : (
              <textarea className="input" rows={4} value={form.description} onChange={set("description")} />
            )}
          </div>
          <div><label className="label">Connection info (optional)</label><input className="input mono" value={form.connection_info} onChange={set("connection_info")} placeholder="nc host 1337 - https://target" /></div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Scoring</label>
              <select className="input" value={form.type} onChange={set("type")}>
                <option value="static">Static (fixed points)</option>
                <option value="dynamic">Dynamic (decays with solves)</option>
              </select>
            </div>
            <div>
              <label className="label">Difficulty</label>
              <select className="input" value={form.difficulty} onChange={set("difficulty")}>
                <option value="easy">easy</option>
                <option value="medium">medium</option>
                <option value="hard">hard</option>
                <option value="insane">insane</option>
              </select>
            </div>
            <div>
              <label className="label">Visibility</label>
              <select className="input" value={form.state} onChange={set("state")}>
                <option value="hidden">Hidden (draft)</option>
                <option value="visible">Visible to players</option>
              </select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div><label className="label">Max attempts (0 = unlimited)</label><input className="input" type="number" value={form.max_attempts} onChange={set("max_attempts")} /></div>
            <div>
              <label className="label">Release wave</label>
              <select
                className="input"
                value={form.wave_id ?? ""}
                onChange={(e) => setForm({ ...form, wave_id: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">No wave</option>
                {(waves.data?.waves || []).map((wave) => (
                  <option key={wave.id} value={wave.id}>{wave.name}</option>
                ))}
              </select>
            </div>
            <label className="md:mt-6 flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={!!form.generated_team_flags} onChange={(e) => setForm({ ...form, generated_team_flags: e.target.checked ? 1 : 0 })} /> Generated team-specific flag
            </label>
          </div>

          {form.type === "static" ? (
            <div className="grid grid-cols-2 gap-4">
              <div><label className="label">Point value</label><input className="input" type="number" value={form.value} onChange={set("value")} /></div>
              <div><label className="label">Sort order</label><input className="input" type="number" value={form.sort_order} onChange={set("sort_order")} /></div>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-4">
              <div><label className="label">Initial</label><input className="input" type="number" value={form.initial} onChange={set("initial")} /></div>
              <div><label className="label">Minimum</label><input className="input" type="number" value={form.minimum} onChange={set("minimum")} /></div>
              <div><label className="label">Decay (solves)</label><input className="input" type="number" value={form.decay} onChange={set("decay")} /></div>
              <div><label className="label">Sort order</label><input className="input" type="number" value={form.sort_order} onChange={set("sort_order")} /></div>
            </div>
          )}

          <div>
            <label className="label">Prerequisites (locked until these are solved)</label>
            <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto rounded-md border border-slate-800 p-2">
              {(allCh.data?.challenges || []).filter((x) => x.id !== chId).map((x) => (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => togglePrereq(x.id)}
                  className={`badge ${(form.prerequisites || []).includes(x.id) ? "border-sky-600 text-accent" : "border-slate-700 text-slate-500"}`}
                >
                  {x.name}
                </button>
              ))}
              {!(allCh.data?.challenges || []).filter((x) => x.id !== chId).length && <span className="text-xs text-slate-500">No other challenges yet.</span>}
            </div>
          </div>

          {chId == null && <p className="text-xs text-slate-500">After creating, you'll add flags, hints and files in the other tabs.</p>}
          </div>
        )}

        {tab === "quality" && (
          <QualityTab
            checklist={form.quality_checklist || EMPTY.quality_checklist}
            setChecklist={(next) => setForm({ ...form, quality_checklist: next })}
          />
        )}

        {tab === "flags" && chId != null && detail.data && (
          <FlagsTab
            chId={chId}
            flags={detail.data.flags}
            refetch={refetchDetail}
            onLastFlagDeleted={() => setForm({ ...form, state: "hidden" })}
          />
        )}
        {tab === "hints" && chId != null && detail.data && <HintsTab chId={chId} hints={detail.data.hints} refetch={refetchDetail} />}
        {tab === "files" && chId != null && detail.data && <FilesTab chId={chId} files={detail.data.files} refetch={refetchDetail} />}
      </div>

      <div className="sticky bottom-0 z-20 -mx-1 border-t border-[var(--border)] bg-[var(--surface)] px-1 py-3">
        {footer}
      </div>
    </div>
  );
}

const CHECKLIST_LABELS: Record<string, string> = {
  intended_solve_path: "Intended solve path",
  writeup: "Writeup",
  reviewer_tested: "Reviewer tested",
  flag_validation: "Flag validation works",
  files_attached: "Files attached correctly",
  remote_health_check: "Remote health check",
  no_guessing: "No guessing-only solve",
  difficulty_calibrated: "Difficulty calibrated",
};

function QualityTab({ checklist, setChecklist }: { checklist: Record<string, boolean>; setChecklist: (next: Record<string, boolean>) => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">Publishing checklist for challenge quality review.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {Object.entries(CHECKLIST_LABELS).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={!!checklist[key]}
              onChange={(e) => setChecklist({ ...checklist, [key]: e.target.checked })}
            />
            {label}
          </label>
        ))}
      </div>
    </div>
  );
}

function FlagsTab({ chId, flags, refetch, onLastFlagDeleted }: { chId: number; flags: any[]; refetch: () => void; onLastFlagDeleted: () => void }) {
  const [flag, setFlag] = useState({ type: "static", content: "" });
  const add = async () => {
    if (!flag.content) return;
    await api.post(`/admin/challenges/${chId}/flags`, flag);
    setFlag({ type: "static", content: "" });
    refetch();
  };
  const del = async (id: number) => {
    await api.del(`/admin/flags/${id}`);
    if (flags.length <= 1) onLastFlagDeleted();
    refetch();
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">Accepted flags. A challenge needs at least one. <code className="mono">static</code> = exact match, <code className="mono">case-insensitive</code>, or <code className="mono">regex</code>.</p>
      <div className="space-y-1">
        {flags.map((f) => (
          <div key={f.id} className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm">
            <span><span className="badge mr-2 border-slate-700 text-slate-400">{f.type}</span><code className="mono text-emerald-400">{f.content}</code></span>
            <button className="text-rose-400 hover:text-rose-300" onClick={() => del(f.id)}>Delete</button>
          </div>
        ))}
        {!flags.length && <p className="text-xs text-amber-400">No flags yet. Add one below.</p>}
      </div>
      <div className="flex gap-2">
        <select className="input w-40" value={flag.type} onChange={(e) => setFlag({ ...flag, type: e.target.value })}>
          <option value="static">static</option>
          <option value="static_ci">case-insensitive</option>
          <option value="regex">regex</option>
        </select>
        <input className="input mono" placeholder="flag{...}" value={flag.content} onChange={(e) => setFlag({ ...flag, content: e.target.value })} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="btn-primary" onClick={add}>Add flag</button>
      </div>
    </div>
  );
}

function HintsTab({ chId, hints, refetch }: { chId: number; hints: any[]; refetch: () => void }) {
  const [hint, setHint] = useState({ content: "", cost: 0 });
  const add = async () => {
    if (!hint.content) return;
    await api.post(`/admin/challenges/${chId}/hints`, hint);
    setHint({ content: "", cost: 0 });
    refetch();
  };
  const del = async (id: number) => { await api.del(`/admin/hints/${id}`); refetch(); };
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">Hints cost points to unlock (deducted from score; shared across a team).</p>
      <div className="space-y-1">
        {hints.map((h) => (
          <div key={h.id} className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm">
            <span className="text-slate-300">{h.content} <span className="text-slate-500">({h.cost} pts)</span></span>
            <button className="text-rose-400 hover:text-rose-300" onClick={() => del(h.id)}>Delete</button>
          </div>
        ))}
        {!hints.length && <p className="text-xs text-slate-500">No hints.</p>}
      </div>
      <div className="flex gap-2">
        <input className="input" placeholder="Hint text" value={hint.content} onChange={(e) => setHint({ ...hint, content: e.target.value })} />
        <input className="input w-24" type="number" placeholder="cost" value={hint.cost} onChange={(e) => setHint({ ...hint, cost: Number(e.target.value) })} />
        <button className="btn-primary" onClick={add}>Add hint</button>
      </div>
    </div>
  );
}

function FilesTab({ chId, files, refetch }: { chId: number; files: any[]; refetch: () => void }) {
  const [queue, setQueue] = useState<{ name: string; status: string }[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  const uploadMany = async (list: FileList | File[]) => {
    const arr = Array.from(list);
    if (!arr.length) return;
    setBusy(true);
    setQueue(arr.map((f) => ({ name: f.name, status: "waiting" })));
    for (let i = 0; i < arr.length; i++) {
      setQueue((q) => q.map((x, idx) => (idx === i ? { ...x, status: "uploading..." } : x)));
      const fd = new FormData();
      fd.append("file", arr[i]);
      try {
        await api.post(`/admin/challenges/${chId}/files`, fd);
        setQueue((q) => q.map((x, idx) => (idx === i ? { ...x, status: "done" } : x)));
      } catch (e) {
        setQueue((q) => q.map((x, idx) => (idx === i ? { ...x, status: e instanceof ApiError ? e.message : "failed" } : x)));
      }
      refetch();
    }
    setBusy(false);
    setTimeout(() => setQueue([]), 4000);
  };

  const del = async (id: number) => { await api.del(`/admin/files/${id}`); refetch(); };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">Attachments players download. Stored on Cloudflare (R2 if enabled, else inline in D1, max 8&nbsp;MB each).</p>

      <div className="space-y-1">
        {files.map((f) => (
          <div key={f.id} className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm">
            <span className="text-slate-300">{f.name} <span className="text-slate-500">({Math.ceil(f.size / 1024)} KB)</span></span>
            <span className="flex items-center gap-3">
              <DownloadButton id={f.id} name={f.name} className="text-sky-400 hover:text-sky-300 text-xs" />
              <button className="text-rose-400 hover:text-rose-300" onClick={() => del(f.id)}>Delete</button>
            </span>
          </div>
        ))}
        {!files.length && <p className="text-xs text-slate-500">No files yet.</p>}
      </div>

      <label
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); uploadMany(e.dataTransfer.files); }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed py-8 text-center transition ${
          dragging ? "border-sky-500 bg-sky-500/10" : "border-slate-700 hover:border-slate-600"
        }`}
      >
        <span className="text-sm font-semibold text-slate-300">Upload files</span>
        <span className="mt-1 text-sm text-slate-300">{busy ? "Uploading..." : "Drop files here or click to browse"}</span>
        <span className="text-xs text-slate-500">multiple files supported</span>
        <input type="file" multiple className="hidden" disabled={busy} onChange={(e) => e.target.files && uploadMany(e.target.files)} />
      </label>

      {queue.length > 0 && (
        <div className="space-y-1 text-xs">
          {queue.map((q, i) => (
            <div key={i} className="flex justify-between text-slate-400"><span>{q.name}</span><span>{q.status}</span></div>
          ))}
        </div>
      )}
    </div>
  );
}
