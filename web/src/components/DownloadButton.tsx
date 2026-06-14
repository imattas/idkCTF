import { useState } from "react";
import { downloadFile, ApiError } from "../api";

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
}

// Robust file download with loading + inline error (never navigates away).
export default function DownloadButton({ id, name, size, className }: { id: number; name: string; size?: number; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const go = async () => {
    setBusy(true);
    setErr("");
    try {
      await downloadFile(id, name);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Download failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-col">
      <button onClick={go} disabled={busy} className={className || "btn-ghost text-xs"}>
        {busy ? "Downloading…" : <>⬇ {name}{size != null && <span className="ml-1 text-slate-500">({fmtSize(size)})</span>}</>}
      </button>
      {err && <span className="mt-1 text-xs text-rose-400">{err}</span>}
    </span>
  );
}
