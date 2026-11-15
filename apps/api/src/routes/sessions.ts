// Save a session (plan 3.5): idempotent by client id, late logs accepted until the day after.
import {
  addDays,
  addonsFor,
  buildPlan,
  intensity,
  localDate,
  type LoggedSet,
  type Session,
} from '@gym-nudge/core';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { AppEnv } from '../app-env';
import { requireUser } from '../auth/session';
import { sessionOwner, upsertSession } from '../db/repo';
import { now } from '../lib/clock';
import { zDate, zId } from '../lib/validate';
import { finalizeDays } from '../services/days';
import { sessionReport } from '../services/report';
import { bodyweightOn, loadState, todayOf } from '../services/state';

const zSet = z.object({
  exerciseId: zId,
  setIndex: z.number().int().min(0).max(50),
  weight: z.number().min(0).max(1000).nullable().default(null),
  reps: z.number().int().min(0).max(1000).nullable().default(null),
  seconds: z.number().int().min(0).max(36_000).nullable().default(null),
  skipped: z.boolean().default(false),
});

const zSession = z.object({
  id: z.string().uuid(),
  localDate: zDate,
  stackId: zId,
  sets: z.array(zSet).min(1).max(300),
  /** When the workout was logged on the phone; sent by offline replays (plan 4.3). */
  performedAt: z.string().datetime({ offset: true }).optional(),
});

/** Allowed clock skew for client timestamps. */
const SKEW_MS = 2 * 60_000;

export const sessionRoutes = new Hono<AppEnv>()
  .use(requireUser)
  .post('/', zValidator('json', zSession), async (c) => {
    const body = c.req.valid('json');
    const t = now(c);
    const db = c.env.DB;
    const state = await loadState(db, c.var.user);
    const today = todayOf(state, t);

    // A day can be logged until 24h after it ends (spec §10): today or yesterday.
    if (body.localDate > today)
      throw new HTTPException(400, { message: 'Cannot log a future day' });
    if (body.localDate < addDays(today, -1))
      throw new HTTPException(409, { message: 'That day is locked' });

    const owner = await sessionOwner(db, body.id);
    if (owner && owner !== state.user.id)
      throw new HTTPException(409, { message: 'Session id already used' });

    const stack = state.stacks.find((s) => s.id === body.stackId && !s.isAddon);
    if (!stack) throw new HTTPException(404, { message: 'Stack not found' });
    const addons = addonsFor(stack, state.stacks);
    const allowed = new Map([stack, ...addons].flatMap((s) => s.exercises).map((e) => [e.id, e]));

    const seen = new Set<string>();
    const sets: LoggedSet[] = body.sets.map((s) => {
      const ex = allowed.get(s.exerciseId);
      if (!ex)
        throw new HTTPException(400, { message: `Exercise not in this stack: ${s.exerciseId}` });
      const key = `${s.exerciseId}:${s.setIndex}`;
      if (seen.has(key)) throw new HTTPException(400, { message: `Duplicate set: ${key}` });
      seen.add(key);
      return { ...s, type: ex.type };
    });

    // Offline replays may carry the phone's time, accepted only if it falls on the
    // logged day and isn't in the future; otherwise the server clock decides.
    const performed = body.performedAt ? new Date(body.performedAt) : null;
    const loggedAt =
      performed &&
      performed.getTime() <= t.getTime() + SKEW_MS &&
      localDate(performed, state.user.timezone) === body.localDate
        ? performed
        : t;

    const session: Session = {
      id: body.id,
      localDate: body.localDate,
      stackId: stack.id,
      loggedAt: loggedAt.toISOString(),
      sets,
    };
    const plan = buildPlan(stack, addons, state.sessions, state.user.startDate, body.localDate);
    const plannedSetsTotal = plan.reduce((n, p) => n + p.sets.length, 0);
    const score = intensity({
      session,
      plannedSetsTotal,
      history: state.sessions.filter((s) => s.id !== session.id),
      bodyweightKg: bodyweightOn(state, body.localDate),
    });

    const snapshot = {
      stack: { id: stack.id, name: stack.name },
      exercises: [...allowed.values()].map((e) => ({ id: e.id, name: e.name, type: e.type })),
    };
    const names = new Map([...allowed.values()].map((e) => [e.id, e.name]));
    await upsertSession(db, state.user.id, session, names, score.score, snapshot);

    state.sessions = [
      ...state.sessions.filter((s) => s.id !== session.id),
      { ...session, intensity: score.score },
    ];
    // A late log can change an already-final verdict, and with it later rest/skip decisions.
    const day = state.days.find((d) => d.localDate === body.localDate);
    if (day?.finalizedAt) await finalizeDays(db, state, t, { from: body.localDate });

    return c.json(
      { sessionId: session.id, report: sessionReport(state, session, score, t) },
      owner ? 200 : 201,
    );
  });
