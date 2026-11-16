import { describe, expect, it } from 'vitest';
import { bwsets, exercise, session, skippedSets, wsets } from './fixtures';
import {
  baselineFor,
  bestResult,
  e1rm,
  elapsedPct,
  milestonePct,
  milestoneProgress,
  targetValue,
} from './strength';
import type { Goal } from './types';

const START = '2026-11-16';

describe('e1rm and targets', () => {
  it('uses the Epley formula', () => {
    expect(e1rm(100, 5)).toBeCloseTo(116.667, 3);
    expect(e1rm(60, 10)).toBeCloseTo(80, 6);
  });

  it('weighted targets are e1RM; bodyweight targets are reps', () => {
    expect(
      targetValue('weighted', { exerciseId: 'x', targetWeight: 80, targetReps: 5 }),
    ).toBeCloseTo(93.333, 3);
    expect(targetValue('bodyweight', { exerciseId: 'x', targetWeight: null, targetReps: 10 })).toBe(
      10,
    );
  });
});

describe('milestone maths', () => {
  it('clamps progress to 0–1', () => {
    expect(milestonePct(60, 70, 80)).toBe(0.5);
    expect(milestonePct(60, 55, 80)).toBe(0);
    expect(milestonePct(60, 90, 80)).toBe(1);
    expect(milestonePct(null, 70, 80)).toBe(0);
    expect(milestonePct(85, 85, 80)).toBe(1); // already past target
  });

  it('measures elapsed time', () => {
    expect(elapsedPct(START, '2026-12-26', '2026-12-06')).toBe(0.5);
    expect(elapsedPct(START, '2026-12-26', '2026-11-01')).toBe(0);
    expect(elapsedPct(START, '2026-12-26', '2027-01-10')).toBe(1);
  });
});

describe('baseline and current best', () => {
  const squat = exercise({ name: 'Squat', repMin: 5, repMax: 8 });
  const pullups = exercise({ name: 'Pull-ups', type: 'bodyweight' });

  it('baseline is the best of week 1', () => {
    const sessions = [
      session('2026-11-17', 's', wsets(squat, [[60, 8]])),
      session('2026-11-20', 's', wsets(squat, [[70, 5]])),
      session('2026-11-24', 's', wsets(squat, [[90, 5]])), // day 8, outside week 1
    ];
    expect(baselineFor(squat.id, sessions, START)).toBeCloseTo(e1rm(70, 5));
  });

  it('falls back to the first recorded result when week 1 has none', () => {
    const sessions = [session('2026-11-28', 's', wsets(squat, [[65, 5]]))];
    expect(baselineFor(squat.id, sessions, START)).toBeCloseTo(e1rm(65, 5));
    expect(baselineFor('nope', sessions, START)).toBeNull();
  });

  it('ignores skipped sets', () => {
    const sessions = [session('2026-11-17', 's', skippedSets(squat, 3))];
    expect(bestResult(squat.id, sessions, START, '2026-11-30')).toBeNull();
  });

  it('current best only looks at the last 14 days', () => {
    const goal: Goal = {
      id: 'g',
      name: 'Wedding 1',
      date: '2026-12-29',
      isPrimary: false,
      liftTargets: [
        { exerciseId: squat.id, targetWeight: 80, targetReps: 5 },
        { exerciseId: pullups.id, targetWeight: null, targetReps: 5 },
      ],
    };
    const sessions = [
      session('2026-11-17', 's', [...wsets(squat, [[60, 5]]), ...bwsets(pullups, [2, 2])]),
      session('2026-11-24', 's', wsets(squat, [[70, 5]])),
      session('2026-12-10', 's', bwsets(pullups, [4, 3])),
    ];
    // On Dec 10 the squat's 70×5 (Nov 24) is 16 days old → no current best.
    const p = milestoneProgress(goal, [squat, pullups], sessions, START, '2026-12-10');
    expect(p.daysLeft).toBe(19);
    expect(p.lifts[0]!.current).toBeNull();
    expect(p.lifts[0]!.pct).toBe(0);
    // Pull-ups: baseline 2, current 4, target 5 → 2/3.
    expect(p.lifts[1]!.pct).toBeCloseTo(2 / 3);
    expect(p.elapsed).toBeCloseTo(24 / 43);
    expect(p.lifts[1]!.onTrack).toBe(true);
    expect(p.onTrackCount).toBe(1);
    expect(p.baselineWeek).toBe(false);
  });

  it('counts every lift as on track during the baseline week', () => {
    const goal: Goal = {
      id: 'g',
      name: 'Wedding 1',
      date: '2026-12-29',
      isPrimary: false,
      liftTargets: [{ exerciseId: squat.id, targetWeight: 80, targetReps: 5 }],
    };
    const sessions = [session('2026-11-17', 's', wsets(squat, [[60, 5]]))];
    const day6 = milestoneProgress(goal, [squat], sessions, START, '2026-11-22');
    expect(day6).toMatchObject({ baselineWeek: true, onTrackCount: 1 });
    expect(day6.lifts[0]!.pct).toBe(0);
    const day7 = milestoneProgress(goal, [squat], sessions, START, '2026-11-23');
    expect(day7).toMatchObject({ baselineWeek: false, onTrackCount: 0 });
  });
});
