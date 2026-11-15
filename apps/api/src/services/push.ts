// Web Push sending (plan 3.8). Subscriptions the push service reports gone (404/410) are deleted.
import { buildPushPayload } from '@block65/webcrypto-web-push';
import type { Message } from '@gym-nudge/core';
import { deletePushSub, listPushSubs, markPushSuccess } from '../db/repo';

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
export interface PushDeps {
  fetch: FetchLike;
}
export const defaultDeps: PushDeps = { fetch: (url, init) => fetch(url, init) };

export interface SendResult {
  subscriptions: number;
  delivered: number;
  removed: number;
  failed: number;
}

export async function sendToUser(
  env: Env,
  userId: string,
  message: Message,
  opts: { ttlSeconds: number },
  deps: PushDeps = defaultDeps,
): Promise<SendResult> {
  const subs = await listPushSubs(env.DB, userId);
  const result: SendResult = { subscriptions: subs.length, delivered: 0, removed: 0, failed: 0 };
  const vapid = {
    subject: env.VAPID_SUBJECT,
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };
  for (const sub of subs) {
    try {
      const payload = await buildPushPayload(
        {
          data: { title: message.title, body: message.body, url: message.url },
          options: { ttl: opts.ttlSeconds, urgency: 'high' },
        },
        {
          endpoint: sub.endpoint,
          expirationTime: null,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        vapid,
      );
      const res = await deps.fetch(sub.endpoint, {
        method: 'POST',
        headers: payload.headers,
        body: payload.body,
      });
      if (res.ok) {
        result.delivered++;
        await markPushSuccess(env.DB, sub.id, new Date().toISOString());
      } else if (res.status === 404 || res.status === 410) {
        result.removed++;
        await deletePushSub(env.DB, null, sub.endpoint);
      } else {
        result.failed++;
        console.warn(`push failed: ${res.status} for subscription ${sub.id}`);
      }
    } catch (err) {
      result.failed++;
      console.warn(`push error for subscription ${sub.id}: ${String(err)}`);
    }
  }
  return result;
}
