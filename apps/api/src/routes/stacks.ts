// Stack and exercise create/edit/delete (spec §9.3, plan 3.3). Deletes are soft so history keeps working.
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { AppEnv } from '../app-env';
import { requireUser } from '../auth/session';
import {
  insertExercise,
  insertStack,
  listStacks,
  nextExercisePosition,
  nextStackPosition,
  reorder,
  setStackAddons,
  softDeleteExercise,
  softDeleteStack,
  stackOwned,
  updateExercise,
  updateStack,
} from '../db/repo';
import { zId } from '../lib/validate';

const zStack = z.object({
  name: z.string().trim().min(1).max(60),
  inRotation: z.boolean().default(true),
  isAddon: z.boolean().default(false),
  addonIds: z.array(zId).default([]),
});

const zExerciseBase = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(['weighted', 'bodyweight', 'timed']),
  sets: z.number().int().min(1).max(20),
  repMin: z.number().int().min(1).max(600),
  repMax: z.number().int().min(1).max(600),
  weightStep: z.number().min(0).max(100),
  startWeight: z.number().min(0).max(1000).nullable().default(null),
  isKeyLift: z.boolean().default(false),
});
const zExercise = zExerciseBase.refine((e) => e.repMin <= e.repMax, 'repMin must be ≤ repMax');
const zExercisePatch = zExerciseBase
  .partial()
  .refine(
    (e) => e.repMin === undefined || e.repMax === undefined || e.repMin <= e.repMax,
    'repMin must be ≤ repMax',
  );

const zOrder = z.object({ ids: z.array(zId).min(1) });

async function assertStack(db: D1Database, userId: string, stackId: string) {
  if (!(await stackOwned(db, userId, stackId)))
    throw new HTTPException(404, { message: 'Stack not found' });
}

async function assertAddons(db: D1Database, userId: string, stackId: string | null, ids: string[]) {
  const stacks = await listStacks(db, userId);
  for (const id of ids) {
    const s = stacks.find((x) => x.id === id);
    if (!s || !s.isAddon || id === stackId)
      throw new HTTPException(400, { message: `Invalid add-on: ${id}` });
  }
}

export const stackRoutes = new Hono<AppEnv>()
  .use(requireUser)
  .get('/', async (c) => c.json(await listStacks(c.env.DB, c.var.user.id)))
  .post('/', zValidator('json', zStack), async (c) => {
    const body = c.req.valid('json');
    const userId = c.var.user.id;
    await assertAddons(c.env.DB, userId, null, body.addonIds);
    const id = crypto.randomUUID();
    await insertStack(c.env.DB, userId, {
      id,
      name: body.name,
      position: await nextStackPosition(c.env.DB, userId),
      inRotation: body.isAddon ? false : body.inRotation,
      isAddon: body.isAddon,
    });
    if (body.addonIds.length) await setStackAddons(c.env.DB, id, body.addonIds);
    const created = (await listStacks(c.env.DB, userId)).find((s) => s.id === id);
    return c.json(created, 201);
  })
  .patch('/order', zValidator('json', zOrder), async (c) => {
    const userId = c.var.user.id;
    const live = new Set((await listStacks(c.env.DB, userId)).map((s) => s.id));
    const { ids } = c.req.valid('json');
    if (ids.length !== live.size || !ids.every((id) => live.has(id))) {
      throw new HTTPException(400, { message: 'Order must list every stack exactly once' });
    }
    await reorder(c.env.DB, 'stacks', userId, ids);
    return c.json(await listStacks(c.env.DB, userId));
  })
  .patch('/:id', zValidator('json', zStack.partial()), async (c) => {
    const userId = c.var.user.id;
    const id = c.req.param('id');
    await assertStack(c.env.DB, userId, id);
    const body = c.req.valid('json');
    await updateStack(c.env.DB, userId, id, body);
    if (body.addonIds) {
      await assertAddons(c.env.DB, userId, id, body.addonIds);
      await setStackAddons(c.env.DB, id, body.addonIds);
    }
    return c.json((await listStacks(c.env.DB, userId)).find((s) => s.id === id));
  })
  .delete('/:id', async (c) => {
    const changed = await softDeleteStack(
      c.env.DB,
      c.var.user.id,
      c.req.param('id'),
      new Date().toISOString(),
    );
    if (!changed) throw new HTTPException(404, { message: 'Stack not found' });
    return c.body(null, 204);
  })
  .post('/:id/duplicate', async (c) => {
    const userId = c.var.user.id;
    const src = (await listStacks(c.env.DB, userId)).find((s) => s.id === c.req.param('id'));
    if (!src) throw new HTTPException(404, { message: 'Stack not found' });
    const id = crypto.randomUUID();
    await insertStack(c.env.DB, userId, {
      id,
      name: `${src.name} (copy)`,
      position: await nextStackPosition(c.env.DB, userId),
      inRotation: false,
      isAddon: src.isAddon,
    });
    for (const e of src.exercises) {
      await insertExercise(c.env.DB, userId, id, crypto.randomUUID(), e.position, e);
    }
    if (src.addonIds.length) await setStackAddons(c.env.DB, id, src.addonIds);
    return c.json(
      (await listStacks(c.env.DB, userId)).find((s) => s.id === id),
      201,
    );
  })
  .post('/:id/exercises', zValidator('json', zExercise), async (c) => {
    const userId = c.var.user.id;
    const stackId = c.req.param('id');
    await assertStack(c.env.DB, userId, stackId);
    const id = crypto.randomUUID();
    await insertExercise(
      c.env.DB,
      userId,
      stackId,
      id,
      await nextExercisePosition(c.env.DB, stackId),
      c.req.valid('json'),
    );
    const stack = (await listStacks(c.env.DB, userId)).find((s) => s.id === stackId)!;
    return c.json(
      stack.exercises.find((e) => e.id === id),
      201,
    );
  })
  .patch('/:id/exercises/order', zValidator('json', zOrder), async (c) => {
    const userId = c.var.user.id;
    const stack = (await listStacks(c.env.DB, userId)).find((s) => s.id === c.req.param('id'));
    if (!stack) throw new HTTPException(404, { message: 'Stack not found' });
    const live = new Set(stack.exercises.map((e) => e.id));
    const { ids } = c.req.valid('json');
    if (ids.length !== live.size || !ids.every((id) => live.has(id))) {
      throw new HTTPException(400, { message: 'Order must list every exercise exactly once' });
    }
    await reorder(c.env.DB, 'exercises', userId, ids);
    return c.json((await listStacks(c.env.DB, userId)).find((s) => s.id === stack.id));
  })
  .patch('/:id/exercises/:exId', zValidator('json', zExercisePatch), async (c) => {
    const userId = c.var.user.id;
    const stack = (await listStacks(c.env.DB, userId)).find((s) => s.id === c.req.param('id'));
    const ex = stack?.exercises.find((e) => e.id === c.req.param('exId'));
    if (!stack || !ex) throw new HTTPException(404, { message: 'Exercise not found' });
    const patch = c.req.valid('json');
    const merged = { ...ex, ...patch };
    if (merged.repMin > merged.repMax)
      throw new HTTPException(400, { message: 'repMin must be ≤ repMax' });
    await updateExercise(c.env.DB, userId, ex.id, patch);
    const updated = (await listStacks(c.env.DB, userId)).find((s) => s.id === stack.id)!;
    return c.json(updated.exercises.find((e) => e.id === ex.id));
  })
  .delete('/:id/exercises/:exId', async (c) => {
    const userId = c.var.user.id;
    const stack = (await listStacks(c.env.DB, userId)).find((s) => s.id === c.req.param('id'));
    if (!stack?.exercises.some((e) => e.id === c.req.param('exId'))) {
      throw new HTTPException(404, { message: 'Exercise not found' });
    }
    await softDeleteExercise(c.env.DB, userId, c.req.param('exId'), new Date().toISOString());
    return c.body(null, 204);
  });
