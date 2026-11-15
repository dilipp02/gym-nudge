// Test-only builders. Not exported from the package index.
import type { Exercise, LoggedSet, Session, Stack } from './types';

let nextId = 0;
const id = (p: string) => `${p}-${++nextId}`;

export function exercise(over: Partial<Exercise> = {}): Exercise {
  return {
    id: over.id ?? id('ex'),
    stackId: 'stack',
    name: 'Exercise',
    type: 'weighted',
    sets: 3,
    repMin: 8,
    repMax: 10,
    weightStep: 2.5,
    startWeight: 40,
    isKeyLift: false,
    position: 0,
    ...over,
  };
}

export function stack(over: Partial<Stack> = {}): Stack {
  return {
    id: over.id ?? id('stack'),
    name: 'Stack',
    position: 0,
    inRotation: true,
    isAddon: false,
    addonIds: [],
    exercises: [],
    ...over,
  };
}

/** Weighted sets: `[[kg, reps], …]`. */
export function wsets(ex: Exercise, pairs: Array<[number, number]>): LoggedSet[] {
  return pairs.map(([weight, reps], setIndex) => ({
    exerciseId: ex.id,
    type: ex.type,
    setIndex,
    weight,
    reps,
    seconds: null,
    skipped: false,
  }));
}

/** Bodyweight sets by reps, optional added kg. */
export function bwsets(ex: Exercise, reps: number[], added: number | null = null): LoggedSet[] {
  return reps.map((r, setIndex) => ({
    exerciseId: ex.id,
    type: 'bodyweight',
    setIndex,
    weight: added,
    reps: r,
    seconds: null,
    skipped: false,
  }));
}

export function tsets(ex: Exercise, seconds: number[]): LoggedSet[] {
  return seconds.map((s, setIndex) => ({
    exerciseId: ex.id,
    type: 'timed',
    setIndex,
    weight: null,
    reps: null,
    seconds: s,
    skipped: false,
  }));
}

export function skippedSets(ex: Exercise, count: number): LoggedSet[] {
  return Array.from({ length: count }, (_, setIndex) => ({
    exerciseId: ex.id,
    type: ex.type,
    setIndex,
    weight: null,
    reps: null,
    seconds: null,
    skipped: true,
  }));
}

export function session(
  localDate: string,
  stackId: string,
  sets: LoggedSet[],
  loggedAt = `${localDate}T03:00:00Z`,
): Session {
  return { id: id('session'), localDate, stackId, loggedAt, sets };
}
