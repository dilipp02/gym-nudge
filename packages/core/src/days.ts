import { addDays, hhmmToMinutes, localDate, localMinutes } from './time';
import type { DayRecord, DayStatus, LocalDate, Pause, Session, Settings } from './types';

export function isPaused(date: LocalDate, pauses: Pause[]): boolean {
  return pauses.some((p) => p.startDate <= date && (p.endDate == null || date <= p.endDate));
}

/** Date of a rest day already used in the 6 days before `date`, or null if rest is available. */
export function restUsedWithin(date: LocalDate, priorDays: DayRecord[]): LocalDate | null {
  const from = addDays(date, -6);
  let latest: LocalDate | null = null;
  for (const d of priorDays) {
    if (d.status === 'rest' && d.localDate >= from && d.localDate < date) {
      if (!latest || d.localDate > latest) latest = d.localDate;
    }
  }
  return latest;
}

export interface ClassifyInput {
  date: LocalDate;
  /** Sessions logged for this date. */
  sessions: Session[];
  /** UTC ISO time of the "I'm here" tap, if any (server clock). */
  checkedInAt: string | null;
  pauses: Pause[];
  /** Finalized records of earlier days (at least the previous 6). */
  priorDays: DayRecord[];
  settings: Pick<Settings, 'timezone' | 'checkinEnd' | 'rescueCutoff'>;
}

/**
 * Day verdict (spec §7.4), first match wins:
 * trained → rescue → pause → rest → skip.
 *
 * A day needs a logged session to count as trained or rescue; a check-in alone
 * never protects it. If the check-in tap is missing, the time the session was
 * saved stands in for it (so forgetting to tap costs at most the morning credit).
 */
export function classifyDay(input: ClassifyInput): Exclude<DayStatus, 'pending'> {
  const { date, sessions, settings } = input;
  const tz = settings.timezone;

  if (sessions.length > 0) {
    const firstLog = sessions.map((s) => s.loggedAt).sort()[0]!;
    const checkin = new Date(input.checkedInAt ?? firstLog);
    const checkinDate = localDate(checkin, tz);
    const mins = checkinDate === date ? localMinutes(checkin, tz) : Number.POSITIVE_INFINITY;
    if (checkinDate < date || mins <= hhmmToMinutes(settings.checkinEnd)) return 'trained';
    if (mins <= hhmmToMinutes(settings.rescueCutoff)) return 'rescue';
  }
  if (isPaused(date, input.pauses)) return 'pause';
  if (restUsedWithin(date, input.priorDays) == null) return 'rest';
  return 'skip';
}

export const isTrainingDay = (s: DayStatus) => s === 'trained' || s === 'rescue';
