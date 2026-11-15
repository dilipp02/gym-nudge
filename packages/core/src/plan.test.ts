import { describe, expect, it } from 'vitest';
import { bwsets, exercise, session, skippedSets, stack, tsets, wsets } from './fixtures';
import { buildPlan, isRampDay, lastSetsFor, plannedSetCount, suggestNext } from './plan';

const START = '2026-11-16';

describe('ramp-up', () => {
  it('uses two-thirds of the sets for the first 14 days', () => {
    const ex4 = exercise({ sets: 4 });
    const ex2 = exercise({ sets: 2 });
    expect(isRampDay(START, '2026-11-16')).toBe(true);
    expect(isRampDay(START, '2026-11-29')).toBe(true); // day 13
    expect(isRampDay(START, '2026-11-30')).toBe(false); // day 14
    expect(plannedSetCount(ex4, START, '2026-11-29')).toBe(3);
    expect(plannedSetCount(ex4, START, '2026-11-30')).toBe(4);
    expect(plannedSetCount(exercise({ sets: 3 }), START, START)).toBe(2);
    expect(plannedSetCount(ex2, START, START)).toBe(1);
    expect(plannedSetCount(exercise({ sets: 1 }), START, START)).toBe(1);
  });
});

describe('suggestNext', () => {
  it('weighted, no history → starting weight at the bottom of the range', () => {
    const ex = exercise({ startWeight: 55, repMin: 6, repMax: 8 });
    expect(suggestNext(ex, null, 3)).toEqual({
      sets: [
        { weight: 55, reps: 6, seconds: null },
        { weight: 55, reps: 6, seconds: null },
        { weight: 55, reps: 6, seconds: null },
      ],
      progressed: false,
    });
  });

  it('weighted, every set at the top of the range → add the weight step', () => {
    const ex = exercise({ repMin: 8, repMax: 10, weightStep: 2.5 });
    const res = suggestNext(
      ex,
      wsets(ex, [
        [60, 10],
        [60, 10],
        [60, 11],
      ]),
      3,
    );
    expect(res.progressed).toBe(true);
    expect(res.sets.every((s) => s.weight === 62.5 && s.reps === 8)).toBe(true);
  });

  it('weighted, a set short of the top → same weight and same reps', () => {
    const ex = exercise({ repMin: 8, repMax: 10 });
    const res = suggestNext(
      ex,
      wsets(ex, [
        [60, 10],
        [60, 9],
        [60, 8],
      ]),
      3,
    );
    expect(res.progressed).toBe(false);
    expect(res.sets.map((s) => [s.weight, s.reps])).toEqual([
      [60, 10],
      [60, 9],
      [60, 8],
    ]);
  });

  it('weighted, a skipped set blocks progression', () => {
    const ex = exercise({ repMin: 5, repMax: 5, weightStep: 5 });
    const last = [
      ...wsets(ex, [
        [100, 5],
        [100, 5],
      ]),
      { ...skippedSets(ex, 1)[0]!, setIndex: 2 },
    ];
    expect(suggestNext(ex, last, 3).progressed).toBe(false);
  });

  it('deadlift 3×5 with +5 kg step', () => {
    const ex = exercise({ repMin: 5, repMax: 5, weightStep: 5 });
    const res = suggestNext(
      ex,
      wsets(ex, [
        [100, 5],
        [100, 5],
        [100, 5],
      ]),
      3,
    );
    expect(res.sets[0]).toEqual({ weight: 105, reps: 5, seconds: null });
  });

  it('bodyweight → one more rep per set', () => {
    const ex = exercise({ type: 'bodyweight', repMin: 5, repMax: 10 });
    expect(suggestNext(ex, bwsets(ex, [6, 6, 5]), 3).sets.map((s) => s.reps)).toEqual([7, 7, 6]);
    expect(suggestNext(ex, null, 2).sets.map((s) => s.reps)).toEqual([5, 5]);
  });

  it('timed → seconds plus the step', () => {
    const ex = exercise({
      type: 'timed',
      repMin: 45,
      repMax: 60,
      weightStep: 5,
      startWeight: null,
    });
    expect(suggestNext(ex, tsets(ex, [45, 50, 45]), 3).sets.map((s) => s.seconds)).toEqual([
      50, 55, 50,
    ]);
    expect(suggestNext(ex, null, 1).sets[0]!.seconds).toBe(45);
  });

  it('more planned sets than last time repeats the last set', () => {
    const ex = exercise({ type: 'bodyweight', repMin: 5, repMax: 10 });
    expect(suggestNext(ex, bwsets(ex, [6, 6]), 3).sets.map((s) => s.reps)).toEqual([7, 7, 7]);
  });
});

describe('lastSetsFor and buildPlan', () => {
  const bench = exercise({
    name: 'Bench',
    sets: 4,
    repMin: 5,
    repMax: 8,
    startWeight: 50,
    isKeyLift: true,
    position: 0,
  });
  const fly = exercise({ name: 'Fly', sets: 3, position: 1 });
  const plank = exercise({
    name: 'Plank',
    type: 'timed',
    sets: 3,
    repMin: 45,
    repMax: 60,
    weightStep: 5,
    startWeight: 45,
    position: 0,
  });
  const push = stack({ id: 'push', exercises: [fly, bench] });
  const abs = stack({ id: 'abs', isAddon: true, exercises: [plank] });

  it('finds the latest earlier session that trained the exercise', () => {
    const sessions = [
      session('2026-11-17', 'push', wsets(bench, [[50, 8]])),
      session('2026-11-20', 'push', wsets(bench, [[52.5, 6]])),
      session('2026-11-23', 'push', skippedSets(bench, 1)),
      session('2026-11-24', 'push', wsets(bench, [[55, 5]])),
    ];
    expect(lastSetsFor(bench.id, sessions, '2026-11-24')![0]!.weight).toBe(52.5);
    expect(lastSetsFor(bench.id, sessions, '2026-11-17')).toBeNull();
  });

  it('orders exercises by position, appends add-ons, applies the ramp', () => {
    const plan = buildPlan(push, [abs], [], START, START);
    expect(plan.map((p) => p.name)).toEqual(['Bench', 'Fly', 'Plank']);
    expect(plan[0]!.sets).toHaveLength(3); // 4 sets ramped
    expect(plan[0]!.sets[0]).toEqual({ weight: 50, reps: 5, seconds: null });
    expect(plan[2]!.sets[0]!.seconds).toBe(45);
    expect(plan[0]!.isKeyLift).toBe(true);
  });
});
