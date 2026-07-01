import type { Env, SessionUser } from "../types";

// Whether an account may access a challenge's content (hints, files, detail):
// admins always; everyone else only if it's visible AND all prerequisites are
// solved. Prevents leaking hints/files of hidden or still-locked challenges.
export async function canAccessChallenge(
  env: Env,
  challengeId: number,
  user: SessionUser | null,
  mode: "teams" | "users"
): Promise<boolean> {
  if (user?.role === "admin") return true;
  const ch = await env.DB.prepare("SELECT state, prerequisites FROM challenges WHERE id = ?")
    .bind(challengeId)
    .first<{ state: string; prerequisites: string | null }>();
  if (!ch || ch.state !== "visible") return false;

  let prereqs: number[] = [];
  try { const a = JSON.parse(ch.prerequisites || "[]"); if (Array.isArray(a)) prereqs = a.map(Number); } catch {}
  if (!prereqs.length) return true;

  const account = mode === "teams" ? user?.team_id : user?.id;
  if (account == null) return false;
  const col = mode === "teams" ? "team_id" : "user_id";
  const ph = prereqs.map(() => "?").join(",");
  const cnt = await env.DB.prepare(
    `SELECT COUNT(DISTINCT s.challenge_id) AS n
     FROM solves s JOIN users solver ON solver.id = s.user_id
     WHERE solver.role = 'user' AND s.${col} = ? AND s.challenge_id IN (${ph})`
  )
    .bind(account, ...prereqs)
    .first<{ n: number }>();
  return (cnt?.n ?? 0) >= prereqs.length;
}
