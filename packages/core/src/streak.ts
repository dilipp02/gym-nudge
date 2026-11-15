import { isTrainingDay } from './days';
import type { DayRecord, LocalDate } from './types';

const finalized = (days: DayRecord[]) =>
  days.filter((d) => d.status !== 'pending').sort((a, b) => (a.localDate < b.localDate ? -1 : 1));

/**
 * Streak (spec §7.5): +1 for trained, rescue, or rest with a walk. Resets on skip
 * or rest without a walk. Pause freezes it.
 */
export function streak(days: DayRecord[]): { current: number; best: number } {
  let current = 0;
  let best = 0;
  for (const d of finalized(days)) {
    if (isTrainingDay(d.status) || (d.status === 'rest' && d.walkLogged)) current++;
    else if (d.status === 'pause') continue;
    else current = 0;
    best = Math.max(best, current);
  }
  return { current, best };
}

/** Skips in a row at the end of the history (pauses are passed over). */
export function trailingSkips(days: DayRecord[]): number {
  let n = 0;
  const list = finalized(days);
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i]!.status;
    if (s === 'pause') continue;
    if (s !== 'skip') break;
    n++;
  }
  return n;
}

/** A break is 7+ non-training days in a row; pause days neither count nor end it (spec §7.6). */
export const BREAK_DAYS = 7;

export interface Break {
  start: LocalDate;
  end: LocalDate;
  length: number;
  startedWithDoubleSkip: boolean;
  /** True when the break runs up to the latest day (still going). */
  ongoing: boolean;
}

export function breaks(days: DayRecord[]): Break[] {
  const list = finalized(days);
  const out: Break[] = [];
  let run: DayRecord[] = [];
  const close = (ongoing: boolean) => {
    if (run.length >= BREAK_DAYS) {
      out.push({
        start: run[0]!.localDate,
        end: run[run.length - 1]!.localDate,
        length: run.length,
        startedWithDoubleSkip: run[0]!.status === 'skip' && run[1]!.status === 'skip',
        ongoing,
      });
    }
    run = [];
  };
  for (const d of list) {
    if (d.status === 'pause') continue;
    if (isTrainingDay(d.status)) close(false);
    else run.push(d);
  }
  close(true);
  return out;
}

/** How many of the last few breaks to look at. */
export const PATTERN_LOOKBACK = 5;

/**
 * On the second skip in a row, how many of the user's past breaks began the
 * same way. Null unless there are at least 2 finished breaks on record.
 */
export function patternWarning(days: DayRecord[]): { k: number; n: number } | null {
  if (trailingSkips(days) !== 2) return null;
  const past = breaks(days)
    .filter((b) => !b.ongoing)
    .slice(-PATTERN_LOOKBACK);
  if (past.length < 2) return null;
  return { k: past.filter((b) => b.startedWithDoubleSkip).length, n: past.length };
}
