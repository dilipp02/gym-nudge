// Push subscriptions, test push (plan 3.8) and the snooze hook (plan 3.10).
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { AppEnv } from '../app-env';
import { requireUser } from '../auth/session';
import { deletePushSub, upsertPushSub, userIdBySnoozeHash } from '../db/repo';
import { now } from '../lib/clock';
import { sha256Hex } from '../lib/crypto';
import { sendToUser } from '../services/push';
import { handleSnooze } from '../services/scheduler';

const zSubscription = z.object({
  endpoint: z.string().url().startsWith('https://'),
  keys: z.object({ p256dh: z.string().min(16).max(200), auth: z.string().min(8).max(100) }),
});

export const pushRoutes = new Hono<AppEnv>()
  .get('/public-key', (c) => c.json({ publicKey: c.env.VAPID_PUBLIC_KEY }))
  .post('/subscription', requireUser, zValidator('json', zSubscription), async (c) => {
    const { endpoint, keys } = c.req.valid('json');
    await upsertPushSub(
      c.env.DB,
      c.var.user.id,
      { endpoint, p256dh: keys.p256dh, auth: keys.auth },
      new Date().toISOString(),
    );
    return c.body(null, 204);
  })
  .delete(
    '/subscription',
    requireUser,
    zValidator('json', z.object({ endpoint: z.string() })),
    async (c) => {
      await deletePushSub(c.env.DB, c.var.user.id, c.req.valid('json').endpoint);
      return c.body(null, 204);
    },
  )
  .post('/test', requireUser, async (c) => {
    const result = await sendToUser(
      c.env,
      c.var.user.id,
      {
        title: 'Gym Nudge',
        body: 'Test notification. If you can read this, nudges will arrive.',
        url: '/settings',
      },
      { ttlSeconds: 300 },
    );
    return c.json(result);
  });

export const hookRoutes = new Hono<AppEnv>().post('/snooze/:token', async (c) => {
  const token = c.req.param('token');
  if (token.length < 20 || token.length > 100)
    throw new HTTPException(404, { message: 'Not found' });
  const userId = await userIdBySnoozeHash(c.env.DB, await sha256Hex(token));
  if (!userId) throw new HTTPException(404, { message: 'Not found' });
  const sent = await handleSnooze(c.env, userId, now(c));
  return c.json({ sent });
});
