import {
  createExecutionContext,
  createScheduledController,
  env,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import worker from '../src/index';
import { upsertDay, upsertPushSub } from '../src/db/repo';
import { renderRule } from '../src/services/render';
import { handleSnooze, runForUser } from '../src/services/scheduler';
import { loadState } from '../src/services/state';
import { finalizeDays } from '../src/services/days';
import type { PushDeps } from '../src/services/push';
import { b64url } from './authenticator';
import { call, createUser, json } from './helpers';

const START = '2026-11-16'; // Monday; London = UTC in November
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00.000Z`);

async function browserKeys() {
  const kp = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair;
  const raw = new Uint8Array((await crypto.subtle.exportKey('raw', kp.publicKey)) as ArrayBuffer);
  return { p256dh: b64url(raw), auth: b64url(crypto.getRandomValues(new Uint8Array(16))) };
}

function fakePush(status = 201) {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  const deps: PushDeps = {
    fetch: async (url, init) => {
      calls.push({ url, headers: init.headers as Record<string, string> });
      return new Response(null, { status });
    },
  };
  return { calls, deps };
}

async function setup(withSub = true) {
  const u = await createUser({ timezone: 'Europe/London', startDate: START });
  if (withSub) {
    await upsertPushSub(
      env.DB,
      u.user.id,
      { endpoint: `https://push.example/${u.user.id}`, ...(await browserKeys()) },
      new Date().toISOString(),
    );
  }
  return u;
}

async function log(userId: string) {
  const { results } = await env.DB.prepare(
    'SELECT rule_id, status FROM nudge_log WHERE user_id = ? ORDER BY id',
  )
    .bind(userId)
    .all<{ rule_id: string; status: string }>();
  return results;
}

describe('scheduler', () => {
  it('sends the right nudges through a missed morning, once each', async () => {
    const { user } = await setup();
    const push = fakePush();
    const run = (hhmm: string) => runForUser(env, user, at('2026-11-17', hhmm), push.deps);

    expect(await run('06:30')).toEqual(['R3']);
    expect(await run('06:30')).toEqual([]); // overlapping run: no duplicate
    expect(await run('06:35')).toEqual([]);
    expect(await run('06:50')).toEqual(['R5']);
    expect(await run('07:15')).toEqual(['R6']);
    expect(await run('07:30')).toEqual(['R7']);
    expect(await run('18:30')).toEqual(['R8']);
    expect(await run('21:30')).toEqual(['R1']);
    expect(await run('22:45')).toEqual(['R2']);

    expect(push.calls).toHaveLength(7);
    expect(push.calls[0]!.headers['content-encoding']).toBe('aes128gcm');
    expect(push.calls[0]!.headers.authorization).toMatch(/^vapid t=/);
    expect(push.calls[0]!.headers.ttl).toBe('900'); // morning nudges go stale fast
    expect((await log(user.id)).every((r) => r.status === 'sent')).toBe(true);
  });

  it('a good morning only gets the wake nudge and the evening ones', async () => {
    const { user } = await setup();
    const push = fakePush();
    const run = (hhmm: string) => runForUser(env, user, at('2026-11-17', hhmm), push.deps);
    expect(await run('06:30')).toEqual(['R3']);
    await upsertDay(env.DB, user.id, '2026-11-17', {
      firstOpenAt: at('2026-11-17', '06:33').toISOString(),
    });
    await upsertDay(env.DB, user.id, '2026-11-17', {
      checkedInAt: at('2026-11-17', '07:02').toISOString(),
    });
    for (const t of ['06:50', '07:15', '07:30', '18:30']) expect(await run(t)).toEqual([]);
    await upsertDay(env.DB, user.id, '2026-11-17', {
      lightsOutAt: at('2026-11-17', '22:30').toISOString(),
    });
    expect(await run('21:30')).toEqual(['R1']);
    expect(await run('22:45')).toEqual([]);
  });

  it('removes subscriptions the push service reports gone, and logs no-subscription', async () => {
    const { user } = await setup();
    const gone = fakePush(410);
    await runForUser(env, user, at('2026-11-17', '06:30'), gone.deps);
    expect((await log(user.id))[0]).toEqual({ rule_id: 'R3', status: 'failed' });
    const subs = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?',
    )
      .bind(user.id)
      .first<{ n: number }>();
    expect(subs?.n).toBe(0);
    await runForUser(env, user, at('2026-11-17', '06:50'), gone.deps);
    expect((await log(user.id))[1]).toEqual({ rule_id: 'R5', status: 'no_subscription' });
  });

  it('snooze: at most one per 5 minutes, none after check-in', async () => {
    const { user } = await setup();
    const push = fakePush();
    expect(await handleSnooze(env, user.id, at('2026-11-17', '06:31'), push.deps)).toBe(true);
    expect(await handleSnooze(env, user.id, at('2026-11-17', '06:33'), push.deps)).toBe(false);
    expect(await handleSnooze(env, user.id, at('2026-11-17', '06:40'), push.deps)).toBe(true);
    await upsertDay(env.DB, user.id, '2026-11-17', {
      checkedInAt: at('2026-11-17', '06:58').toISOString(),
    });
    expect(await handleSnooze(env, user.id, at('2026-11-17', '07:05'), push.deps)).toBe(false);
    expect((await log(user.id)).map((r) => r.rule_id)).toEqual(['R4', 'R4']);
  });

  it('snooze hook route: valid token logs R4, wrong token 404s', async () => {
    const { cookie, user } = await setup(false);
    const { token } = await json(
      await call('/settings/snooze-token/reset', { cookie, method: 'POST' }),
    );
    const res = await call(`/hooks/snooze/${token}`, {
      method: 'POST',
      headers: { 'X-Test-Now': '2026-11-17T06:31:00.000Z' },
    });
    expect(await json(res)).toEqual({ sent: true });
    expect((await log(user.id)).map((r) => r.rule_id)).toEqual(['R4']);
    expect((await call(`/hooks/snooze/${'x'.repeat(43)}`, { method: 'POST' })).status).toBe(404);
  });

  it('push subscription routes validate input and need sign-in', async () => {
    const { cookie, user } = await setup(false);
    const keys = await browserKeys();
    expect(
      (await call('/push/subscription', { json: { endpoint: 'https://push.example/a', keys } }))
        .status,
    ).toBe(401);
    expect(
      (
        await call('/push/subscription', {
          cookie,
          json: { endpoint: 'http://insecure.example/a', keys },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call('/push/subscription', {
          cookie,
          json: { endpoint: 'https://push.example/a', keys },
        })
      ).status,
    ).toBe(204);
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?')
      .bind(user.id)
      .first<{ n: number }>();
    expect(n?.n).toBe(1);
    expect(
      (
        await call('/push/subscription', {
          cookie,
          method: 'DELETE',
          json: { endpoint: 'https://push.example/a' },
        })
      ).status,
    ).toBe(204);
    expect((await json(await call('/push/public-key'))).publicKey).toBe(env.VAPID_PUBLIC_KEY);
  });

  it('the Worker scheduled() entry runs without error', async () => {
    // Other tests' users point at a fake push host; keep this run off the network.
    await env.DB.prepare('DELETE FROM push_subscriptions').run();
    await setup(false);
    const ctx = createExecutionContext();
    await worker.scheduled(
      createScheduledController({
        scheduledTime: at('2026-11-17', '06:30').getTime(),
        cron: '*/5 * * * *',
      }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
  });
});

describe('rendered messages', () => {
  it('skip day verdict carries the cost; Sunday is the scorecard', async () => {
    const { user } = await setup(false);
    const state = await loadState(env.DB, user);
    // Mon rest (first miss), Tue skip.
    await finalizeDays(env.DB, state, at('2026-11-17', '21:31'));
    const msg = renderRule('R1', state, at('2026-11-17', '21:31'));
    // Nothing trained yet, so Push (first in rotation, never trained) is still the plan.
    expect(msg.title).toBe('Skipped: Push');
    expect(msg.body).toMatch(
      /^Skipped: Push\. April target → Apr \d+ \(\+1\.2 days\)\. Push 0× this week \(plan 2×\)\./,
    );
    expect(msg.body).toMatch(
      /Tomorrow: Push\. Barbell bench press 50 kg × 5\. Check in by 07:30\. Commit\?$/,
    );

    await finalizeDays(env.DB, state, at('2026-11-22', '21:31'));
    const sunday = renderRule('R1', state, at('2026-11-22', '21:31'));
    expect(sunday.title).toBe('Week 47 scorecard');
    expect(sunday.url).toBe('/progress');
    expect(sunday.body).toMatch(/^Week 47: 0\/6 sessions\./);
  });

  it('morning messages use live numbers', async () => {
    const { user } = await setup(false);
    const state = await loadState(env.DB, user);
    expect(renderRule('R3', state, at('2026-11-16', '06:30'))).toEqual({
      title: 'Today: Push',
      body: 'Check-in window 07:00–07:30. Wedding 1: 43d.',
      url: '/today',
    });
    expect(renderRule('R4', state, at('2026-11-16', '07:08')).body).toMatch(
      /^Window closes in 22 min\. Skips this month: 0\./,
    );
    expect(renderRule('R6', state, at('2026-11-16', '07:15')).body).toBe(
      '15 min left in check-in window. 0/6 sessions this week.',
    );
    expect(renderRule('R7', state, at('2026-11-16', '07:30')).body).toMatch(/counts as rest/);
    expect(renderRule('R2', state, at('2026-11-16', '22:45')).body).toBe(
      'Lights out by 23:15 → 7h15m sleep before 06:30.',
    );
    expect(renderRule('R8', state, at('2026-11-16', '18:30')).body).toBe(
      'Rescue: 2.5h until 21:00. Push still open.',
    );
  });
});
