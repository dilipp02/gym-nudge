// Session report shown after saving (spec §9.1.3).
import {
  bestResult,
  milestoneProgress,
  setScore,
  type IntensityResult,
  type Session,
} from '@gym-nudge/core';
import { nextMilestone, projectionFor, todayOf, type UserState } from './state';

export interface SessionReport {
  intensity: IntensityResult;
  prs: Array<{ exerciseId: string; name: string; value: number; previous: number }>;
  milestone: {
    name: string;
    date: string;
    daysLeft: number;
    baselineWeek: boolean;
    lifts: Array<{ name: string; before: number; after: number; onTrack: boolean }>;
  } | null;
  projection: { primaryName: string; onPlan: string; daysVsTarget: number } | null;
}

/** `state.sessions` must already include `session`. */
export function sessionReport(
  state: UserState,
  session: Session,
  intensity: IntensityResult,
  now: Date,
): SessionReport {
  const others = state.sessions.filter((s) => s.id !== session.id);
  const names = new Map(state.exercises.map((e) => [e.id, e.name]));

  const prs: SessionReport['prs'] = [];
  for (const exerciseId of new Set(session.sets.map((s) => s.exerciseId))) {
    const scores = session.sets
      .filter((s) => s.exerciseId === exerciseId)
      .map(setScore)
      .filter((v): v is number => v != null);
    if (scores.length === 0) continue;
    const today = Math.max(...scores);
    const previous = bestResult(exerciseId, others, '0000-01-01', '9999-12-31');
    if (previous != null && today > previous) {
      prs.push({ exerciseId, name: names.get(exerciseId) ?? '', value: today, previous });
    }
  }

  const today = todayOf(state, now);
  const goal = nextMilestone(state, today);
  let milestone: SessionReport['milestone'] = null;
  if (goal && goal.liftTargets.length) {
    const before = milestoneProgress(goal, state.exercises, others, state.user.startDate, today);
    const after = milestoneProgress(
      goal,
      state.exercises,
      state.sessions,
      state.user.startDate,
      today,
    );
    milestone = {
      name: goal.name,
      date: goal.date,
      daysLeft: after.daysLeft,
      baselineWeek: after.baselineWeek,
      lifts: after.lifts.map((l, i) => ({
        name: l.name,
        before: before.lifts[i]?.pct ?? 0,
        after: l.pct,
        onTrack: l.onTrack,
      })),
    };
  }

  const p = projectionFor(state, session.localDate, 'trained');
  return {
    intensity,
    prs,
    milestone,
    projection: p && { primaryName: p.primaryName, onPlan: p.onPlan, daysVsTarget: p.daysVsTarget },
  };
}
