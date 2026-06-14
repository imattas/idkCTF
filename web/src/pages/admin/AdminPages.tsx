import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../../api";
import Modal from "../../components/Modal";
import Markdown from "../../components/Markdown";

interface PageRow {
  id: number; slug: string; title: string; published: number; nav: number; nav_order: number; auth_required: number;
}

export default function AdminPages() {
  const { data, refetch } = useQuery({
    queryKey: ["admin-pages"],
    queryFn: () => api.get<{ pages: PageRow[] }>("/admin/pages"),
  });
  const [edit, setEdit] = useState<number | "new" | null>(null);

  const remove = async (id: number) => {
    if (!confirm("Delete this page?")) return;
    await api.del(`/admin/pages/${id}`); refetch();
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Pages</h1>
        <button className="btn-primary" onClick={() => setEdit("new")}>+ New page</button>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left text-slate-400">
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">URL</th>
              <th className="px-4 py-3">In nav</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {data?.pages.map((p) => (
              <tr key={p.id} className="border-b border-slate-900">
                <td className="px-4 py-3 font-medium text-white">{p.title}</td>
                <td className="px-4 py-3 mono text-xs text-slate-400">/p/{p.slug}</td>
                <td className="px-4 py-3">{p.nav ? "✓" : "—"}</td>
                <td className="px-4 py-3"><span className={`badge ${p.published ? "border-emerald-700 text-emerald-400" : "border-amber-700 text-amber-400"}`}>{p.published ? "published" : "draft"}</span></td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button className="btn-ghost text-xs mr-1" onClick={() => setEdit(p.id)}>Edit</button>
                  <button className="btn-danger text-xs" onClick={() => remove(p.id)}>Delete</button>
                </td>
              </tr>
            ))}
            {!data?.pages.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No pages yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {edit != null && <PageEditor id={edit} onClose={() => setEdit(null)} onSaved={refetch} />}
    </div>
  );
}

const EMPTY = { slug: "", title: "", content: "", format: "markdown", published: 0, nav: 0, footer: 0, nav_order: 0, auth_required: 0 };

function PageEditor({ id, onClose, onSaved }: { id: number | "new"; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<any>(EMPTY);
  const [loaded, setLoaded] = useState(id === "new");
  const [preview, setPreview] = useState(false);
  const [err, setErr] = useState("");

  useQuery({
    queryKey: ["admin-page", id],
    enabled: id !== "new",
    queryFn: async () => {
      const r = await api.get<any>(`/admin/pages/${id}`);
      setForm(r.page); setLoaded(true);
      return r;
    },
  });

  if (!loaded) return null;
  const set = (k: string, v: any) => setForm({ ...form, [k]: v });

  const save = async () => {
    setErr("");
    try {
      if (id === "new") await api.post("/admin/pages", form);
      else await api.patch(`/admin/pages/${id}`, form);
      onSaved(); onClose();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Error");
    }
  };

  return (
    <Modal open onClose={onClose} wide title={id === "new" ? "New page" : `Edit: ${form.title}`}>
      <div className="space-y-4">
        {err && <div className="rounded-md border border-rose-700 bg-rose-950/50 p-2 text-sm text-rose-300">{err}</div>}
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Title</label><input className="input" value={form.title} onChange={(e) => set("title", e.target.value)} /></div>
          <div><label className="label">Slug (URL /p/…)</label><input className="input mono" value={form.slug} onChange={(e) => set("slug", e.target.value)} placeholder="rules" /></div>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <select className="input w-32 py-1" value={form.format} onChange={(e) => set("format", e.target.value)}>
              <option value="markdown">Markdown</option>
              <option value="html">HTML</option>
            </select>
            <button className="btn-ghost text-xs" onClick={() => setPreview(!preview)}>{preview ? "Edit" : "Preview"}</button>
          </div>
        </div>
        {preview ? (
          <div className="min-h-[200px] rounded-md border border-slate-800 bg-slate-950/50 p-4"><Markdown content={form.content} format={form.format} /></div>
        ) : (
          <textarea className="input mono" rows={12} value={form.content} onChange={(e) => set("content", e.target.value)} placeholder="# Welcome&#10;Write your page in markdown…" />
        )}
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={!!form.published} onChange={(e) => set("published", e.target.checked ? 1 : 0)} /> Published</label>
          <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={!!form.nav} onChange={(e) => set("nav", e.target.checked ? 1 : 0)} /> Show in nav</label>
          <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={!!form.footer} onChange={(e) => set("footer", e.target.checked ? 1 : 0)} /> Show in footer</label>
          <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={!!form.auth_required} onChange={(e) => set("auth_required", e.target.checked ? 1 : 0)} /> Login required</label>
          <label className="flex items-center gap-2 text-sm text-slate-300">Nav order <input type="number" className="input w-16 py-1" value={form.nav_order} onChange={(e) => set("nav_order", Number(e.target.value))} /></label>
        </div>
        <button className="btn-primary" onClick={save} disabled={!form.title || !form.slug}>Save page</button>
      </div>
    </Modal>
  );
}
