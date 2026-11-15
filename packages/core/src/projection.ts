import { isTrainingDay } from './days';
import { addDays, daysBetween } from './time';
import { SESSIONS_PER_WEEK, type DayRecord, type LocalDate } from './types';

/** Window for the "current pace" rate (spec §7.3). */
export const PACE_WINDOW_DAYS = 28;
const MIN_PACE_WINDOW = 7;

/** Sessions the plan calls for from `startDate` through `primaryDate` (fractional on purpose). */
export function plannedSessions(startDate: LocalDate, primaryDate: LocalDate): number {
  return (SESSIONS_PER_WEEK * (daysBetween(startDate, primaryDate) + 1)) / 7;
}

/** Days one skip costs against training that day: 7 ÷ 6 ≈ 1.17. */
export const SKIP_COST_DAYS = 7 / SESSIONS_PER_WEEK;

export interface Projection {
  planned: number;
  done: number;
  remaining: number;
  /** Finish date if you follow the plan (6/week) from tomorrow. */
  onPlan: LocalDate;
  /** Days ahead (−) or behind (+) the primary target date, one decimal of precision is meaningful. */
  daysVsTarget: number;
  /** Sessions/week over the last ≤28 days (capped at 6), or null with no sessions. */
  paceRate: number | null;
  /** Finish date if your recent pace continues; null when pace is 0. */
  atPace: LocalDate | null;
}

/**
 * Goal-date projection, as of the end of `asOf` (the last finalized day).
 *
 * Headline ("on plan"): remaining sessions at the planned 6/week, starting tomorrow.
 * A trained day moves it 1/6 day earlier, a planned rest day leaves a full week
 * neutral, and a skip moves it ≈1.17 days later. `daysVsTarget` is therefore the
 * running total of what skips (and pauses) have cost, minus any extra sessions.
 *
 * Secondary ("at pace"): remaining sessions at the last-28-day rate. It reacts
 * strongly to recent days, so it's shown as context, never as the skip cost.
 */
export function project(input: {
  startDate: LocalDate;
  primaryDate: LocalDate;
  days: DayRecord[];
  asOf: LocalDate;
}): Projection {
  const { startDate, primaryDate, asOf } = input;
  const counted = input.days.filter((d) => d.localDate >= startDate && d.localDate <= asOf);
  const done = counted.filter((d) => isTrainingDay(d.status)).length;
  const planned = plannedSessions(startDate, primaryDate);
  const remaining = Math.max(0, planned - done);

  const onPlanDays = (remaining * 7) / SESSIONS_PER_WEEK;
  const onPlan = addDays(asOf, Math.ceil(onPlanDays - 1e-9));
  const daysVsTarget = daysBetween(primaryDate, asOf) + onPlanDays;

  const elapsed = daysBetween(startDate, asOf) + 1;
  const window = Math.min(PACE_WINDOW_DAYS, elapsed);
  let paceRate: number | null;
  if (window < MIN_PACE_WINDOW) {
    paceRate = SESSIONS_PER_WEEK;
  } else {
    const from = addDays(asOf, -(window - 1));
    const inWindow = counted.filter((d) => d.localDate >= from && isTrainingDay(d.status)).length;
    const rate = Math.min(SESSIONS_PER_WEEK, (inWindow * 7) / window);
    paceRate = rate > 0 ? rate : null;
  }
  const atPace =
    paceRate == null ? null : addDays(asOf, Math.ceil((remaining / paceRate) * 7 - 1e-9));

  return { planned, done, remaining, onPlan, daysVsTarget, paceRate, atPace };
}
