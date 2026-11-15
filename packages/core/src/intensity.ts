import type { LoggedSet, Session } from './types';

/** Sessions of the same exercise averaged for the volume comparison (spec §7.1). */
export const VOLUME_HISTORY = 4;
const RATIO_LOW = 0.8;
const RATIO_HIGH = 1.15;

/** weighted: Σ kg×reps · bodyweight: Σ (bodyweight + added kg)×reps · timed: Σ seconds. */
export function exerciseVolume(sets: LoggedSet[], bodyweightKg: number): number {
  let v = 0;
  for (const s of sets) {
    if (s.skipped) continue;
    if (s.type === 'weighted') v += (s.weight ?? 0) * (s.reps ?? 0);
    else if (s.type === 'bodyweight') v += (bodyweightKg + (s.weight ?? 0)) * (s.reps ?? 0);
    else v += s.seconds ?? 0;
  }
  return v;
}

function byExercise(sets: LoggedSet[]): Map<string, LoggedSet[]> {
  const m = new Map<string, LoggedSet[]>();
  for (const s of sets) {
    const list = m.get(s.exerciseId) ?? [];
    list.push(s);
    m.set(s.exerciseId, list);
  }
  return m;
}

/** Comparable "best set" key: [weight-ish, reps-ish], compared lexicographically. */
function bestKey(sets: LoggedSet[]): [number, number] | null {
  let best: [number, number] | null = null;
  for (const s of sets) {
    if (s.skipped) continue;
    const key: [number, number] =
      s.type === 'timed' ? [0, s.seconds ?? 0] : [s.weight ?? 0, s.reps ?? 0];
    if (!best || key[0] > best[0] || (key[0] === best[0] && key[1] > best[1])) best = key;
  }
  return best;
}

const beats = (a: [number, number], b: [number, number]) =>
  a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);

export interface IntensityResult {
  score: number;
  completion: number;
  volume: number;
  progression: number;
}

/**
 * Intensity score 0–100 (spec §7.1).
 * - completion 0–50: non-skipped sets ÷ planned sets.
 * - volume 0–30: mean over trained exercises of today's volume ÷ the average of that exercise's
 *   last 4 sessions; 0.80 → 0 points, 1.15 → 30. Exercises skipped entirely today are left out
 *   (completion already counts them). No history at all → neutral 15.
 * - progression 0–20: share of exercises whose best set beat last time's (heavier, or more reps at
 *   the same weight; more seconds for timed). No comparable exercise → neutral 10.
 */
export function intensity(input: {
  session: Session;
  plannedSetsTotal: number;
  history: Session[];
  bodyweightKg: number;
}): IntensityResult {
  const { session, plannedSetsTotal, bodyweightKg } = input;
  const history = input.history
    .filter((h) => h.localDate < session.localDate && h.id !== session.id)
    .sort((a, b) => (a.localDate < b.localDate ? 1 : -1)); // newest first

  const done = session.sets.filter((s) => !s.skipped).length;
  const completion = plannedSetsTotal > 0 ? 50 * Math.min(1, done / plannedSetsTotal) : 0;

  const ratios: number[] = [];
  let compared = 0;
  let improved = 0;
  let anyHistory = false;

  for (const [exerciseId, sets] of byExercise(session.sets)) {
    const today = exerciseVolume(sets, bodyweightKg);
    if (today <= 0) continue;
    const past = history
      .map((h) => h.sets.filter((s) => s.exerciseId === exerciseId))
      .filter((s) => exerciseVolume(s, bodyweightKg) > 0);
    if (past.length === 0) {
      ratios.push(1);
      continue;
    }
    anyHistory = true;
    const recent = past.slice(0, VOLUME_HISTORY);
    const avg = recent.reduce((n, s) => n + exerciseVolume(s, bodyweightKg), 0) / recent.length;
    ratios.push(today / avg);

    const nowBest = bestKey(sets);
    const lastBest = bestKey(past[0]!);
    if (nowBest && lastBest) {
      compared++;
      if (beats(nowBest, lastBest)) improved++;
    }
  }

  let volume = 15;
  if (anyHistory && ratios.length > 0) {
    const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    volume = 30 * Math.min(1, Math.max(0, (mean - RATIO_LOW) / (RATIO_HIGH - RATIO_LOW)));
  }
  const progression = compared > 0 ? (20 * improved) / compared : 10;

  return {
    score: Math.round(completion + volume + progression),
    completion,
    volume,
    progression,
  };
}
