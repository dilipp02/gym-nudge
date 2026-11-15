import { daysBetween } from './time';
import type { Exercise, ExerciseType, LocalDate, LoggedSet, Session, Stack } from './types';

/** First 14 days run at about two-thirds of the planned sets (spec §3). */
export const RAMP_DAYS = 14;

export function isRampDay(startDate: LocalDate, today: LocalDate): boolean {
  const d = daysBetween(startDate, today);
  return d >= 0 && d < RAMP_DAYS;
}

export function plannedSetCount(ex: Exercise, startDate: LocalDate, today: LocalDate): number {
  return isRampDay(startDate, today) ? Math.max(1, Math.round((ex.sets * 2) / 3)) : ex.sets;
}

export interface PlannedSet {
  weight: number | null;
  reps: number | null;
  seconds: number | null;
}

export interface PlannedExercise {
  exerciseId: string;
  name: string;
  type: ExerciseType;
  isKeyLift: boolean;
  sets: PlannedSet[];
  /** True when the plan asks for more than last time. */
  progressed: boolean;
}

/** All logged sets (including skipped) for an exercise in its most recent session before `before`. */
export function lastSetsFor(
  exerciseId: string,
  sessions: Session[],
  before: LocalDate,
): LoggedSet[] | null {
  let best: Session | null = null;
  for (const s of sessions) {
    if (s.localDate >= before) continue;
    if (!s.sets.some((x) => x.exerciseId === exerciseId && !x.skipped)) continue;
    if (
      !best ||
      s.localDate > best.localDate ||
      (s.localDate === best.localDate && s.loggedAt > best.loggedAt)
    ) {
      best = s;
    }
  }
  if (!best) return null;
  return best.sets
    .filter((x) => x.exerciseId === exerciseId)
    .sort((a, b) => a.setIndex - b.setIndex);
}

/**
 * What to prefill next time (spec §7.7).
 * - weighted: every set reached `repMax` (and none skipped) → +`weightStep`, reps back to `repMin`;
 *   otherwise same weight, same reps as last time.
 * - bodyweight: last reps + 1 per set.
 * - timed: last seconds + `weightStep` per set.
 */
export function suggestNext(
  ex: Exercise,
  last: LoggedSet[] | null,
  count: number,
): { sets: PlannedSet[]; progressed: boolean } {
  const done = (last ?? []).filter((s) => !s.skipped);
  const at = (i: number) => done[Math.min(i, done.length - 1)];

  if (ex.type === 'weighted') {
    if (done.length === 0) {
      return {
        sets: Array.from({ length: count }, () => ({
          weight: ex.startWeight,
          reps: ex.repMin,
          seconds: null,
        })),
        progressed: false,
      };
    }
    const working = Math.max(...done.map((s) => s.weight ?? 0));
    const top = done.filter((s) => (s.weight ?? 0) === working);
    const anySkipped = (last ?? []).some((s) => s.skipped);
    const allTop = !anySkipped && done.every((s) => (s.reps ?? 0) >= ex.repMax);
    if (allTop) {
      return {
        sets: Array.from({ length: count }, () => ({
          weight: working + ex.weightStep,
          reps: ex.repMin,
          seconds: null,
        })),
        progressed: true,
      };
    }
    const fallbackReps = Math.min(...top.map((s) => s.reps ?? ex.repMin));
    return {
      sets: Array.from({ length: count }, (_, i) => {
        const prev = done[i];
        const reps =
          prev && (prev.weight ?? 0) === working ? (prev.reps ?? fallbackReps) : fallbackReps;
        return { weight: working, reps, seconds: null };
      }),
      progressed: false,
    };
  }

  if (ex.type === 'bodyweight') {
    if (done.length === 0) {
      return {
        sets: Array.from({ length: count }, () => ({
          weight: null,
          reps: ex.repMin,
          seconds: null,
        })),
        progressed: false,
      };
    }
    return {
      sets: Array.from({ length: count }, (_, i) => ({
        weight: at(i)!.weight,
        reps: (at(i)!.reps ?? ex.repMin - 1) + 1,
        seconds: null,
      })),
      progressed: true,
    };
  }

  // timed
  if (done.length === 0) {
    const first = ex.startWeight ?? ex.repMin;
    return {
      sets: Array.from({ length: count }, () => ({ weight: null, reps: null, seconds: first })),
      progressed: false,
    };
  }
  return {
    sets: Array.from({ length: count }, (_, i) => ({
      weight: null,
      reps: null,
      seconds: (at(i)!.seconds ?? ex.repMin) + ex.weightStep,
    })),
    progressed: true,
  };
}

/** The prefilled log for a stack (plus its add-ons) on `today`. */
export function buildPlan(
  stack: Stack,
  addons: Stack[],
  sessions: Session[],
  startDate: LocalDate,
  today: LocalDate,
): PlannedExercise[] {
  const exercises = [stack, ...addons].flatMap((s) =>
    [...s.exercises].sort((a, b) => a.position - b.position),
  );
  return exercises.map((ex) => {
    const count = plannedSetCount(ex, startDate, today);
    const { sets, progressed } = suggestNext(ex, lastSetsFor(ex.id, sessions, today), count);
    return {
      exerciseId: ex.id,
      name: ex.name,
      type: ex.type,
      isKeyLift: ex.isKeyLift,
      sets,
      progressed,
    };
  });
}
