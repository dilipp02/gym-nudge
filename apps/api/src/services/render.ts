// Fills the core message templates with this user's numbers (spec §8.2).
import {
  SKIP_COST_DAYS,
  addDays,
  addonsFor,
  atLocal,
  avoidedStacks,
  buildPlan,
  daysBetween,
  hhmmToMinutes,
  isoWeek,
  isTrainingDay,
  localMinutes,
  milestoneProgress,
  minutesToHhmm,
  patternWarning,
  r1Verdict,
  r2Sleep,
  r3Wake,
  r4Snooze,
  r5Move,
  r6LastCall,
  r7WindowClosed,
  r8Rescue,
  restUsedWithin,
  ruleTimes,
  scorecard as scorecardMessage,
  suggestStack,
  timesThisWeek,
  weekday,
  type LocalDate,
  type Message,
  type RuleId,
  type Stack,
  type Verdict,
} from '@gym-nudge/core';
import { scorecard } from './progress';
import {
  finalizedDays,
  lastFinalOnOrBefore,
  nextMilestone,
  projectionFor,
  sessionsBefore,
  sessionsOn,
  todayOf,
  type UserState,
} from './state';

/** Seconds a nudge stays deliverable: morning nudges go stale fast. */
export function ttlFor(rule: RuleId): number {
  return rule === 'R1' || rule === 'R2' || rule === 'R8' ? 3600 : 900;
}

const SLEEP_TARGET_MIN = 7 * 60 + 15;

function stackForDay(
  s: UserState,
  date: LocalDate,
  sessionsSoFar = sessionsBefore(s, date),
): Stack | null {
  const committed = s.days.find((d) => d.localDate === date)?.committedStackId;
  return (
    s.stacks.find((st) => st.id === committed && !st.isAddon) ??
    suggestStack(s.stacks, sessionsSoFar)
  );
}

function currentProjection(s: UserState, today: LocalDate) {
  return projectionFor(s, lastFinalOnOrBefore(s, today));
}

function trainingDaysThisWeek(s: UserState, today: LocalDate): number {
  const monday = addDays(today, -((weekday(today) + 6) % 7));
  return finalizedDays(s).filter(
    (d) => d.localDate >= monday && d.localDate <= today && isTrainingDay(d.status),
  ).length;
}

function tomorrowLine(s: UserState, today: LocalDate) {
  const tomorrow = addDays(today, 1);
  const stack = stackForDay(s, tomorrow, s.sessions);
  if (!stack) return { stackName: '—', checkinEnd: s.settings.checkinEnd };
  const plan = buildPlan(stack, addonsFor(stack, s.stacks), s.sessions, s.user.startDate, tomorrow);
  const key = plan.find((p) => p.isKeyLift);
  const ex = key && s.exercises.find((e) => e.id === key.exerciseId);
  return {
    stackName: stack.name,
    checkinEnd: s.settings.checkinEnd,
    keyLift:
      key && key.sets[0]
        ? {
            name: key.name,
            weight: key.type === 'weighted' ? key.sets[0].weight : null,
            reps: key.sets[0].reps ?? 0,
            delta: key.progressed && key.type === 'weighted' ? (ex?.weightStep ?? null) : null,
          }
        : undefined,
  };
}

function r1(s: UserState, today: LocalDate): Message {
  if (weekday(today) === 0) {
    const sc = scorecard(s, isoWeek(today), atLocal(today, '23:59', s.user.timezone));
    return scorecardMessage({
      week: sc.week,
      sessions: sc.sessions,
      planned: sc.planned,
      volumeChange: sc.volumeChange,
      prs: sc.prs,
      primaryName: sc.primaryName ?? 'Target',
      projected: sc.projected ?? today,
      daysChangeThisWeek: sc.daysChangeThisWeek,
      milestone: sc.milestone,
      pausedDays: sc.pausedDays,
    });
  }

  const day = s.days.find((d) => d.localDate === today);
  const status = day?.status ?? 'pending';
  const projection = currentProjection(s, today);
  const planned = stackForDay(s, today);
  const tomorrow = tomorrowLine(s, today);

  if (status === 'pause') {
    return r1Verdict({
      verdict: { status: 'pause' },
      tomorrow,
      pause: projection
        ? {
            primaryName: projection.primaryName,
            projected: projection.onPlan,
            daysVsTarget: projection.daysVsTarget,
          }
        : undefined,
    });
  }

  let verdict: Verdict;
  const todays = sessionsOn(s, today).at(-1);
  if ((status === 'trained' || status === 'rescue') && todays) {
    const name = s.stacks.find((st) => st.id === todays.stackId)?.name ?? 'Session';
    verdict = { status, stackName: name, intensity: todays.intensity ?? 0 };
  } else if (status === 'rest') {
    verdict = { status: 'rest', walkLogged: day?.walkLogged ?? false };
  } else {
    verdict = { status: 'skip', stackName: planned?.name ?? 'Session' };
  }

  let skipCost;
  if (verdict.status === 'skip' && projection && planned) {
    const goal = nextMilestone(s, today);
    const keyEx = planned.exercises.find((e) => e.isKeyLift);
    let lift;
    if (goal && keyEx && goal.liftTargets.some((t) => t.exerciseId === keyEx.id)) {
      const pct = (d: LocalDate) =>
        milestoneProgress(goal, s.exercises, s.sessions, s.user.startDate, d).lifts.find(
          (l) => l.exerciseId === keyEx.id,
        )?.pct ?? 0;
      const before = pct(addDays(today, -1));
      const after = pct(today);
      if (before !== after) lift = { name: keyEx.name, before, after };
    }
    skipCost = {
      primaryName: projection.primaryName,
      projected: projection.onPlan,
      addedDays: SKIP_COST_DAYS,
      stackName: planned.name,
      timesThisWeek: timesThisWeek(planned.id, s.sessions, today),
      lift,
    };
  }

  return r1Verdict({
    verdict,
    skipCost,
    pattern: patternWarning(finalizedDays(s)),
    avoided: avoidedStacks(s.stacks, s.sessions, s.user.startDate, today).map((a) => ({
      name: a.name,
      days: a.days,
    })),
    tomorrow,
  });
}

function avgBedtime(s: UserState, today: LocalDate): string | null {
  const from = addDays(today, -7);
  const mins = s.days
    .filter((d) => d.lightsOutAt && d.localDate >= from && d.localDate < today)
    .map((d) => {
      const m = localMinutes(new Date(d.lightsOutAt!), s.user.timezone);
      return m < 12 * 60 ? m + 1440 : m; // after midnight counts as late evening
    });
  if (mins.length === 0) return null;
  return minutesToHhmm(Math.round(mins.reduce((a, b) => a + b, 0) / mins.length));
}

export function renderRule(rule: RuleId, s: UserState, now: Date): Message {
  const today = todayOf(s, now);
  const st = s.settings;
  const nowMin = localMinutes(now, s.user.timezone);
  const stack = stackForDay(s, today);
  const projection = currentProjection(s, today);

  switch (rule) {
    case 'R1':
      return r1(s, today);
    case 'R2':
      return r2Sleep({
        lightsOutBy: minutesToHhmm(hhmmToMinutes(st.wakeTime) - SLEEP_TARGET_MIN),
        sleep: '7h15m',
        wake: st.wakeTime,
        avgBedtime: avgBedtime(s, today),
      });
    case 'R3': {
      const goal = nextMilestone(s, today);
      return r3Wake({
        stackName: stack?.name ?? 'Gym',
        checkinStart: st.checkinStart,
        checkinEnd: st.checkinEnd,
        nextMilestone: goal
          ? { name: goal.name, daysLeft: daysBetween(today, goal.date) }
          : undefined,
      });
    }
    case 'R4': {
      const month = today.slice(0, 7);
      return r4Snooze({
        minutesLeft: Math.max(0, hhmmToMinutes(st.checkinEnd) - nowMin),
        skipsThisMonth: finalizedDays(s).filter(
          (d) => d.status === 'skip' && d.localDate.startsWith(month),
        ).length,
        primaryName: projection?.primaryName ?? 'Target',
        projected: projection?.onPlan ?? today,
      });
    }
    case 'R5':
      return r5Move({ checkinBy: ruleTimes(st).R6 });
    case 'R6':
      return r6LastCall({
        minutesLeft: Math.max(0, hhmmToMinutes(st.checkinEnd) - nowMin),
        doneThisWeek: trainingDaysThisWeek(s, today),
        planned: 6,
      });
    case 'R7':
      return r7WindowClosed({
        countsAs: restUsedWithin(today, finalizedDays(s)) ? 'skip' : 'rest',
        rescueCutoff: st.rescueCutoff,
      });
    case 'R8':
      return r8Rescue({
        hoursLeft: Math.max(
          0,
          Math.round(((hhmmToMinutes(st.rescueCutoff) - nowMin) / 60) * 2) / 2,
        ),
        rescueCutoff: st.rescueCutoff,
        stackName: stack?.name ?? 'Gym',
      });
  }
}
