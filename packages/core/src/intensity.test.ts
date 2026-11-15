import { describe, expect, it } from 'vitest';
import { bwsets, exercise, session, skippedSets, tsets, wsets } from './fixtures';
import { exerciseVolume, intensity } from './intensity';

const bench = exercise({ name: 'Bench' });
const row = exercise({ name: 'Row' });
const pullups = exercise({ name: 'Pull-ups', type: 'bodyweight' });
const plank = exercise({ name: 'Plank', type: 'timed' });

describe('exerciseVolume', () => {
  it('handles each exercise type and ignores skipped sets', () => {
    expect(
      exerciseVolume(
        wsets(bench, [
          [60, 10],
          [60, 8],
        ]),
        76,
      ),
    ).toBe(1080);
    expect(exerciseVolume(bwsets(pullups, [6, 5]), 76)).toBe(76 * 11);
    expect(exerciseVolume(bwsets(pullups, [5], 10), 76)).toBe(86 * 5);
    expect(exerciseVolume(tsets(plank, [45, 60]), 76)).toBe(105);
    expect(exerciseVolume(skippedSets(bench, 3), 76)).toBe(0);
  });
});

describe('intensity', () => {
  it('first session ever: full completion + neutral volume and progression', () => {
    const s = session(
      '2026-11-16',
      'push',
      wsets(bench, [
        [60, 8],
        [60, 8],
      ]),
    );
    expect(intensity({ session: s, plannedSetsTotal: 2, history: [], bodyweightKg: 76 })).toEqual({
      score: 75,
      completion: 50,
      volume: 15,
      progression: 10,
    });
  });

  it('completion counts non-skipped sets against the plan', () => {
    const s = session('2026-11-16', 'push', [...wsets(bench, [[60, 8]]), ...skippedSets(row, 3)]);
    expect(
      intensity({ session: s, plannedSetsTotal: 4, history: [], bodyweightKg: 76 }).completion,
    ).toBe(12.5);
  });

  it('volume boundaries: ≤80% → 0, ≥115% → 30', () => {
    const past = [session('2026-11-10', 'push', wsets(bench, [[100, 10]]))]; // 1000
    const at = (kg: number) =>
      intensity({
        session: session('2026-11-17', 'push', wsets(bench, [[kg, 10]])),
        plannedSetsTotal: 1,
        history: past,
        bodyweightKg: 76,
      }).volume;
    expect(at(80)).toBe(0);
    expect(at(70)).toBe(0);
    expect(at(115)).toBeCloseTo(30);
    expect(at(130)).toBe(30);
    expect(at(97.5)).toBeCloseTo((30 * (0.975 - 0.8)) / 0.35);
  });

  it('averages only the last 4 sessions of each exercise', () => {
    const history = [
      session('2026-11-01', 'push', wsets(bench, [[1000, 1]])), // too old to count
      session('2026-11-03', 'push', wsets(bench, [[100, 1]])),
      session('2026-11-05', 'push', wsets(bench, [[100, 1]])),
      session('2026-11-07', 'push', wsets(bench, [[100, 1]])),
      session('2026-11-09', 'push', wsets(bench, [[100, 1]])),
    ];
    const r = intensity({
      session: session('2026-11-11', 'push', wsets(bench, [[115, 1]])),
      plannedSetsTotal: 1,
      history,
      bodyweightKg: 76,
    });
    expect(r.volume).toBeCloseTo(30);
  });

  it('progression: share of exercises that beat last time', () => {
    const history = [
      session('2026-11-10', 'pull', [
        ...wsets(bench, [[60, 8]]),
        ...wsets(row, [[50, 10]]),
        ...bwsets(pullups, [6]),
      ]),
    ];
    const r = intensity({
      session: session('2026-11-13', 'pull', [
        ...wsets(bench, [[60, 9]]), // more reps, same weight → beat
        ...wsets(row, [[50, 10]]), // equal → not beaten
        ...bwsets(pullups, [7]), // more reps → beat
      ]),
      plannedSetsTotal: 3,
      history,
      bodyweightKg: 76,
    });
    expect(r.progression).toBeCloseTo((20 * 2) / 3);
  });

  it('heavier weight beats more reps at a lighter weight', () => {
    const history = [session('2026-11-10', 'push', wsets(bench, [[60, 10]]))];
    const r = intensity({
      session: session('2026-11-13', 'push', wsets(bench, [[62.5, 6]])),
      plannedSetsTotal: 1,
      history,
      bodyweightKg: 76,
    });
    expect(r.progression).toBe(20);
  });

  it('ignores an exercise skipped entirely today in the volume average', () => {
    const history = [
      session('2026-11-10', 'push', [...wsets(bench, [[100, 10]]), ...wsets(row, [[50, 10]])]),
    ];
    const r = intensity({
      session: session('2026-11-13', 'push', [
        ...wsets(bench, [[115, 10]]),
        ...skippedSets(row, 1),
      ]),
      plannedSetsTotal: 2,
      history,
      bodyweightKg: 76,
    });
    expect(r.volume).toBeCloseTo(30);
    expect(r.completion).toBe(25);
  });
});
