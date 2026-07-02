import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import { useStore } from "../store";
import type { ReviewCaseSummary } from "../types";
import Modal from "./Modal";

interface ReviewAlert {
  key: string;
  case: ReviewCaseSummary;
  title: string;
  body: string;
  tone: "danger" | "warning" | "info" | "success";
  needsProof: boolean;
  timestamp: number;
}

const STORAGE_PREFIX = "idkctf.review-alerts.dismissed";
const MAX_STORED_KEYS = 100;

function storageKey(userId: number) {
  return `${STORAGE_PREFIX}.${userId}`;
}

function readDismissed(key: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : []);
  } catch {
    return new Set();
  }
}

function writeDismissed(key: string, values: Set<string>) {
  try {
    window.localStorage.setItem(key, JSON.stringify([...values].slice(-MAX_STORED_KEYS)));
  } catch {
    // Local storage can be disabled; the modal still works for this session.
  }
}

function caseLabel(row: ReviewCaseSummary) {
  return row.challenge_name || `review case #${row.id}`;
}

function alertForCase(row: ReviewCaseSummary): ReviewAlert | null {
  const updated = row.updated_at || row.created_at;
  const key = `${row.id}:${updated}:${row.status}:${row.proof_state}:${row.resolution || ""}`;
  const subject = caseLabel(row);

  if (row.proof_state === "rejected") {
    return {
      key,
      case: row,
      title: "Proof needs more detail",
      body: `Admins reviewed your proof for ${subject} and need a better explanation or supporting files.`,
      tone: "danger",
      needsProof: true,
      timestamp: updated,
    };
  }

  if (row.proof_state === "requested") {
    return {
      key,
      case: row,
      title: "Proof requested",
      body: `Admins requested solve proof for ${subject}. Include your approach, script notes, screenshots, logs, or another artifact that shows how you solved it.`,
      tone: "warning",
      needsProof: true,
      timestamp: row.proof_requested_at || updated,
    };
  }

  const hasAdminOutcome = row.leaderboard_frozen || row.prize_disqualified || row.suspended || row.banned || row.status === "clean" || row.status === "resolved";
  if (row.proof_state === "submitted" && !hasAdminOutcome) return null;

  if (row.status === "high_risk" || row.leaderboard_frozen) {
    return {
      key,
      case: row,
      title: row.leaderboard_frozen ? "Leaderboard placement under review" : "Solve under admin review",
      body: `${subject} is under review. This does not mean an automatic ban; admins will make the final decision from the evidence.`,
      tone: "warning",
      needsProof: false,
      timestamp: updated,
    };
  }

  if (row.prize_disqualified || row.suspended || row.banned) {
    const action = row.banned ? "ban" : row.suspended ? "suspension" : "prize disqualification";
    return {
      key,
      case: row,
      title: "Admin action applied",
      body: `An admin ${action} was applied from ${subject}. You can review the case and file an appeal from your profile.`,
      tone: "danger",
      needsProof: false,
      timestamp: updated,
    };
  }

  if ((row.status === "clean" || row.status === "resolved") && row.resolution) {
    return {
      key,
      case: row,
      title: row.status === "clean" ? "Review cleared" : "Review resolved",
      body: row.resolution,
      tone: row.status === "clean" ? "success" : "info",
      needsProof: false,
      timestamp: row.resolved_at || updated,
    };
  }

  if (row.status === "open" || row.status === "proof_required") {
    return {
      key,
      case: row,
      title: "Review case opened",
      body: `${subject} was opened for admin review. Automated signals do not permanently ban users; admins review the evidence first.`,
      tone: "info",
      needsProof: false,
      timestamp: updated,
    };
  }

  return null;
}

function toneClass(tone: ReviewAlert["tone"]) {
  if (tone === "danger") return "border-rose-700 bg-rose-950/30 text-rose-200";
  if (tone === "warning") return "border-amber-700 bg-amber-950/30 text-amber-200";
  if (tone === "success") return "border-emerald-700 bg-emerald-950/30 text-emerald-200";
  return "border-sky-800 bg-sky-950/30 text-sky-200";
}

export default function UserReviewAlerts() {
  const { user } = useStore();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [hiddenThisSession, setHiddenThisSession] = useState<Set<string>>(new Set());
  const [proof, setProof] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const key = user ? storageKey(user.id) : "";
  useEffect(() => {
    if (!key) return;
    setDismissed(readDismissed(key));
    setHiddenThisSession(new Set());
  }, [key]);

  const cases = useQuery({
    queryKey: ["my-review-case-alerts", user?.id, user?.team_id],
    enabled: user?.role === "user",
    refetchInterval: 60_000,
    queryFn: () => api.get<{ cases: ReviewCaseSummary[] }>("/me/review-cases"),
  });

  const alerts = useMemo(() => {
    return (cases.data?.cases ?? [])
      .map(alertForCase)
      .filter((alert): alert is ReviewAlert => !!alert)
      .sort((a, b) => {
        if (a.needsProof !== b.needsProof) return a.needsProof ? -1 : 1;
        return b.timestamp - a.timestamp;
      });
  }, [cases.data?.cases]);

  const active = alerts.find((alert) => !dismissed.has(alert.key) && !hiddenThisSession.has(alert.key));

  useEffect(() => {
    setProof("");
    setFile(null);
    setMessage("");
    setError("");
  }, [active?.key]);

  if (!user || user.role !== "user" || !active) return null;

  const rememberDismissed = () => {
    setDismissed((current) => {
      const next = new Set(current);
      next.add(active.key);
      writeDismissed(key, next);
      return next;
    });
  };

  const hideForSession = () => {
    setHiddenThisSession((current) => {
      const next = new Set(current);
      next.add(active.key);
      return next;
    });
  };

  const submitProof = async () => {
    setMessage("");
    setError("");
    try {
      const fd = new FormData();
      fd.append("proof", proof);
      if (file) fd.append("attachment", file);
      await api.post(`/me/review-cases/${active.case.id}/proof`, fd);
      setMessage("Proof submitted for admin review.");
      rememberDismissed();
      await Promise.all([
        cases.refetch(),
        queryClient.invalidateQueries({ queryKey: ["my-review-cases"] }),
      ]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Proof submission failed");
    }
  };

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] || null);
  };

  return (
    <Modal open onClose={hideForSession} title={active.title} wide>
      <div className="space-y-5">
        <div className={`rounded-md border p-4 ${toneClass(active.tone)}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="badge border-current text-current">Case #{active.case.id}</span>
            <span className="mono text-xs opacity-80">{new Date(active.timestamp * 1000).toLocaleString()}</span>
          </div>
          <p className="mt-3 text-sm">{active.body}</p>
        </div>

        <div className="grid gap-3 text-sm text-[var(--fg-muted)] sm:grid-cols-3">
          <div>
            <div className="label">Challenge</div>
            <div className="text-[var(--fg)]">{active.case.challenge_name || "Account/team review"}</div>
          </div>
          <div>
            <div className="label">Status</div>
            <div className="text-[var(--fg)]">{active.case.status}</div>
          </div>
          <div>
            <div className="label">Proof</div>
            <div className="text-[var(--fg)]">{active.case.proof_state}</div>
          </div>
        </div>

        {active.case.reason && (
          <div>
            <div className="label">Reason</div>
            <p className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm text-[var(--fg-muted)]">
              {active.case.reason}
            </p>
          </div>
        )}

        {active.needsProof && (
          <div className="space-y-3 rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Submit proof</h3>
              <p className="mt-1 text-sm text-[var(--fg-muted)]">A short explanation is enough to start; attach files when they help admins verify the solve.</p>
            </div>
            <textarea
              className="input"
              rows={4}
              placeholder="Explain your solve path, commands, script notes, screenshots, logs, or links."
              value={proof}
              onChange={(e) => setProof(e.target.value)}
            />
            <input className="input" type="file" onChange={onFile} />
            {message && <p className="text-sm text-emerald-300">{message}</p>}
            {error && <p className="text-sm text-rose-300">{error}</p>}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <button className="btn-ghost" type="button" onClick={hideForSession}>Remind me later</button>
          <button className="btn-ghost" type="button" onClick={rememberDismissed}>Dismiss this update</button>
          <Link className="btn-ghost" to="/profile#review-proof" onClick={hideForSession}>
            {location.pathname === "/profile" ? "View on profile" : "Open profile"}
          </Link>
          {active.needsProof && (
            <button className="btn-primary" type="button" onClick={submitProof} disabled={!proof.trim() && !file}>
              Submit proof
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
