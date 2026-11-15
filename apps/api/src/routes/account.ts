// Goals, body metrics, pauses, settings and profile (plan 3.6).
import { localDate } from '@gym-nudge/core';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { AppEnv } from '../app-env';
import { requireUser } from '../auth/session';
import {
  endPause,
  getSettings,
  goalOwned,
  insertPause,
  listAllExercises,
  listBodyMetrics,
  listGoals,
  listPauses,
  saveGoal,
  setSnoozeTokenHash,
  softDeleteGoal,
  updateProfile,
  updateSettings,
  upsertBodyMetric,
} from '../db/repo';
import { randomToken, sha256Hex } from '../lib/crypto';
import { zDate, zHHMM, zId, zTimeZone } from '../lib/validate';

const zGoal = z.object({
  name: z.string().trim().min(1).max(60),
  date: zDate,
  isPrimary: z.boolean().default(false),
  waistTargetDeltaCm: z.number().min(-50).max(50).nullable().default(null),
  weightMin: z.number().min(20).max(300).nullable().default(null),
  weightMax: z.number().min(20).max(300).nullable().default(null),
  liftTargets: z
    .array(
      z.object({
        exerciseId: zId,
        targetWeight: z.number().min(0).max(1000).nullable(),
        targetReps: z.number().int().min(1).max(600),
      }),
    )
    .default([]),
});

const RULES = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8'] as const;
const zSettings = z
  .object({
    wakeTime: zHHMM,
    checkinStart: zHHMM,
    checkinEnd: zHHMM,
    rescueReminderTime: zHHMM,
    rescueCutoff: zHHMM,
    verdictTime: zHHMM,
    sleepNudgeTime: zHHMM,
    quietStart: zHHMM,
    rulesEnabled: z.object(
      Object.fromEntries(RULES.map((r) => [r, z.boolean()])) as Record<
        (typeof RULES)[number],
        z.ZodBoolean
      >,
    ),
    measurementWeekday: z.number().int().min(0).max(6),
  })
  .partial();

const zProfile = z
  .object({
    timezone: zTimeZone,
    age: z.number().int().min(10).max(120).nullable(),
    sex: z.string().max(20).nullable(),
    heightCm: z.number().min(100).max(250).nullable(),
  })
  .partial();

async function assertExercises(db: D1Database, userId: string, ids: string[]) {
  const mine = new Set((await listAllExercises(db, userId)).map((e) => e.id));
  for (const id of ids)
    if (!mine.has(id)) throw new HTTPException(400, { message: `Unknown exercise: ${id}` });
}

export const goalRoutes = new Hono<AppEnv>()
  .use(requireUser)
  .get('/', async (c) => c.json(await listGoals(c.env.DB, c.var.user.id)))
  .post('/', zValidator('json', zGoal), async (c) => {
    const g = c.req.valid('json');
    await assertExercises(
      c.env.DB,
      c.var.user.id,
      g.liftTargets.map((t) => t.exerciseId),
    );
    const id = crypto.randomUUID();
    await saveGoal(c.env.DB, c.var.user.id, id, g, false);
    return c.json(await goalOwned(c.env.DB, c.var.user.id, id), 201);
  })
  .put('/:id', zValidator('json', zGoal), async (c) => {
    const id = c.req.param('id');
    if (!(await goalOwned(c.env.DB, c.var.user.id, id)))
      throw new HTTPException(404, { message: 'Goal not found' });
    const g = c.req.valid('json');
    await assertExercises(
      c.env.DB,
      c.var.user.id,
      g.liftTargets.map((t) => t.exerciseId),
    );
    await saveGoal(c.env.DB, c.var.user.id, id, g, true);
    return c.json(await goalOwned(c.env.DB, c.var.user.id, id));
  })
  .delete('/:id', async (c) => {
    const goal = await goalOwned(c.env.DB, c.var.user.id, c.req.param('id'));
    if (!goal) throw new HTTPException(404, { message: 'Goal not found' });
    if (goal.isPrimary)
      throw new HTTPException(409, {
        message: 'Make another goal primary before deleting this one',
      });
    await softDeleteGoal(c.env.DB, c.var.user.id, goal.id, new Date().toISOString());
    return c.body(null, 204);
  });

export const bodyRoutes = new Hono<AppEnv>()
  .use(requireUser)
  .get('/', async (c) => c.json(await listBodyMetrics(c.env.DB, c.var.user.id)))
  .post(
    '/',
    zValidator(
      'json',
      z
        .object({
          localDate: zDate.optional(),
          weightKg: z.number().min(20).max(300).nullable().default(null),
          waistCm: z.number().min(30).max(250).nullable().default(null),
        })
        .refine((m) => m.weightKg != null || m.waistCm != null, 'Provide weight or waist'),
    ),
    async (c) => {
      const m = c.req.valid('json');
      const date = m.localDate ?? localDate(new Date(), c.var.user.timezone);
      await upsertBodyMetric(c.env.DB, c.var.user.id, {
        localDate: date,
        weightKg: m.weightKg,
        waistCm: m.waistCm,
      });
      return c.json(
        (await listBodyMetrics(c.env.DB, c.var.user.id)).find((x) => x.localDate === date),
        201,
      );
    },
  );

export const pauseRoutes = new Hono<AppEnv>()
  .use(requireUser)
  .get('/', async (c) => c.json(await listPauses(c.env.DB, c.var.user.id)))
  .post(
    '/',
    zValidator('json', z.object({ reason: z.string().max(200).nullable().default(null) })),
    async (c) => {
      const pauses = await listPauses(c.env.DB, c.var.user.id);
      if (pauses.some((p) => p.endDate == null))
        throw new HTTPException(409, { message: 'Already paused' });
      const id = crypto.randomUUID();
      const today = localDate(new Date(), c.var.user.timezone);
      await insertPause(c.env.DB, c.var.user.id, id, today, c.req.valid('json').reason);
      return c.json({ id, startDate: today, endDate: null }, 201);
    },
  )
  .patch('/:id', async (c) => {
    // Ending a pause: it covers through yesterday, so today is a normal day again.
    const today = localDate(new Date(), c.var.user.timezone);
    const pause = (await listPauses(c.env.DB, c.var.user.id)).find(
      (p) => p.id === c.req.param('id'),
    );
    if (!pause || pause.endDate != null)
      throw new HTTPException(404, { message: 'No open pause with that id' });
    const yesterday = new Date(Date.parse(`${today}T12:00:00Z`) - 86_400_000)
      .toISOString()
      .slice(0, 10);
    const end = yesterday < pause.startDate ? pause.startDate : yesterday;
    await endPause(c.env.DB, c.var.user.id, pause.id, end);
    return c.json({ ...pause, endDate: end });
  });

export const settingsRoutes = new Hono<AppEnv>()
  .use(requireUser)
  .get('/', async (c) =>
    // getSettings never returns the snooze token hash.
    c.json({ profile: c.var.user, settings: await getSettings(c.env.DB, c.var.user) }),
  )
  .put(
    '/',
    zValidator('json', z.object({ profile: zProfile.optional(), settings: zSettings.optional() })),
    async (c) => {
      const body = c.req.valid('json');
      if (body.profile) await updateProfile(c.env.DB, c.var.user.id, body.profile);
      if (body.settings) await updateSettings(c.env.DB, c.var.user.id, body.settings);
      const user = { ...c.var.user, ...body.profile };
      return c.json({ profile: user, settings: await getSettings(c.env.DB, user) });
    },
  )
  .post('/snooze-token/reset', async (c) => {
    // The token is only ever shown here; the database keeps its hash.
    const token = randomToken();
    await setSnoozeTokenHash(c.env.DB, c.var.user.id, await sha256Hex(token));
    return c.json({ token, url: `${c.env.APP_ORIGIN}/api/hooks/snooze/${token}` });
  });
