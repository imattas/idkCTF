import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../api";
import Modal from "../../components/Modal";
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
}

export default function AdminChallenges() {
  const qc = useQueryClient();
  const { data, refetch } = useQuery({
    queryKey: ["admin-challenges"],
    queryFn: () => api.get<{ challenges: AdminChallenge[] }>("/admin/challenges"),
  });
  const [editId, setEditId] = useState<number | "new" | null>(null);

  const remove = async (id: number) => {
    if (!confirm("Delete this challenge and all its solves/flags?")) return;
    await api.del(`/admin/challenges/${id}`);
    refetch();
    qc.invalidateQueries({ queryKey: ["challenges"] });
  };
  const onSaved = () => { refetch(); qc.invalidateQueries({ queryKey: ["challenges"] }); };
  const clone = async (id: number) => {
    await api.post(`/admin/challenges/${id}/clone`);
    refetch();
    qc.invalidateQueries({ queryKey: ["challenges"] });
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Challenges</h1>
        <button className="btn-primary" onClick={() => setEditId("new")}>+ New challenge</button>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left text-slate-400">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Category</th>
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
                <td className="px-4 py-3 text-slate-400">{c.type}</td>
                <td className="px-4 py-3 mono text-accent">{c.value}</td>
                <td className="px-4 py-3">
                  {c.flag_count === 0
                    ? <span className="badge border-rose-700 text-rose-400">0 ⚠</span>
                    : <span className="text-slate-400">{c.flag_count}</span>}
                </td>
                <td className="px-4 py-3 text-slate-400">{c.solves}</td>
                <td className="px-4 py-3">
                  <span className={`badge ${c.state === "visible" ? "border-emerald-700 text-emerald-400" : "border-amber-700 text-amber-400"}`}>{c.state}</span>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button className="btn-ghost text-xs mr-1" onClick={() => setEditId(c.id)}>Edit</button>
                  <button className="btn-ghost text-xs mr-1" onClick={() => clone(c.id)}>Clone</button>
                  <button className="btn-danger text-xs" onClick={() => remove(c.id)}>Delete</button>
                </td>
              </tr>
            ))}
            {!data?.challenges.length && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-500">No challenges yet. Click <b>New challenge</b> to create one.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editId != null && <Editor id={editId} onClose={() => setEditId(null)} onSaved={onSaved} />}
    </div>
  );
}

const EMPTY = {
  name: "", category: "misc", description: "", connection_info: "",
  type: "static", state: "hidden", value: 100, initial: 500, minimum: 100, decay: 20,
  max_attempts: 0, sort_order: 0, prerequisites: [] as number[],
};

function parsePrereqs(raw: any): number[] {
  if (Array.isArray(raw)) return raw.map(Number);
  if (typeof raw === "string" && raw) { try { const a = JSON.parse(raw); return Array.isArray(a) ? a.map(Number) : []; } catch { return []; } }
  return [];
}

type Tab = "details" | "flags" | "hints" | "files";

function Editor({ id, onClose, onSaved }: { id: number | "new"; onClose: () => void; onSaved: () => void }) {
  const isNew = id === "new";
  const [chId, setChId] = useState<number | null>(isNew ? null : (id as number));
  const [form, setForm] = useState<any>(EMPTY);
  const [tab, setTab] = useState<Tab>("details");
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [descPreview, setDescPreview] = useState(false);
  const set = (k: string) => (e: any) => setForm({ ...form, [k]: e.target.value });

  const detail = useQuery({
    queryKey: ["admin-challenge", chId],
    enabled: chId != null,
    queryFn: () => api.get<any>(`/admin/challenges/${chId}`),
  });
  const ch = detail.data?.challenge;
  const [loaded, setLoaded] = useState(false);
  if (ch && !loaded) {
    setForm({ ...EMPTY, ...ch, connection_info: ch.connection_info ?? "", prerequisites: parsePrereqs(ch.prerequisites) });
    setLoaded(true);
  }

  // Other challenges available as prerequisites.
  const allCh = useQuery({ queryKey: ["admin-challenges"], queryFn: () => api.get<{ challenges: AdminChallenge[] }>("/admin/challenges") });
  const togglePrereq = (pid: number) => {
    const cur: number[] = form.prerequisites || [];
    setForm({ ...form, prerequisites: cur.includes(pid) ? cur.filter((x) => x !== pid) : [...cur, pid] });
  };

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2500); };

  const saveBase = async (makeVisible?: boolean) => {
    setErr("");
    const payload = {
      name: form.name, category: form.category, description: form.description,
      connection_info: form.connection_info || null, type: form.type,
      state: makeVisible ? "visible" : form.state,
      value: Number(form.type === "dynamic" ? form.initial : form.value),
      initial: form.type === "dynamic" ? Number(form.initial) : null,
      minimum: form.type === "dynamic" ? Number(form.minimum) : null,
      decay: form.type === "dynamic" ? Number(form.decay) : null,
      max_attempts: Number(form.max_attempts), sort_order: Number(form.sort_order),
      prerequisites: form.prerequisites || [],
    };
    try {
      if (chId == null) {
        const r = await api.post<{ id: number }>("/admin/challenges", payload);
        setChId(r.id);
        setLoaded(true);
        flash("Challenge created — now add a flag in the Flags tab.");
        setTab("flags");
      } else {
        await api.patch(`/admin/challenges/${chId}`, payload);
        if (makeVisible) setForm({ ...form, state: "visible" });
        flash("Saved.");
      }
      onSaved();
      detail.refetch();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Error saving");
    }
  };

  const flagCount = detail.data?.flags?.length ?? 0;
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

  return (
    <Modal open onClose={onClose} wide title={isNew && chId == null ? "New challenge" : `Edit: ${form.name || "challenge"}`}>
      {/* Status bar */}
      {chId != null && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-slate-800 bg-slate-950/50 px-3 py-2 text-xs">
          <span className={`badge ${form.state === "visible" ? "border-emerald-700 text-emerald-400" : "border-amber-700 text-amber-400"}`}>{form.state}</span>
          {flagCount === 0
            ? <span className="text-rose-400">⚠ No flags yet — players can't solve this until you add one.</span>
            : <span className="text-emerald-400">✓ {flagCount} flag{flagCount > 1 ? "s" : ""}</span>}
          {toast && <span className="ml-auto text-sky-400">{toast}</span>}
        </div>
      )}

      <div className="mb-5 flex gap-1 border-b border-slate-800">
        {tabBtn("details", "Details")}
        {tabBtn("flags", "Flags", flagCount === 0 ? "⚠" : `(${flagCount})`)}
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
          <div><label className="label">Connection info (optional)</label><input className="input mono" value={form.connection_info} onChange={set("connection_info")} placeholder="nc host 1337  ·  https://target" /></div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Scoring</label>
              <select className="input" value={form.type} onChange={set("type")}>
                <option value="static">Static (fixed points)</option>
                <option value="dynamic">Dynamic (decays with solves)</option>
              </select>
            </div>
            <div>
              <label className="label">Visibility</label>
              <select className="input" value={form.state} onChange={set("state")}>
                <option value="hidden">Hidden (draft)</option>
                <option value="visible">Visible to players</option>
              </select>
            </div>
            <div><label className="label">Max attempts (0 = ∞)</label><input className="input" type="number" value={form.max_attempts} onChange={set("max_attempts")} /></div>
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

          <div className="flex items-center gap-3 pt-2">
            <button className="btn-primary" onClick={() => saveBase(false)} disabled={!form.name}>
              {chId == null ? "Create challenge" : "Save details"}
            </button>
            {chId != null && form.state !== "visible" && (
              <button className="btn-ghost" onClick={() => saveBase(true)} disabled={flagCount === 0} title={flagCount === 0 ? "Add a flag first" : ""}>
                Save & make visible
              </button>
            )}
          </div>
          {chId == null && <p className="text-xs text-slate-500">After creating, you'll add flags, hints and files in the other tabs.</p>}
        </div>
      )}

      {tab === "flags" && chId != null && detail.data && <FlagsTab chId={chId} flags={detail.data.flags} refetch={detail.refetch} />}
      {tab === "hints" && chId != null && detail.data && <HintsTab chId={chId} hints={detail.data.hints} refetch={detail.refetch} />}
      {tab === "files" && chId != null && detail.data && <FilesTab chId={chId} files={detail.data.files} refetch={detail.refetch} />}
    </Modal>
  );
}

function FlagsTab({ chId, flags, refetch }: { chId: number; flags: any[]; refetch: () => void }) {
  const [flag, setFlag] = useState({ type: "static", content: "" });
  const add = async () => {
    if (!flag.content) return;
    await api.post(`/admin/challenges/${chId}/flags`, flag);
    setFlag({ type: "static", content: "" });
    refetch();
  };
  const del = async (id: number) => { await api.del(`/admin/flags/${id}`); refetch(); };
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">Accepted flags. A challenge needs at least one. <code className="mono">static</code> = exact match, <code className="mono">case-insensitive</code>, or <code className="mono">regex</code>.</p>
      <div className="space-y-1">
        {flags.map((f) => (
          <div key={f.id} className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm">
            <span><span className="badge mr-2 border-slate-700 text-slate-400">{f.type}</span><code className="mono text-emerald-400">{f.content}</code></span>
            <button className="text-rose-400 hover:text-rose-300" onClick={() => del(f.id)}>✕</button>
          </div>
        ))}
        {!flags.length && <p className="text-xs text-amber-400">No flags yet — add one below.</p>}
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
            <button className="text-rose-400 hover:text-rose-300" onClick={() => del(h.id)}>✕</button>
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
      setQueue((q) => q.map((x, idx) => (idx === i ? { ...x, status: "uploading…" } : x)));
      const fd = new FormData();
      fd.append("file", arr[i]);
      try {
        await api.post(`/admin/challenges/${chId}/files`, fd);
        setQueue((q) => q.map((x, idx) => (idx === i ? { ...x, status: "✓ done" } : x)));
      } catch (e) {
        setQueue((q) => q.map((x, idx) => (idx === i ? { ...x, status: `✗ ${e instanceof ApiError ? e.message : "failed"}` } : x)));
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
            <span className="text-slate-300">📎 {f.name} <span className="text-slate-500">({Math.ceil(f.size / 1024)} KB)</span></span>
            <span className="flex items-center gap-3">
              <DownloadButton id={f.id} name={f.name} className="text-sky-400 hover:text-sky-300 text-xs" />
              <button className="text-rose-400 hover:text-rose-300" onClick={() => del(f.id)}>✕</button>
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
        <span className="text-2xl">⬆</span>
        <span className="mt-1 text-sm text-slate-300">{busy ? "Uploading…" : "Drop files here or click to browse"}</span>
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
