// Today screen and day actions (spec §9.1, plan 3.4).
import {
  addDays,
  addonsFor,
  buildPlan,
  daysBetween,
  isPaused,
  localDate,
  localMinutes,
  restUsedWithin,
  suggestStack,
  trainedYesterday,
} from '@gym-nudge/core';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { AppEnv } from '../app-env';
import { requireUser } from '../auth/session';
import { getDay, upsertDay } from '../db/repo';
import { now } from '../lib/clock';
import { zDate, zId } from '../lib/validate';
import { finalizeDays } from '../services/days';
import {
  finalizedDays,
  loadState,
  nextMilestone,
  sessionsBefore,
  sessionsOn,
  todayOf,
} from '../services/state';

/** Lights-out taps before this local time belong to the previous evening. */
const NIGHT_ENDS_MIN = 5 * 60;

// Mounted at the API root, so sign-in is required per route (not via .use, which
// would also cover unrelated routes registered later, like the snooze hook).
export const todayRoutes = new Hono<AppEnv>()
  .get(
    '/today',
    requireUser,
    zValidator('query', z.object({ stackId: zId.optional() })),
    async (c) => {
      const t = now(c);
      const state = await loadState(c.env.DB, c.var.user);
      await finalizeDays(c.env.DB, state, t);
      const today = todayOf(state, t);
      const day =
        state.days.find((d) => d.localDate === today) ??
        (await getDay(c.env.DB, state.user.id, today));

      const rotation = state.stacks.filter((s) => s.inRotation && !s.isAddon);
      const suggested = suggestStack(state.stacks, sessionsBefore(state, today));
      const requested = c.req.valid('query').stackId;
      const chosenId = requested ?? day.committedStackId ?? suggested?.id ?? null;
      const chosen = state.stacks.find((s) => s.id === chosenId && !s.isAddon) ?? suggested;
      if (requested && chosen?.id !== requested)
        throw new HTTPException(404, { message: 'Stack not found' });

      const prior = finalizedDays(state);
      const restUsedOn = restUsedWithin(today, prior);
      const goal = nextMilestone(state, today);
      const tomorrowRow = state.days.find((d) => d.localDate === addDays(today, 1));

      return c.json({
        date: today,
        status: day.finalizedAt ? day.status : 'pending',
        checkedInAt: day.checkedInAt,
        restDeclared: day.restDeclared,
        walkLogged: day.walkLogged,
        paused: isPaused(today, state.pauses),
        restAvailable: restUsedOn == null,
        restUsedOn,
        window: { start: state.settings.checkinStart, end: state.settings.checkinEnd },
        rescueCutoff: state.settings.rescueCutoff,
        stacks: rotation.map((s) => ({ id: s.id, name: s.name })),
        suggestedStackId: suggested?.id ?? null,
        stackId: chosen?.id ?? null,
        trainedYesterday: chosen ? trainedYesterday(chosen.id, state.sessions, today) : false,
        plan: chosen
          ? buildPlan(
              chosen,
              addonsFor(chosen, state.stacks),
              state.sessions,
              state.user.startDate,
              today,
            )
          : [],
        sessionsToday: sessionsOn(state, today).map((s) => ({
          id: s.id,
          stackId: s.stackId,
          intensity: s.intensity,
        })),
        nextMilestone: goal && {
          name: goal.name,
          date: goal.date,
          daysLeft: daysBetween(today, goal.date),
        },
        tomorrow: {
          suggestedStackId: suggestStack(state.stacks, state.sessions)?.id ?? null,
          committedStackId: tomorrowRow?.committedStackId ?? null,
        },
      });
    },
  )
  .post('/open', requireUser, async (c) => {
    const t = now(c);
    const today = localDate(t, c.var.user.timezone);
    const day = await getDay(c.env.DB, c.var.user.id, today);
    if (!day.firstOpenAt)
      await upsertDay(c.env.DB, c.var.user.id, today, { firstOpenAt: t.toISOString() });
    return c.body(null, 204);
  })
  .post('/checkin', requireUser, async (c) => {
    // Offline replays send the tap time ("at"); it's accepted for today or
    // yesterday if not in the future, otherwise the server clock decides.
    const parsed = z
      .object({ at: z.string().datetime({ offset: true }).optional() })
      .safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) throw new HTTPException(400, { message: 'Invalid check-in time' });
    const t = now(c);
    const tz = c.var.user.timezone;
    const today = localDate(t, tz);
    const at = parsed.data.at ? new Date(parsed.data.at) : null;
    const tapped =
      at && at.getTime() <= t.getTime() + 2 * 60_000 && localDate(at, tz) >= addDays(today, -1)
        ? at
        : t;
    const date = localDate(tapped, tz);
    const day = await getDay(c.env.DB, c.var.user.id, date);
    const checkedInAt = day.checkedInAt ?? tapped.toISOString();
    if (!day.checkedInAt) {
      await upsertDay(c.env.DB, c.var.user.id, date, { checkedInAt });
      if (day.finalizedAt) {
        const state = await loadState(c.env.DB, c.var.user);
        await finalizeDays(c.env.DB, state, t, { from: date });
      }
    }
    return c.json({ date, checkedInAt });
  })
  .post(
    '/days/:date/rest',
    requireUser,
    zValidator('param', z.object({ date: zDate })),
    async (c) => {
      const t = now(c);
      const state = await loadState(c.env.DB, c.var.user);
      await finalizeDays(c.env.DB, state, t);
      const today = todayOf(state, t);
      const { date } = c.req.valid('param');
      if (date !== today && date !== addDays(today, 1)) {
        throw new HTTPException(400, {
          message: 'Rest can only be declared for today or tomorrow',
        });
      }
      const used = restUsedWithin(date, finalizedDays(state));
      if (used) throw new HTTPException(409, { message: `Rest already used on ${used}` });
      await upsertDay(c.env.DB, state.user.id, date, { restDeclared: true });
      return c.json({ date, restDeclared: true });
    },
  )
  .post(
    '/days/:date/walk',
    requireUser,
    zValidator('param', z.object({ date: zDate })),
    async (c) => {
      const today = localDate(now(c), c.var.user.timezone);
      const { date } = c.req.valid('param');
      if (date !== today && date !== addDays(today, -1)) {
        throw new HTTPException(400, { message: 'Walks can be logged for today or yesterday' });
      }
      await upsertDay(c.env.DB, c.var.user.id, date, { walkLogged: true });
      return c.json({ date, walkLogged: true });
    },
  )
  .post('/commit', requireUser, zValidator('json', z.object({ stackId: zId })), async (c) => {
    const state = await loadState(c.env.DB, c.var.user);
    const { stackId } = c.req.valid('json');
    if (!state.stacks.some((s) => s.id === stackId && !s.isAddon)) {
      throw new HTTPException(404, { message: 'Stack not found' });
    }
    const t = now(c);
    const tomorrow = addDays(todayOf(state, t), 1);
    await upsertDay(c.env.DB, state.user.id, tomorrow, {
      committedStackId: stackId,
      committedAt: t.toISOString(),
    });
    return c.json({ date: tomorrow, committedStackId: stackId });
  })
  .post('/lights-out', requireUser, async (c) => {
    const t = now(c);
    const tz = c.var.user.timezone;
    let date = localDate(t, c.var.user.timezone);
    if (localMinutes(t, tz) < NIGHT_ENDS_MIN) date = addDays(date, -1);
    await upsertDay(c.env.DB, c.var.user.id, date, { lightsOutAt: t.toISOString() });
    return c.json({ date, lightsOutAt: t.toISOString() });
  });
