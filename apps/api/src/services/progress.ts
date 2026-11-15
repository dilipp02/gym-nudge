// Progress screen data and the weekly scorecard (spec §9.2, plan 3.7).
import {
  addDays,
  bestResult,
  elapsedPct,
  exerciseVolume,
  isoWeek,
  isTrainingDay,
  milestoneProgress,
  setScore,
  streak,
  type LocalDate,
  type MilestoneProgress,
} from '@gym-nudge/core';
import {
  bodyweightOn,
  finalizedDays,
  lastFinalOnOrBefore,
  projectionFor,
  todayOf,
  type UserState,
} from './state';

function upcomingMilestones(s: UserState, today: LocalDate): MilestoneProgress[] {
  return s.goals
    .filter((g) => g.date >= today && g.liftTargets.length > 0)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((g) => milestoneProgress(g, s.exercises, s.sessions, s.user.startDate, today));
}

export function progress(s: UserState, now: Date) {
  const today = todayOf(s, now);
  const asOf = lastFinalOnOrBefore(s, today);
  const projection = projectionFor(s, asOf);
  const finals = new Map(s.days.filter((d) => d.finalizedAt).map((d) => [d.localDate, d.status]));

  const calendar = Array.from({ length: 28 }, (_, i) => {
    const date = addDays(today, i - 27);
    const status = date < s.user.startDate ? null : (finals.get(date) ?? 'pending');
    return { date, status };
  });

  const weights = s.body.filter((m) => m.weightKg != null);
  const waists = s.body.filter((m) => m.waistCm != null);
  const next = [...s.goals].sort((a, b) => (a.date < b.date ? -1 : 1)).find((g) => g.date >= today);
  const elapsed = next ? elapsedPct(s.user.startDate, next.date, today) : 0;
  const baselineWaist = waists[0]?.waistCm ?? null;

  const from = addDays(today, -27);
  const stackFrequency = s.stacks
    .filter((st) => st.inRotation && !st.isAddon)
    .map((st) => ({
      stackId: st.id,
      name: st.name,
      perWeek:
        (s.sessions.filter(
          (x) => x.stackId === st.id && x.localDate >= from && x.localDate <= today,
        ).length *
          7) /
        28,
    }));

  return {
    today,
    asOf,
    projection,
    milestones: upcomingMilestones(s, today),
    calendar,
    streak: streak(finalizedDays(s)),
    body: {
      weight: { baseline: weights[0]?.weightKg ?? null, latest: weights.at(-1)?.weightKg ?? null },
      waist: {
        baseline: baselineWaist,
        latest: waists.at(-1)?.waistCm ?? null,
        targetNow:
          baselineWaist != null && next?.waistTargetDeltaCm != null
            ? baselineWaist + next.waistTargetDeltaCm * elapsed
            : null,
      },
      target: next
        ? { name: next.name, weightMin: next.weightMin, weightMax: next.weightMax }
        : null,
    },
    stackFrequency,
  };
}

/** Monday of an ISO week label like `2026-W47`. */
export function isoWeekMonday(week: string): LocalDate {
  const m = /^(\d{4})-W(\d{2})$/.exec(week);
  if (!m) throw new Error(`Invalid ISO week: ${week}`);
  const year = Number(m[1]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday1 = new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86_400_000);
  const monday = new Date(monday1.getTime() + (Number(m[2]) - 1) * 7 * 86_400_000);
  const date = monday.toISOString().slice(0, 10);
  if (isoWeek(date) !== week) throw new Error(`Invalid ISO week: ${week}`);
  return date;
}

export function scorecard(s: UserState, week: string, now: Date) {
  const monday = isoWeekMonday(week);
  const sunday = addDays(monday, 6);
  const prevMonday = addDays(monday, -7);
  const inRange = (d: LocalDate, a: LocalDate, b: LocalDate) => d >= a && d <= b;

  const weekDays = s.days.filter((d) => d.finalizedAt && inRange(d.localDate, monday, sunday));
  const sessions = weekDays.filter((d) => isTrainingDay(d.status)).length;
  const pausedDays = weekDays.filter((d) => d.status === 'pause').length;

  const volumeIn = (a: LocalDate, b: LocalDate) =>
    s.sessions
      .filter((x) => inRange(x.localDate, a, b))
      .reduce((n, x) => n + exerciseVolume(x.sets, bodyweightOn(s, x.localDate)), 0);
  const thisVol = volumeIn(monday, sunday);
  const prevVol = volumeIn(prevMonday, addDays(monday, -1));

  let prs = 0;
  for (const x of s.sessions.filter((x) => inRange(x.localDate, monday, sunday))) {
    const earlier = s.sessions.filter((y) => y.localDate < x.localDate);
    for (const exerciseId of new Set(x.sets.map((z) => z.exerciseId))) {
      const best = Math.max(
        ...x.sets.filter((z) => z.exerciseId === exerciseId).map((z) => setScore(z) ?? -1),
      );
      const before = bestResult(exerciseId, earlier, '0000-01-01', '9999-12-31');
      if (before != null && best > before) prs++;
    }
  }

  const today = todayOf(s, now);
  const end = lastFinalOnOrBefore(s, sunday < today ? sunday : today);
  const start = lastFinalOnOrBefore(s, addDays(monday, -1));
  const pEnd = projectionFor(s, end);
  const pStart = projectionFor(s, start);
  const milestone = upcomingMilestones(s, sunday < today ? sunday : today)[0];

  return {
    week,
    monday,
    sunday,
    sessions,
    planned: 6,
    volumeChange: prevVol > 0 ? thisVol / prevVol - 1 : null,
    prs,
    primaryName: pEnd?.primaryName ?? null,
    projected: pEnd?.onPlan ?? null,
    daysChangeThisWeek: pEnd && pStart ? pEnd.daysVsTarget - pStart.daysVsTarget : 0,
    milestone: milestone && {
      name: milestone.name,
      onTrack: milestone.onTrackCount,
      total: milestone.lifts.length,
    },
    pausedDays,
  };
}
