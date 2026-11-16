// Confirm-then-fix logging state (spec §9.1.2), kept pure for testing.
import type { ExerciseType, PlannedExercise } from '../api/types';

export interface EditSet {
  weight: number | null;
  reps: number | null;
  seconds: number | null;
}

export interface EditExercise {
  exerciseId: string;
  name: string;
  type: ExerciseType;
  isKeyLift: boolean;
  progressed: boolean;
  planned: EditSet[];
  sets: EditSet[];
  skipped: boolean;
}

export function initLog(plan: PlannedExercise[]): EditExercise[] {
  return plan.map((p) => ({
    exerciseId: p.exerciseId,
    name: p.name,
    type: p.type,
    isKeyLift: p.isKeyLift,
    progressed: p.progressed,
    planned: p.sets.map((s) => ({ ...s })),
    sets: p.sets.map((s) => ({ ...s })),
    skipped: false,
  }));
}

const sameSet = (a: EditSet, b: EditSet) =>
  a.weight === b.weight && a.reps === b.reps && a.seconds === b.seconds;

export function isEdited(e: EditExercise): boolean {
  return (
    e.skipped ||
    e.sets.length !== e.planned.length ||
    e.sets.some((s, i) => !sameSet(s, e.planned[i]!))
  );
}

/** Short summary, e.g. `60 × 8 × 3`, `BW × 7, 6, 6`, `45s × 3`. */
export function summary(e: EditExercise): string {
  if (e.skipped) return 'skipped';
  const s = e.sets;
  if (s.length === 0) return '—';
  const allSame = s.every((x) => sameSet(x, s[0]!));
  if (e.type === 'timed') {
    return allSame
      ? `${s[0]!.seconds ?? 0}s × ${s.length}`
      : s.map((x) => `${x.seconds ?? 0}s`).join(', ');
  }
  const w = (x: EditSet) =>
    e.type === 'bodyweight' ? (x.weight ? `BW+${x.weight}` : 'BW') : String(x.weight ?? 0);
  if (allSame) return `${w(s[0]!)} × ${s[0]!.reps ?? 0} × ${s.length}`;
  const sameWeight = s.every((x) => x.weight === s[0]!.weight);
  return sameWeight
    ? `${w(s[0]!)} × ${s.map((x) => x.reps ?? 0).join(', ')}`
    : s.map((x) => `${w(x)}×${x.reps ?? 0}`).join(', ');
}

export interface SessionPayload {
  id: string;
  localDate: string;
  stackId: string;
  performedAt: string;
  sets: Array<{
    exerciseId: string;
    setIndex: number;
    weight: number | null;
    reps: number | null;
    seconds: number | null;
    skipped: boolean;
  }>;
}

export function toPayload(
  id: string,
  localDate: string,
  stackId: string,
  exercises: EditExercise[],
  performedAt: Date,
): SessionPayload {
  return {
    id,
    localDate,
    stackId,
    performedAt: performedAt.toISOString(),
    sets: exercises.flatMap<SessionPayload['sets'][number]>((e) =>
      e.skipped
        ? e.planned.map((_, setIndex) => ({
            exerciseId: e.exerciseId,
            setIndex,
            weight: null,
            reps: null,
            seconds: null,
            skipped: true,
          }))
        : e.sets.map((s, setIndex) => ({
            exerciseId: e.exerciseId,
            setIndex,
            weight: e.type === 'timed' ? null : s.weight,
            reps: e.type === 'timed' ? null : s.reps,
            seconds: e.type === 'timed' ? s.seconds : null,
            skipped: false,
          })),
    ),
  };
}
