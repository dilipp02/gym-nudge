// Progress, weekly scorecard and data export (plan 3.7, 3.11).
import { isoWeek } from '@gym-nudge/core';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { AppEnv } from '../app-env';
import { requireUser } from '../auth/session';
import { exportUserData, listSessions } from '../db/repo';
import { now } from '../lib/clock';
import { finalizeDays } from '../services/days';
import { isoWeekMonday, progress, scorecard } from '../services/progress';
import { loadState, todayOf } from '../services/state';

export const progressRoutes = new Hono<AppEnv>().use(requireUser).get('/', async (c) => {
  const t = now(c);
  const state = await loadState(c.env.DB, c.var.user);
  await finalizeDays(c.env.DB, state, t);
  return c.json(progress(state, t));
});

export const scorecardRoutes = new Hono<AppEnv>()
  .use(requireUser)
  .get('/', zValidator('query', z.object({ week: z.string().optional() })), async (c) => {
    const t = now(c);
    const state = await loadState(c.env.DB, c.var.user);
    await finalizeDays(c.env.DB, state, t);
    const week = c.req.valid('query').week ?? isoWeek(todayOf(state, t));
    try {
      isoWeekMonday(week);
    } catch {
      throw new HTTPException(400, { message: 'week must look like 2026-W47' });
    }
    return c.json(scorecard(state, week, t));
  });

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const exportRoutes = new Hono<AppEnv>()
  .use(requireUser)
  .get('/', async (c) => {
    const data = await exportUserData(c.env.DB, c.var.user.id);
    c.header('Content-Disposition', 'attachment; filename="gym-nudge-export.json"');
    return c.json({ exportedAt: new Date().toISOString(), ...data });
  })
  .get('/sessions.csv', async (c) => {
    const sessions = await listSessions(c.env.DB, c.var.user.id);
    const { results: names } = await c.env.DB.prepare(
      `SELECT ss.session_id, ss.exercise_id, ss.exercise_name FROM session_sets ss
       JOIN sessions s ON s.id = ss.session_id WHERE s.user_id = ?`,
    )
      .bind(c.var.user.id)
      .all<{ session_id: string; exercise_id: string; exercise_name: string }>();
    const nameOf = new Map(names.map((n) => [`${n.session_id}:${n.exercise_id}`, n.exercise_name]));
    const rows = [
      [
        'date',
        'session_id',
        'exercise',
        'type',
        'set',
        'weight',
        'reps',
        'seconds',
        'skipped',
        'intensity',
      ],
    ];
    for (const s of sessions) {
      for (const x of s.sets) {
        rows.push([
          s.localDate,
          s.id,
          nameOf.get(`${s.id}:${x.exerciseId}`) ?? x.exerciseId,
          x.type,
          String(x.setIndex + 1),
          x.weight == null ? '' : String(x.weight),
          x.reps == null ? '' : String(x.reps),
          x.seconds == null ? '' : String(x.seconds),
          x.skipped ? 'yes' : 'no',
          s.intensity == null ? '' : String(s.intensity),
        ]);
      }
    }
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', 'attachment; filename="gym-nudge-sessions.csv"');
    return c.body(rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n');
  });
