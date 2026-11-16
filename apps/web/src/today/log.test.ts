import { describe, expect, it } from 'vitest';
import type { PlannedExercise } from '../api/types';
import { initLog, isEdited, summary, toPayload } from './log';

const plan: PlannedExercise[] = [
  {
    exerciseId: 'dl',
    name: 'Deadlift',
    type: 'weighted',
    isKeyLift: true,
    progressed: true,
    sets: [
      { weight: 105, reps: 5, seconds: null },
      { weight: 105, reps: 5, seconds: null },
    ],
  },
  {
    exerciseId: 'pu',
    name: 'Pull-ups',
    type: 'bodyweight',
    isKeyLift: true,
    progressed: true,
    sets: [
      { weight: null, reps: 7, seconds: null },
      { weight: null, reps: 6, seconds: null },
    ],
  },
  {
    exerciseId: 'plank',
    name: 'Plank',
    type: 'timed',
    isKeyLift: false,
    progressed: false,
    sets: [{ weight: null, reps: null, seconds: 45 }],
  },
];

describe('log helpers', () => {
  it('starts as planned and summarises each exercise', () => {
    const log = initLog(plan);
    expect(log.map(isEdited)).toEqual([false, false, false]);
    expect(log.map(summary)).toEqual(['105 × 5 × 2', 'BW × 7, 6', '45s × 1']);
  });

  it('detects edits and skips', () => {
    const log = initLog(plan);
    log[0]!.sets[1]!.reps = 4;
    log[2]!.skipped = true;
    expect(log.map(isEdited)).toEqual([true, false, true]);
    expect(summary(log[0]!)).toBe('105 × 5, 4');
    expect(summary(log[2]!)).toBe('skipped');
    // Editing must not touch the plan copy.
    expect(log[0]!.planned[1]!.reps).toBe(5);
  });

  it('builds the API payload, expanding skipped exercises into skipped sets', () => {
    const log = initLog(plan);
    log[1]!.skipped = true;
    const p = toPayload('id-1', '2026-11-17', 'pull', log, new Date('2026-11-17T08:10:00Z'));
    expect(p).toMatchObject({
      id: 'id-1',
      localDate: '2026-11-17',
      stackId: 'pull',
      performedAt: '2026-11-17T08:10:00.000Z',
    });
    expect(p.sets).toEqual([
      { exerciseId: 'dl', setIndex: 0, weight: 105, reps: 5, seconds: null, skipped: false },
      { exerciseId: 'dl', setIndex: 1, weight: 105, reps: 5, seconds: null, skipped: false },
      { exerciseId: 'pu', setIndex: 0, weight: null, reps: null, seconds: null, skipped: true },
      { exerciseId: 'pu', setIndex: 1, weight: null, reps: null, seconds: null, skipped: true },
      { exerciseId: 'plank', setIndex: 0, weight: null, reps: null, seconds: 45, skipped: false },
    ]);
  });
});
