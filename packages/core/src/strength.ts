import { addDays, daysBetween } from './time';
import type {
  Exercise,
  ExerciseType,
  Goal,
  LiftTarget,
  LocalDate,
  LoggedSet,
  Session,
} from './types';

/** "Current best" looks back this many days, so a lift that stops being trained loses credit (spec §7.2). */
export const CURRENT_WINDOW_DAYS = 14;
/** Week-1 baseline window. */
export const BASELINE_DAYS = 7;

/** Estimated one-rep max (Epley). */
export function e1rm(weight: number, reps: number): number {
  return weight * (1 + reps / 30);
}

/** Strength score for one set: e1RM for weighted, reps for bodyweight, seconds for timed. */
export function setScore(set: LoggedSet): number | null {
  if (set.skipped) return null;
  if (set.type === 'weighted') {
    return set.weight != null && set.reps != null && set.reps > 0
      ? e1rm(set.weight, set.reps)
      : null;
  }
  if (set.type === 'bodyweight') return set.reps;
  return set.seconds;
}

/** Best set score for an exercise within [from, to] (inclusive). */
export function bestResult(
  exerciseId: string,
  sessions: Session[],
  from: LocalDate,
  to: LocalDate,
): number | null {
  let best: number | null = null;
  for (const s of sessions) {
    if (s.localDate < from || s.localDate > to) continue;
    for (const set of s.sets) {
      if (set.exerciseId !== exerciseId) continue;
      const v = setScore(set);
      if (v != null && (best == null || v > best)) best = v;
    }
  }
  return best;
}

/** Best result in the first 7 days; if the lift wasn't trained then, its first recorded result. */
export function baselineFor(
  exerciseId: string,
  sessions: Session[],
  startDate: LocalDate,
): number | null {
  const week1 = bestResult(exerciseId, sessions, startDate, addDays(startDate, BASELINE_DAYS - 1));
  if (week1 != null) return week1;
  const dated = sessions
    .filter((s) => s.sets.some((x) => x.exerciseId === exerciseId && setScore(x) != null))
    .sort((a, b) => (a.localDate < b.localDate ? -1 : 1));
  const first = dated[0];
  return first ? bestResult(exerciseId, [first], first.localDate, first.localDate) : null;
}

export function targetValue(type: ExerciseType, target: LiftTarget): number {
  if (type === 'weighted') return e1rm(target.targetWeight ?? 0, target.targetReps);
  return target.targetReps;
}

/** Share of the way from baseline to target, clamped to 0–1. */
export function milestonePct(
  baseline: number | null,
  current: number | null,
  target: number,
): number {
  if (baseline == null || current == null) return 0;
  if (target <= baseline) return 1;
  return Math.min(1, Math.max(0, (current - baseline) / (target - baseline)));
}

/** Share of the time from start to the milestone that has passed, clamped to 0–1. */
export function elapsedPct(
  startDate: LocalDate,
  milestoneDate: LocalDate,
  today: LocalDate,
): number {
  const total = daysBetween(startDate, milestoneDate);
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, daysBetween(startDate, today) / total));
}

export interface LiftProgress {
  exerciseId: string;
  name: string;
  baseline: number | null;
  current: number | null;
  target: number;
  pct: number;
  onTrack: boolean;
}

export interface MilestoneProgress {
  goalId: string;
  name: string;
  date: LocalDate;
  daysLeft: number;
  elapsed: number;
  lifts: LiftProgress[];
  onTrackCount: number;
}

export function milestoneProgress(
  goal: Goal,
  exercises: Exercise[],
  sessions: Session[],
  startDate: LocalDate,
  today: LocalDate,
): MilestoneProgress {
  const elapsed = elapsedPct(startDate, goal.date, today);
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const lifts: LiftProgress[] = [];
  for (const t of goal.liftTargets) {
    const ex = byId.get(t.exerciseId);
    if (!ex) continue;
    const baseline = baselineFor(ex.id, sessions, startDate);
    const current = bestResult(ex.id, sessions, addDays(today, -(CURRENT_WINDOW_DAYS - 1)), today);
    const target = targetValue(ex.type, t);
    const pct = milestonePct(baseline, current, target);
    lifts.push({
      exerciseId: ex.id,
      name: ex.name,
      baseline,
      current,
      target,
      pct,
      onTrack: pct >= elapsed,
    });
  }
  return {
    goalId: goal.id,
    name: goal.name,
    date: goal.date,
    daysLeft: daysBetween(today, goal.date),
    elapsed,
    lifts,
    onTrackCount: lifts.filter((l) => l.onTrack).length,
  };
}
