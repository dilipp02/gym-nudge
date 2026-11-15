// Data-coach message templates (spec §8.2): numbers only, no hype, no insults.
import { formatShortDate } from './time';
import type { HHMM, LocalDate } from './types';

export interface Message {
  title: string;
  body: string;
  /** Screen to open on tap. */
  url: string;
}

const kg = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ''));
/** Signed days with one decimal, e.g. `+1.2`, `-2.0`. */
export const signedDays = (n: number) => `${n >= 0 ? '+' : '-'}${Math.abs(n).toFixed(1)}`;
const pct = (n: number) => `${Math.round(n * 100)}%`;
const join = (...parts: Array<string | null | undefined | false>) =>
  parts.filter(Boolean).join(' ');

// ---- R1: daily verdict + tomorrow (21:30) ----

export type Verdict =
  | { status: 'trained' | 'rescue'; stackName: string; intensity: number }
  | { status: 'rest'; walkLogged: boolean }
  | { status: 'skip'; stackName: string }
  | { status: 'pause' };

export interface SkipCost {
  primaryName: string;
  projected: LocalDate;
  addedDays: number;
  stackName: string;
  timesThisWeek: number;
  lift?: { name: string; before: number; after: number };
}

export interface Tomorrow {
  stackName: string;
  keyLift?: { name: string; weight: number | null; reps: number; delta: number | null };
  checkinEnd: HHMM;
}

export function verdictLine(v: Verdict): string {
  switch (v.status) {
    case 'trained':
      return `Done: ${v.stackName}. Intensity ${v.intensity}.`;
    case 'rescue':
      return `Rescue: ${v.stackName} (evening). Intensity ${v.intensity}.`;
    case 'rest':
      return v.walkLogged ? 'Rest day used. Walk logged.' : 'Rest day used. No walk: streak reset.';
    case 'skip':
      return `Skipped: ${v.stackName}.`;
    case 'pause':
      return 'Paused.';
  }
}

export function skipCostLine(c: SkipCost): string {
  return join(
    `${c.primaryName} target → ${formatShortDate(c.projected)} (${signedDays(c.addedDays)} days).`,
    `${c.stackName} ${c.timesThisWeek}× this week (plan 2×).`,
    c.lift && `${c.lift.name} milestone ${pct(c.lift.before)} → ${pct(c.lift.after)}.`,
  );
}

export function tomorrowLine(t: Tomorrow): string {
  const lift = t.keyLift;
  const liftText =
    lift &&
    join(
      lift.weight != null
        ? `${lift.name} ${kg(lift.weight)} kg × ${lift.reps}`
        : `${lift.name} ${lift.reps} reps`,
      lift.delta ? `(+${kg(lift.delta)}).` : '.',
    ).replace(' .', '.');
  return join(`Tomorrow: ${t.stackName}.`, liftText, `Check in by ${t.checkinEnd}. Commit?`);
}

export function r1Verdict(input: {
  verdict: Verdict;
  skipCost?: SkipCost;
  avoided?: Array<{ name: string; days: number }>;
  pattern?: { k: number; n: number } | null;
  tomorrow: Tomorrow;
  /** Pause status line (spec §8.3): replaces the plan for tomorrow. */
  pause?: { primaryName: string; projected: LocalDate; daysVsTarget: number };
}): Message {
  const v = input.verdict;
  const title =
    v.status === 'trained' || v.status === 'rescue'
      ? `${v.stackName} done · ${v.intensity}`
      : v.status === 'skip'
        ? `Skipped: ${v.stackName}`
        : v.status === 'rest'
          ? 'Rest day'
          : 'Paused';

  if (input.pause) {
    const p = input.pause;
    return {
      title,
      body: `Paused. ${p.primaryName} target: ${formatShortDate(p.projected)} (${signedDays(p.daysVsTarget)} days vs plan).`,
      url: '/today',
    };
  }

  const body = join(
    verdictLine(v),
    input.skipCost && skipCostLine(input.skipCost),
    input.pattern &&
      `2 skips in a row. ${input.pattern.k} of your last ${input.pattern.n} breaks started this way.`,
    ...(input.avoided ?? []).map((a) => `${a.name}: ${a.days} days.`),
    tomorrowLine(input.tomorrow),
  );
  return { title, body, url: '/today' };
}

// ---- R1 on Sundays: weekly scorecard ----

export function scorecard(input: {
  week: string;
  sessions: number;
  planned: number;
  volumeChange: number | null;
  prs: number;
  primaryName: string;
  projected: LocalDate;
  daysChangeThisWeek: number;
  milestone?: { name: string; onTrack: number; total: number };
  pausedDays: number;
}): Message {
  const weekNo = input.week.split('-W')[1];
  const body = join(
    `Week ${Number(weekNo)}: ${input.sessions}/${input.planned} sessions.`,
    input.volumeChange != null &&
      `Total volume ${input.volumeChange >= 0 ? '+' : '-'}${Math.round(Math.abs(input.volumeChange) * 100)}%.`,
    `${input.prs} PR${input.prs === 1 ? '' : 's'}.`,
    `${input.primaryName} target ${formatShortDate(input.projected)} (${signedDays(input.daysChangeThisWeek)} days this week).`,
    input.milestone &&
      `${input.milestone.name}: ${input.milestone.onTrack}/${input.milestone.total} lifts on track.`,
    input.pausedDays > 0 && `Paused days: ${input.pausedDays}.`,
  );
  return { title: `Week ${Number(weekNo)} scorecard`, body, url: '/progress' };
}

// ---- R2–R8 ----

export function r2Sleep(input: {
  lightsOutBy: HHMM;
  sleep: string;
  wake: HHMM;
  avgBedtime: HHMM | null;
}): Message {
  return {
    title: 'Sleep',
    body: join(
      `Lights out by ${input.lightsOutBy} → ${input.sleep} sleep before ${input.wake}.`,
      input.avgBedtime && `Last 7 days avg bedtime ${input.avgBedtime}.`,
    ),
    url: '/today',
  };
}

export function r3Wake(input: {
  stackName: string;
  checkinStart: HHMM;
  checkinEnd: HHMM;
  nextMilestone?: { name: string; daysLeft: number };
}): Message {
  return {
    title: `Today: ${input.stackName}`,
    body: join(
      `Check-in window ${input.checkinStart}–${input.checkinEnd}.`,
      input.nextMilestone && `${input.nextMilestone.name}: ${input.nextMilestone.daysLeft}d.`,
    ),
    url: '/today',
  };
}

export function r4Snooze(input: {
  minutesLeft: number;
  skipsThisMonth: number;
  primaryName: string;
  projected: LocalDate;
}): Message {
  return {
    title: 'Snoozed',
    body: `Window closes in ${input.minutesLeft} min. Skips this month: ${input.skipsThisMonth}. ${input.primaryName} target: ${formatShortDate(input.projected)}.`,
    url: '/today',
  };
}

export function r5Move(input: { checkinBy: HHMM }): Message {
  return {
    title: 'Leave in 10 min',
    body: `Leave in 10 min to check in by ${input.checkinBy}.`,
    url: '/today',
  };
}

export function r6LastCall(input: {
  minutesLeft: number;
  doneThisWeek: number;
  planned: number;
}): Message {
  return {
    title: `${input.minutesLeft} min left`,
    body: `${input.minutesLeft} min left in check-in window. ${input.doneThisWeek}/${input.planned} sessions this week.`,
    url: '/today',
  };
}

export function r7WindowClosed(input: { countsAs: 'rest' | 'skip'; rescueCutoff: HHMM }): Message {
  return {
    title: 'Morning missed',
    body: `Morning missed. Today counts as ${input.countsAs} unless you train by ${input.rescueCutoff}. Evening session still counts.`,
    url: '/today',
  };
}

export function r8Rescue(input: {
  hoursLeft: number;
  rescueCutoff: HHMM;
  stackName: string;
}): Message {
  const h = Number.isInteger(input.hoursLeft)
    ? String(input.hoursLeft)
    : input.hoursLeft.toFixed(1);
  return {
    title: 'Rescue',
    body: `Rescue: ${h}h until ${input.rescueCutoff}. ${input.stackName} still open.`,
    url: '/today',
  };
}
