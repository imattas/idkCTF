import assert from "node:assert/strict";
import {
  ABUSE_EVENTS,
  caseStatusForRisk,
  checklistComplete,
  containsHoneypot,
  createOrUpdateReviewCase,
  fixedWindowLimit,
  generatedTeamFlag,
  honeypotToken,
  normalizeChecklist,
  scoreSolveRisk,
  setWrongFlagCooldown,
  wrongFlagCooldown,
} from "../src/lib/antiAbuse";
import { checkFlag } from "../src/lib/validate";
import type { Env, SessionUser } from "../src/types";
import type { SiteConfig } from "../src/lib/config";

class FakeKV {
  data = new Map<string, string>();
  async get(key: string) { return this.data.get(key) ?? null; }
  async put(key: string, value: string) { this.data.set(key, value); }
  async delete(key: string) { this.data.delete(key); }
}

class FakeStatement {
  constructor(private db: FakeDB, private sql: string) {}
  args: unknown[] = [];
  bind(...args: unknown[]) { this.args = args; return this; }
  async first<T>() { return this.db.first<T>(this.sql, this.args); }
  async all<T>() { return { results: this.db.all<T>(this.sql, this.args) }; }
  async run() { return this.db.run(this.sql, this.args); }
}

class FakeDB {
  statements: string[] = [];
  insertedCases = 0;
  prepare(sql: string) { this.statements.push(sql); return new FakeStatement(this, sql); }
  async first<T>(sql: string): Promise<T | null> {
    if (sql.includes("SELECT id FROM review_cases")) return null;
    if (sql.includes("MIN(created_at)")) return { t: null } as T;
    if (sql.includes(ABUSE_EVENTS.FILE_DOWNLOADED)) return { n: 0 } as T;
    if (sql.includes("correct = 0")) return { n: 9 } as T;
    if (sql.includes("provided = ?") && sql.includes("correct = 1")) return { n: 1 } as T;
    if (sql.includes("ip_hash IN")) return { n: 3 } as T;
    if (sql.includes("FROM solves")) return { n: 3 } as T;
    if (sql.includes("hint_unlocks")) return { n: 0 } as T;
    return null;
  }
  all<T>() { return [] as T[]; }
  async run(sql: string) {
    if (sql.includes("INSERT INTO review_cases")) {
      this.insertedCases += 1;
      return { meta: { last_row_id: this.insertedCases } };
    }
    return { meta: { last_row_id: 0 } };
  }
  async batch(stmts: unknown[]) {
    this.statements.push(`batch:${stmts.length}`);
    return [];
  }
}

const cfg = {
  anti_abuse_enabled: true,
  submit_challenge_limit: 2,
  submit_challenge_window: 60,
  submit_global_limit: 5,
  submit_global_window: 300,
  wrong_flag_cooldown_threshold: 3,
  wrong_flag_cooldown_seconds: 60,
  risk_normal_threshold: 20,
  risk_soft_review_threshold: 40,
  risk_proof_required_threshold: 65,
  risk_high_review_threshold: 80,
  proof_threshold: 65,
  leaderboard_review_enabled: true,
  leaderboard_review_threshold: 80,
  review_fast_solve_seconds: 30,
  honeypot_risk_weight: 35,
} as SiteConfig;

const user = {
  id: 7,
  name: "player",
  email: "p@example.com",
  role: "user",
  team_id: 11,
  is_captain: 0,
  affiliation: null,
  country: null,
  website: null,
} satisfies SessionUser;

const env = { SESSIONS: new FakeKV(), DB: new FakeDB() } as unknown as Env;

const flagA = await generatedTeamFlag(11, 99, "secret");
const flagB = await generatedTeamFlag(12, 99, "secret");
assert.match(flagA, /^flag\{[a-f0-9]{24}\}$/);
assert.notEqual(flagA, flagB);
assert.equal(checkFlag("flag{static}", [{ type: "static", content: "flag{static}" }]), true);
assert.equal(checkFlag(flagA, [{ type: "static", content: "flag{static}" }]), false);

const token = await honeypotToken(11, 99, "secret");
assert.match(token, /^ctfmeta_[a-f0-9]{16}$/);
assert.equal(containsHoneypot(`please use ${token}`, token), true);
assert.equal(containsHoneypot("fakeflag{not_real}", token), true);
assert.equal(checkFlag("fakeflag{not_real}", [{ type: "static", content: "flag{real}" }]), false);

assert.equal(checklistComplete(normalizeChecklist({
  intended_solve_path: true,
  writeup: true,
  reviewer_tested: true,
  flag_validation: true,
  files_attached: true,
  remote_health_check: true,
  no_guessing: true,
  difficulty_calibrated: true,
})), true);
assert.equal(checklistComplete(normalizeChecklist({ intended_solve_path: true })), false);

assert.equal((await fixedWindowLimit(env, "u7:c99", 2, 60)).allowed, true);
assert.equal((await fixedWindowLimit(env, "u7:c99", 2, 60)).allowed, true);
assert.equal((await fixedWindowLimit(env, "u7:c99", 2, 60)).allowed, false);
await setWrongFlagCooldown(env, 7, 99, 60);
assert.ok((await wrongFlagCooldown(env, 7, 99)) > 0);

assert.equal(caseStatusForRisk(cfg, 15), "monitor");
assert.equal(caseStatusForRisk(cfg, 40), "open");
assert.equal(caseStatusForRisk(cfg, 65), "proof_required");
assert.equal(caseStatusForRisk(cfg, 80), "high_risk");

const risk = await scoreSolveRisk(env, cfg, {
  user,
  accountId: 11,
  accountColumn: "team_id",
  challengeId: 99,
  challengeDifficulty: "hard",
  challengeValue: 500,
  hasFiles: true,
  teamSpecificFlags: true,
  submissionId: 123,
  submitted: flagA,
  honeypotHit: true,
  now: Math.floor(Date.now() / 1000),
});
assert.ok(risk.score >= 80);
assert.ok(risk.reasons.some((r) => r.includes("honeypot")));

const caseId = await createOrUpdateReviewCase(env, cfg, {
  user_id: user.id,
  team_id: user.team_id,
  challenge_id: 99,
  submission_id: 123,
  risk_score: risk.score,
  reason: risk.reasons.join("; "),
  evidence: risk.evidence,
});
assert.equal(caseId, 1);
assert.ok(env.DB instanceof FakeDB);
assert.equal(env.DB.statements.some((sql) => /UPDATE\s+(users|teams)\s+SET\s+banned\s*=\s*1/i.test(sql)), false);
assert.equal(env.DB.statements.some((sql) => sql.includes("leaderboard_frozen = 1")), true);

console.log("anti-abuse tests passed");
