import type { Env } from "../types";
import { challengeValue } from "./scoring";

export interface StandingEntry {
  account_id: number;
  name: string;
  score: number;
  solve_count: number;
  last_event: number; // epoch seconds of most recent scoring event (for tiebreak)
  hidden: number;
}

interface SolveRow {
  challenge_id: number;
  user_id: number;
  team_id: number | null;
  created_at: number;
}

// Compute current value for every challenge from live solve counts.
// When `cutoff` is provided, only solves at/before that time count (scoreboard freeze).
export async function challengeValues(env: Env, cutoff: number | null = null): Promise<Map<number, number>> {
  const challenges = await env.DB.prepare(
    "SELECT id, type, value, initial, minimum, decay FROM challenges"
  ).all<{ id: number; type: string; value: number; initial: number | null; minimum: number | null; decay: number | null }>();
  const counts = cutoff
    ? await env.DB.prepare("SELECT challenge_id, COUNT(*) AS n FROM solves WHERE created_at <= ? GROUP BY challenge_id").bind(cutoff).all<{ challenge_id: number; n: number }>()
    : await env.DB.prepare("SELECT challenge_id, COUNT(*) AS n FROM solves GROUP BY challenge_id").all<{ challenge_id: number; n: number }>();
  const countMap = new Map(counts.results.map((r) => [r.challenge_id, r.n]));
  const out = new Map<number, number>();
  for (const c of challenges.results) {
    out.set(
      c.id,
      challengeValue(
        { type: c.type as "static" | "dynamic", value: c.value, initial: c.initial, minimum: c.minimum, decay: c.decay },
        countMap.get(c.id) ?? 0
      )
    );
  }
  return out;
}

// Build the ranked standings for the active mode.
export async function computeStandings(
  env: Env,
  mode: "teams" | "users",
  includeHidden = false,
  cutoff: number | null = null,
  bracketId: number | null = null
): Promise<StandingEntry[]> {
  const values = await challengeValues(env, cutoff);
  const andCutoff = cutoff ? ` AND created_at <= ${cutoff}` : "";
  const table = mode === "teams" ? "teams" : "users";
  const bracketClause = bracketId ? " AND bracket_id = ?" : "";

  const accounts = new Map<number, StandingEntry>();
  const stmt = env.DB.prepare(`SELECT id, name, hidden FROM ${table} WHERE banned = 0${bracketClause}`);
  const rows = await (bracketId ? stmt.bind(bracketId) : stmt).all<{ id: number; name: string; hidden: number }>();
  for (const a of rows.results)
    accounts.set(a.id, { account_id: a.id, name: a.name, score: 0, solve_count: 0, last_event: 0, hidden: a.hidden });

  const keyOf = (r: { user_id: number; team_id: number | null }) =>
    mode === "teams" ? r.team_id : r.user_id;

  // Solves
  const solves = await env.DB.prepare(
    `SELECT challenge_id, user_id, team_id, created_at FROM solves WHERE 1=1${andCutoff}`
  ).all<SolveRow>();
  for (const s of solves.results) {
    const key = keyOf(s);
    if (key == null) continue;
    const acc = accounts.get(key);
    if (!acc) continue;
    acc.score += values.get(s.challenge_id) ?? 0;
    acc.solve_count += 1;
    if (s.created_at > acc.last_event) acc.last_event = s.created_at;
  }

  // Awards
  const awards = await env.DB.prepare(
    `SELECT user_id, team_id, value, created_at FROM awards WHERE 1=1${andCutoff}`
  ).all<{ user_id: number | null; team_id: number | null; value: number; created_at: number }>();
  for (const a of awards.results) {
    const key = mode === "teams" ? a.team_id : a.user_id;
    if (key == null) continue;
    const acc = accounts.get(key);
    if (!acc) continue;
    acc.score += a.value;
    if (a.created_at > acc.last_event) acc.last_event = a.created_at;
  }

  // Hint costs (deduct)
  const hints = await env.DB.prepare(
    `SELECT hu.user_id AS user_id, hu.team_id AS team_id, h.cost AS cost FROM hint_unlocks hu JOIN hints h ON h.id = hu.hint_id WHERE 1=1${cutoff ? ` AND hu.created_at <= ${cutoff}` : ""}`
  ).all<{ user_id: number; team_id: number | null; cost: number }>();
  for (const h of hints.results) {
    const key = mode === "teams" ? h.team_id : h.user_id;
    if (key == null) continue;
    const acc = accounts.get(key);
    if (!acc) continue;
    acc.score -= h.cost;
  }

  const list = [...accounts.values()].filter((a) => includeHidden || !a.hidden);
  // Only rank accounts that have scored something OR keep all? CTFd shows accounts with solves.
  const ranked = list.filter((a) => a.solve_count > 0 || a.score !== 0);
  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.last_event - b.last_event; // earlier reach = higher rank
  });
  return ranked;
}
