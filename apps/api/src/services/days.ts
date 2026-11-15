// Day verdicts (spec §7.4, §8.1 step 4). Idempotent: running again recomputes the same result.
import {
  SKIP_COST_DAYS,
  addDays,
  classifyDay,
  type DayRecord,
  type LocalDate,
} from '@gym-nudge/core';
import { emptyDay, upsertDayStatement, type DayRow } from '../db/repo';
import { lastDueDate, sessionsOn, type UserState } from './state';

/**
 * Finalize every day whose verdict time has passed and that isn't final yet.
 * With `from`, recompute that day and every later due day (after a late log can
 * change a verdict, later rest/skip decisions may change too).
 * Mutates `state.days` to match what was written. Returns the dates written.
 */
export async function finalizeDays(
  db: D1Database,
  state: UserState,
  now: Date,
  opts: { from?: LocalDate } = {},
): Promise<LocalDate[]> {
  const due = lastDueDate(state, now);
  const byDate = new Map(state.days.map((d) => [d.localDate, d]));
  const prior: DayRecord[] = [];
  const stmts: D1PreparedStatement[] = [];
  const written: LocalDate[] = [];
  const nowIso = now.toISOString();

  for (let d = state.user.startDate; d <= due; d = addDays(d, 1)) {
    const row: DayRow = byDate.get(d) ?? emptyDay(d);
    const recompute = opts.from ? d >= opts.from : row.finalizedAt == null;
    if (!recompute) {
      if (row.status !== 'pending')
        prior.push({ localDate: d, status: row.status, walkLogged: row.walkLogged });
      continue;
    }
    const status = classifyDay({
      date: d,
      sessions: sessionsOn(state, d),
      checkedInAt: row.checkedInAt,
      pauses: state.pauses,
      priorDays: prior,
      settings: state.settings,
    });
    const skipCostDays = status === 'skip' ? SKIP_COST_DAYS : 0;
    stmts.push(
      upsertDayStatement(db, state.user.id, d, { status, skipCostDays, finalizedAt: nowIso }),
    );
    const updated: DayRow = { ...row, status, skipCostDays, finalizedAt: nowIso };
    byDate.set(d, updated);
    prior.push({ localDate: d, status, walkLogged: row.walkLogged });
    written.push(d);
  }

  if (stmts.length) {
    for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
  }
  state.days = [...byDate.values()].sort((a, b) => (a.localDate < b.localDate ? -1 : 1));
  return written;
}
