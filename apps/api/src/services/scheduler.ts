// The 5-minute cron (spec §8.1) and the snooze hook (R4).
import {
  atLocal,
  dueRules,
  isPaused,
  snoozeDue,
  type DayState,
  type LocalDate,
  type RuleId,
} from '@gym-nudge/core';
import {
  emptyDay,
  getUser,
  listUsers,
  nudgesForDate,
  setNudgeStatus,
  tryLogNudge,
  type User,
} from '../db/repo';
import { finalizeDays } from './days';
import { defaultDeps, sendToUser, type PushDeps, type SendResult } from './push';
import { renderRule, ttlFor } from './render';
import { loadState, sessionsOn, todayOf, type UserState } from './state';

function dayState(s: UserState, today: LocalDate): DayState {
  const row = s.days.find((d) => d.localDate === today) ?? emptyDay(today);
  const wake = atLocal(today, s.settings.wakeTime, s.user.timezone);
  return {
    localDate: today,
    checkedIn: row.checkedInAt != null,
    sessionLogged: sessionsOn(s, today).length > 0,
    restDeclared: row.restDeclared,
    paused: isPaused(today, s.pauses),
    openedSinceWake: row.firstOpenAt != null && new Date(row.firstOpenAt) >= wake,
    lightsOut: row.lightsOutAt != null,
  };
}

const statusFor = (r: SendResult) =>
  r.delivered > 0 ? 'sent' : r.subscriptions === 0 ? 'no_subscription' : 'failed';

/** Finalize due days, then send every nudge that is due now. Returns the rules sent. */
export async function runForUser(
  env: Env,
  user: User,
  now: Date,
  deps: PushDeps = defaultDeps,
): Promise<RuleId[]> {
  const state = await loadState(env.DB, user);
  // Verdicts first, so the 21:30 message reports the finished day.
  await finalizeDays(env.DB, state, now);
  const today = todayOf(state, now);
  const logged = await nudgesForDate(env.DB, user.id, today);
  const lastSnooze = logged.filter((n) => n.ruleId === 'R4').at(-1);
  const due = dueRules(
    {
      settings: state.settings,
      day: dayState(state, today),
      sentToday: new Set(logged.map((n) => n.ruleId)),
      lastSnoozeNudgeAt: lastSnooze ? new Date(lastSnooze.sentAt) : null,
    },
    now,
  );
  const sent: RuleId[] = [];
  for (const r of due) {
    // Logged before sending: the unique index makes overlapping runs harmless.
    const logId = await tryLogNudge(env.DB, user.id, today, r.ruleId, now.toISOString());
    if (logId == null) continue;
    const result = await sendToUser(
      env,
      user.id,
      renderRule(r.ruleId, state, now),
      { ttlSeconds: ttlFor(r.ruleId) },
      deps,
    );
    await setNudgeStatus(env.DB, logId, statusFor(result));
    sent.push(r.ruleId);
  }
  return sent;
}

export async function runScheduled(
  env: Env,
  now: Date,
  deps: PushDeps = defaultDeps,
): Promise<void> {
  for (const user of await listUsers(env.DB)) {
    try {
      await runForUser(env, user, now, deps);
    } catch (err) {
      console.error(`scheduler failed for user ${user.id}: ${String(err)}`);
    }
  }
}

/** R4: called by the iOS Shortcut when the alarm is snoozed. Returns true if a nudge was sent. */
export async function handleSnooze(
  env: Env,
  userId: string,
  now: Date,
  deps: PushDeps = defaultDeps,
): Promise<boolean> {
  const user = await getUser(env.DB, userId);
  if (!user) return false;
  const state = await loadState(env.DB, user);
  const today = todayOf(state, now);
  const logged = await nudgesForDate(env.DB, user.id, today);
  const lastSnooze = logged.filter((n) => n.ruleId === 'R4').at(-1);
  const ok = snoozeDue(
    {
      settings: state.settings,
      day: dayState(state, today),
      sentToday: new Set(logged.map((n) => n.ruleId)),
      lastSnoozeNudgeAt: lastSnooze ? new Date(lastSnooze.sentAt) : null,
    },
    now,
  );
  if (!ok) return false;
  const logId = await tryLogNudge(env.DB, user.id, today, 'R4', now.toISOString());
  if (logId == null) return false;
  const result = await sendToUser(
    env,
    user.id,
    renderRule('R4', state, now),
    { ttlSeconds: ttlFor('R4') },
    deps,
  );
  await setNudgeStatus(env.DB, logId, statusFor(result));
  return true;
}
