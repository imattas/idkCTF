// Dynamic scoring using CTFd's standard (quadratic decay) formula.
//
//   value = ((minimum - initial) / (decay^2)) * (solveCount^2) + initial
//   clamped to >= minimum
//
// `solveCount` is the number of accepted solves for the challenge. As more
// teams solve it, the value decays toward `minimum`. Every solver of a
// challenge is always worth its *current* value (matching CTFd behaviour),
// so the scoreboard recomputes from live solve counts.

export interface ChallengeScoring {
  type: "static" | "dynamic";
  value: number;
  initial: number | null;
  minimum: number | null;
  decay: number | null;
}

export function challengeValue(c: ChallengeScoring, solveCount: number): number {
  if (c.type !== "dynamic") return c.value;
  const initial = c.initial ?? c.value;
  const minimum = c.minimum ?? 0;
  const decay = c.decay && c.decay > 0 ? c.decay : 1;
  const computed = ((minimum - initial) / (decay * decay)) * (solveCount * solveCount) + initial;
  const rounded = Math.round(computed);
  return Math.max(minimum, Math.min(initial, rounded));
}
