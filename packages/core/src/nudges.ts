import {
  atLocal,
  hhmmToMinutes,
  localDate,
  localMinutes,
  minutesBetween,
  minutesToHhmm,
} from './time';
import type { HHMM, LocalDate, RuleId, Settings } from './types';

/** A scheduled nudge more than this late is dropped, never sent (spec §8.3). */
export const DROP_AFTER_MIN = 15;
/** At most one snooze response per this many minutes. */
export const SNOOZE_GAP_MIN = 5;

export type ScheduledRule = Exclude<RuleId, 'R4'>;

/** What the engine needs to know about today. */
export interface DayState {
  localDate: LocalDate;
  checkedIn: boolean;
  sessionLogged: boolean;
  restDeclared: boolean;
  paused: boolean;
  /** App opened at or after today's wake time. */
  openedSinceWake: boolean;
  lightsOut: boolean;
}

export interface NudgeState {
  settings: Settings;
  day: DayState;
  /** Rules already sent for `day.localDate` (from nudge_log). */
  sentToday: ReadonlySet<RuleId>;
  lastSnoozeNudgeAt: Date | null;
}

/** Local time each scheduled rule fires (spec §8.2). R5/R6 derive from wake and check-in end. */
export function ruleTimes(s: Settings): Record<ScheduledRule, HHMM> {
  return {
    R1: s.verdictTime,
    R2: s.sleepNudgeTime,
    R3: s.wakeTime,
    R5: minutesToHhmm(hhmmToMinutes(s.wakeTime) + 20),
    R6: minutesToHhmm(hhmmToMinutes(s.checkinEnd) - 15),
    R7: s.checkinEnd,
    R8: s.rescueReminderTime,
  };
}

/** Quiet hours run from `quietStart` until the wake time, across midnight. */
export function inQuietHours(minutes: number, s: Settings): boolean {
  const start = hhmmToMinutes(s.quietStart);
  const end = hhmmToMinutes(s.wakeTime);
  return start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

function conditionMet(rule: ScheduledRule, d: DayState): boolean {
  const morningActive = !d.paused && !d.restDeclared && !d.checkedIn;
  switch (rule) {
    case 'R1':
      return true;
    case 'R2':
      return !d.paused && !d.lightsOut;
    case 'R3':
      return !d.paused && !d.restDeclared;
    case 'R5':
      return morningActive && !d.openedSinceWake;
    case 'R6':
    case 'R7':
      return morningActive;
    case 'R8':
      return morningActive && !d.sessionLogged;
  }
}

export interface DueRule {
  ruleId: ScheduledRule;
  localDate: LocalDate;
  scheduledAt: Date;
}

/**
 * Scheduled nudges due at `now` (spec §8). Called by the 5-minute cron; the
 * caller records each result in nudge_log before sending, so a rule fires at
 * most once per day even if two runs overlap.
 */
export function dueRules(state: NudgeState, now: Date): DueRule[] {
  const { settings, day } = state;
  const tz = settings.timezone;
  const date = localDate(now, tz);
  if (date !== day.localDate) {
    throw new Error(`Day state is for ${day.localDate}, but it is ${date} in ${tz}`);
  }
  const times = ruleTimes(settings);
  const out: DueRule[] = [];
  for (const ruleId of Object.keys(times) as ScheduledRule[]) {
    if (!settings.rulesEnabled[ruleId] || state.sentToday.has(ruleId)) continue;
    const scheduledAt = atLocal(date, times[ruleId], tz);
    const late = minutesBetween(scheduledAt, now);
    if (late < 0 || late >= DROP_AFTER_MIN) continue;
    if (inQuietHours(localMinutes(scheduledAt, tz), settings)) continue;
    if (!conditionMet(ruleId, day)) continue;
    out.push({ ruleId, localDate: date, scheduledAt });
  }
  return out.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
}

/**
 * Whether a snooze ping from the iOS Shortcut should produce R4 now. Allowed in
 * quiet hours (the alarm can ring before the wake setting), but only before the
 * check-in window closes, and at most once per 5 minutes.
 */
export function snoozeDue(state: NudgeState, now: Date): boolean {
  const { settings, day } = state;
  if (!settings.rulesEnabled.R4) return false;
  if (day.paused || day.restDeclared || day.checkedIn) return false;
  if (localDate(now, settings.timezone) !== day.localDate) return false;
  if (localMinutes(now, settings.timezone) >= hhmmToMinutes(settings.checkinEnd)) return false;
  if (state.lastSnoozeNudgeAt && minutesBetween(state.lastSnoozeNudgeAt, now) < SNOOZE_GAP_MIN) {
    return false;
  }
  return true;
}
