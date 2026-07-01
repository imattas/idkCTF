import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../../api";
import { useStore } from "../../store";

const THEMES = [
  { id: "idktheflag", label: "idktheflag", swatch: "#0a0a0c", accent: "#cf2336" },
  { id: "light", label: "Light", swatch: "#f7f7f8", accent: "#cf2336" },
];

export default function AdminAppearance() {
  const { refresh } = useStore();
  const [form, setForm] = useState<any>(null);
  const [msg, setMsg] = useState("");

  useQuery({
    queryKey: ["admin-config-appearance"],
    queryFn: async () => {
      const cfg = await api.get<any>("/admin/config");
      setForm(cfg);
      return cfg;
    },
  });

  if (!form) return <p className="text-slate-500">Loading…</p>;
  const set = (k: string, v: any) => setForm({ ...form, [k]: v });

  const save = async () => {
    setMsg("");
    await api.patch("/admin/config", {
      theme: form.theme, accent: form.accent, custom_css: form.custom_css, footer_html: form.footer_html,
      home_content: form.home_content, home_format: form.home_format, custom_head: form.custom_head,
    });
    await refresh();
    setMsg("Appearance saved.");
  };

  const upload = async (key: "logo" | "favicon", file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    try { await api.post(`/admin/branding/${key}`, fd); await refresh(); setMsg(`${key} updated.`); }
    catch (e) { setMsg(e instanceof ApiError ? e.message : "Upload failed"); }
  };
  const removeBrand = async (key: string) => { await api.del(`/admin/branding/${key}`); await refresh(); setMsg(`${key} removed.`); };

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-white">Appearance</h1>
      {msg && <div className="rounded-md border border-emerald-700 bg-emerald-950/40 p-3 text-sm text-emerald-300">{msg}</div>}

      <div className="card space-y-4">
        <h2 className="font-semibold text-white">Theme</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => setForm({ ...form, theme: t.id, accent: t.accent })}
              className={`flex items-center gap-2 rounded-md border p-3 text-sm transition ${form.theme === t.id ? "badge-accent" : "border-slate-700 text-slate-300 hover:bg-slate-800"}`}
            >
              <span className="h-5 w-5 rounded-md border border-slate-600" style={{ background: t.swatch }} />
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <label className="label mb-0">Accent</label>
          <input type="color" value={form.accent || "#38bdf8"} onChange={(e) => set("accent", e.target.value)} className="h-9 w-14 rounded border border-slate-700 bg-transparent" />
          <input className="input mono w-32" value={form.accent || ""} onChange={(e) => set("accent", e.target.value)} />
        </div>
      </div>

      <div className="card space-y-4">
        <h2 className="font-semibold text-white">Branding images</h2>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="label">Logo (shown in nav)</label>
            {form.has_logo && <img src={"/api/branding/logo?" + Date.now()} alt="logo" className="mb-2 h-10 w-auto rounded bg-slate-800 p-1" />}
            <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && upload("logo", e.target.files[0])} className="text-sm text-slate-400" />
            {form.has_logo && <button className="btn-ghost mt-2 text-xs" onClick={() => removeBrand("logo")}>Remove logo</button>}
          </div>
          <div>
            <label className="label">Favicon</label>
            <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && upload("favicon", e.target.files[0])} className="text-sm text-slate-400" />
          </div>
        </div>
        <p className="text-xs text-slate-500">PNG/SVG, max 2 MB. Stored on Cloudflare (R2 if enabled, else D1).</p>
      </div>

      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-white">Home page content</h2>
          <select className="input w-32 py-1" value={form.home_format || "markdown"} onChange={(e) => set("home_format", e.target.value)}>
            <option value="markdown">Markdown</option>
            <option value="html">HTML</option>
          </select>
        </div>
        <textarea className="input mono" rows={5} value={form.home_content || ""} onChange={(e) => set("home_content", e.target.value)} placeholder="## Welcome to our CTF&#10;Rules, prizes, sponsors…" />
        <p className="text-xs text-slate-500">Rendered below the hero on the landing page.</p>
      </div>

      <div className="card space-y-4">
        <h2 className="font-semibold text-white">Custom CSS</h2>
        <textarea className="input mono" rows={5} value={form.custom_css || ""} onChange={(e) => set("custom_css", e.target.value)} placeholder=":root { --accent: #ff0066; }" />
        <h2 className="font-semibold text-white">Head meta/link tags</h2>
        <textarea className="input mono" rows={3} value={form.custom_head || ""} onChange={(e) => set("custom_head", e.target.value)} placeholder={`<meta name="theme-color" content="#cf2336">`} />
        <p className="text-xs text-slate-500">Only safe meta/link tags are applied. Scripts and event handlers are ignored.</p>
        <h2 className="font-semibold text-white">Footer HTML</h2>
        <textarea className="input" rows={2} value={form.footer_html || ""} onChange={(e) => set("footer_html", e.target.value)} placeholder="© 2026 My CTF — built on Cloudflare" />
      </div>

      <button className="btn-primary" onClick={save}>Save appearance</button>
    </div>
  );
}
