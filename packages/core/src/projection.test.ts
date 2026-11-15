import { describe, expect, it } from 'vitest';
import { SKIP_COST_DAYS, plannedSessions, project } from './projection';
import { addDays } from './time';
import type { DayRecord, DayStatus } from './types';

const START = '2026-11-16';
const PRIMARY = '2027-04-15';

function days(code: string): DayRecord[] {
  const map: Record<string, DayStatus> = {
    T: 'trained',
    R: 'rescue',
    r: 'rest',
    S: 'skip',
    P: 'pause',
  };
  return [...code].map((c, i) => ({
    localDate: addDays(START, i),
    status: map[c]!,
    walkLogged: false,
  }));
}
const asOfFor = (code: string) => addDays(START, code.length - 1);
const run = (code: string) =>
  project({ startDate: START, primaryDate: PRIMARY, days: days(code), asOf: asOfFor(code) });

describe('plannedSessions', () => {
  it('is 6 per week across start…primary inclusive', () => {
    expect(plannedSessions(START, PRIMARY)).toBeCloseTo((6 * 151) / 7);
    expect(plannedSessions(START, addDays(START, 6))).toBe(6);
  });
});

describe('project: on-plan date (headline)', () => {
  it('starts exactly on target', () => {
    const p = project({
      startDate: START,
      primaryDate: PRIMARY,
      days: [],
      asOf: addDays(START, -1),
    });
    expect(p.daysVsTarget).toBeCloseTo(0);
    expect(p.onPlan).toBe(PRIMARY);
  });

  it('a perfect week (6 sessions + 1 rest) stays on target', () => {
    const p = run('TTTTTTr');
    expect(p.daysVsTarget).toBeCloseTo(0);
    expect(p.onPlan).toBe(PRIMARY);
  });

  it('each skip costs 7/6 ≈ 1.17 days', () => {
    expect(run('TTTTTSr').daysVsTarget).toBeCloseTo(SKIP_COST_DAYS);
    expect(run('TTSTTSr').daysVsTarget).toBeCloseTo(2 * SKIP_COST_DAYS);
    expect(run('TTTTTSr').onPlan).toBe('2027-04-17'); // ceil of +1.17
  });

  it('a skip costs the same early and late in the plan', () => {
    const early = run('TTTTTSr').daysVsTarget;
    const late = run('TTTTTTr'.repeat(10) + 'TTTTTSr').daysVsTarget;
    expect(late).toBeCloseTo(early);
  });

  it('pause days move the date (the sessions really did not happen)', () => {
    expect(run('TTTTTTr' + 'PPP').daysVsTarget).toBeCloseTo(3);
  });

  it('rescue sessions count like morning ones', () => {
    expect(run('TTRTTTr').daysVsTarget).toBeCloseTo(0);
  });

  it('an extra session (no rest day) moves it earlier', () => {
    expect(run('TTTTTTT').daysVsTarget).toBeCloseTo(-SKIP_COST_DAYS);
  });

  it('never goes below zero remaining', () => {
    const p = run('T'.repeat(160));
    expect(p.remaining).toBe(0);
  });
});

describe('project: at-pace date (secondary)', () => {
  it('uses the planned rate for the first 6 days', () => {
    expect(run('TTS').paceRate).toBe(6);
  });

  it('uses the last 28 days once there are enough', () => {
    expect(run('TTTTTSr').paceRate).toBeCloseTo(5);
    expect(run('TTTTTTr'.repeat(4)).paceRate).toBeCloseTo(6);
    expect(run('SSSSSSS'.repeat(4)).paceRate).toBeNull();
    expect(run('SSSSSSS'.repeat(4)).atPace).toBeNull();
  });

  it('is far more volatile than the on-plan date (why it is not the headline)', () => {
    const p = run('TTTTTSr');
    // One skip in week 1: on plan +1.2 days, at pace about +29 days.
    expect(p.daysVsTarget).toBeCloseTo(1.17, 1);
    expect(p.atPace! > addDays(PRIMARY, 25)).toBe(true);
  });
});
