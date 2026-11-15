// Everything the core maths needs for one user, loaded in one go.
import {
  addDays,
  atLocal,
  localDate,
  project,
  type DayRecord,
  type Exercise,
  type LocalDate,
  type Pause,
  type Projection,
  type Stack,
} from '@gym-nudge/core';
import {
  getSettings,
  listAllExercises,
  listBodyMetrics,
  listDays,
  listGoals,
  listPauses,
  listSessions,
  listStacks,
  type BodyMetric,
  type DayRow,
  type GoalRow,
  type StoredSession,
  type User,
  type UserSettings,
} from '../db/repo';

export interface UserState {
  user: User;
  settings: UserSettings;
  stacks: Stack[];
  /** Includes deleted exercises, so history and milestones keep their names. */
  exercises: Exercise[];
  sessions: StoredSession[];
  days: DayRow[];
  pauses: Pause[];
  goals: GoalRow[];
  body: BodyMetric[];
}

export async function loadState(db: D1Database, user: User): Promise<UserState> {
  const [settings, stacks, exercises, sessions, days, pauses, goals, body] = await Promise.all([
    getSettings(db, user),
    listStacks(db, user.id),
    listAllExercises(db, user.id),
    listSessions(db, user.id),
    listDays(db, user.id),
    listPauses(db, user.id),
    listGoals(db, user.id),
    listBodyMetrics(db, user.id),
  ]);
  return { user, settings, stacks, exercises, sessions, days, pauses, goals, body };
}

export const todayOf = (s: UserState, now: Date) => localDate(now, s.user.timezone);

/** Latest bodyweight on or before `date`; 0 if never recorded (bodyweight volume then counts added weight only). */
export function bodyweightOn(s: UserState, date: LocalDate): number {
  let w = 0;
  for (const m of s.body) if (m.localDate <= date && m.weightKg != null) w = m.weightKg;
  return w;
}

export const sessionsOn = (s: UserState, date: LocalDate) =>
  s.sessions.filter((x) => x.localDate === date);
export const sessionsBefore = (s: UserState, date: LocalDate) =>
  s.sessions.filter((x) => x.localDate < date);

/** Finalized day records in the shape the core functions take. */
export function finalizedDays(s: UserState): DayRecord[] {
  return s.days
    .filter((d) => d.finalizedAt != null && d.status !== 'pending')
    .map((d) => ({ localDate: d.localDate, status: d.status, walkLogged: d.walkLogged }));
}

export function primaryGoal(s: UserState): GoalRow | null {
  return s.goals.find((g) => g.isPrimary) ?? null;
}

/** The next goal on or after `today`, by date. */
export function nextMilestone(s: UserState, today: LocalDate): GoalRow | null {
  return (
    [...s.goals].sort((a, b) => (a.date < b.date ? -1 : 1)).find((g) => g.date >= today) ?? null
  );
}

/** Latest date whose verdict time has passed: today after the verdict time, otherwise yesterday. */
export function lastDueDate(s: UserState, now: Date): LocalDate {
  const today = todayOf(s, now);
  return now >= atLocal(today, s.settings.verdictTime, s.user.timezone)
    ? today
    : addDays(today, -1);
}

/**
 * Projection for the primary goal. With `countTodayAs`, today is treated as that
 * status (used for "if you train today" previews in the session report).
 */
export function projectionFor(
  s: UserState,
  asOf: LocalDate,
  countTodayAs?: DayRecord['status'],
): (Projection & { primaryName: string; primaryDate: LocalDate }) | null {
  const goal = primaryGoal(s);
  if (!goal) return null;
  let days = finalizedDays(s).filter((d) => d.localDate <= asOf);
  if (countTodayAs) {
    days = days.filter((d) => d.localDate !== asOf);
    days.push({ localDate: asOf, status: countTodayAs, walkLogged: false });
  }
  const p = project({ startDate: s.user.startDate, primaryDate: goal.date, days, asOf });
  return { ...p, primaryName: goal.name, primaryDate: goal.date };
}

/** Latest finalized day on or before `date`, or the day before the start. */
export function lastFinalOnOrBefore(s: UserState, date: LocalDate): LocalDate {
  let asOf = addDays(s.user.startDate, -1);
  for (const d of s.days)
    if (d.finalizedAt && d.localDate <= date && d.localDate > asOf) asOf = d.localDate;
  return asOf;
}
