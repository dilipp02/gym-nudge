import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { call, createUser, json } from './helpers';

describe('goals', () => {
  it('lists seeded goals with one primary, and keeps exactly one primary', async () => {
    const { cookie } = await createUser();
    const goals = await json(await call('/goals', { cookie }));
    expect(goals.map((g: any) => g.name)).toEqual([
      'Wedding 1',
      'Wedding 2',
      'April',
      'North star',
    ]);
    expect(goals.filter((g: any) => g.isPrimary).map((g: any) => g.name)).toEqual(['April']);
    expect(goals[0].liftTargets).toHaveLength(4);

    const w2 = goals[1];
    const updated = await json(
      await call(`/goals/${w2.id}`, {
        cookie,
        method: 'PUT',
        json: { ...w2, date: '2027-02-12', isPrimary: true },
      }),
    );
    expect(updated).toMatchObject({ date: '2027-02-12', isPrimary: true });
    const after = await json(await call('/goals', { cookie }));
    expect(after.filter((g: any) => g.isPrimary).map((g: any) => g.name)).toEqual(['Wedding 2']);
  });

  it('creates and deletes goals; refuses deleting the primary', async () => {
    const { cookie } = await createUser();
    const created = await json(
      await call('/goals', { cookie, json: { name: 'Trip', date: '2027-06-01' } }),
    );
    expect(created).toMatchObject({ name: 'Trip', isPrimary: false, liftTargets: [] });
    expect((await call(`/goals/${created.id}`, { cookie, method: 'DELETE' })).status).toBe(204);
    const primary = (await json(await call('/goals', { cookie }))).find((g: any) => g.isPrimary);
    expect((await call(`/goals/${primary.id}`, { cookie, method: 'DELETE' })).status).toBe(409);
  });

  it("rejects lift targets for someone else's exercise", async () => {
    const a = await createUser();
    const b = await createUser();
    const bEx = (await json(await call('/stacks', { cookie: b.cookie })))[0].exercises[0];
    const res = await call('/goals', {
      cookie: a.cookie,
      json: {
        name: 'X',
        date: '2027-01-01',
        liftTargets: [{ exerciseId: bEx.id, targetWeight: 50, targetReps: 5 }],
      },
    });
    expect(res.status).toBe(400);
  });
});

describe('body metrics, pauses, settings', () => {
  it('records weight and waist, merging same-day entries', async () => {
    const { cookie } = await createUser();
    await call('/body-metrics', { cookie, json: { localDate: '2026-11-16', weightKg: 76 } });
    const merged = await json(
      await call('/body-metrics', { cookie, json: { localDate: '2026-11-16', waistCm: 88 } }),
    );
    expect(merged).toEqual({ localDate: '2026-11-16', weightKg: 76, waistCm: 88 });
    expect((await call('/body-metrics', { cookie, json: {} })).status).toBe(400);
  });

  it('starts and ends a pause, one at a time', async () => {
    const { cookie } = await createUser();
    const p = await json(await call('/pauses', { cookie, json: { reason: 'flu' } }));
    expect(p.endDate).toBeNull();
    expect((await call('/pauses', { cookie, json: {} })).status).toBe(409);
    const ended = await json(await call(`/pauses/${p.id}`, { cookie, method: 'PATCH' }));
    expect(ended.endDate).toBe(p.startDate);
    expect((await call(`/pauses/${p.id}`, { cookie, method: 'PATCH' })).status).toBe(404);
  });

  it('reads and updates settings and profile, validating times and zones', async () => {
    const { cookie } = await createUser();
    const before = await json(await call('/settings', { cookie }));
    expect(before.settings).toMatchObject({
      wakeTime: '06:30',
      checkinEnd: '07:30',
      timezone: 'Europe/London',
    });
    expect(before.settings.snoozeTokenHash).toBeUndefined();

    const res = await json(
      await call('/settings', {
        cookie,
        method: 'PUT',
        json: {
          settings: {
            wakeTime: '06:15',
            rulesEnabled: {
              R1: true,
              R2: false,
              R3: true,
              R4: true,
              R5: true,
              R6: true,
              R7: true,
              R8: true,
            },
          },
          profile: { timezone: 'Asia/Kolkata', heightCm: 183 },
        },
      }),
    );
    expect(res.settings).toMatchObject({ wakeTime: '06:15', timezone: 'Asia/Kolkata' });
    expect(res.settings.rulesEnabled.R2).toBe(false);
    expect(res.profile.heightCm).toBe(183);

    expect(
      (await call('/settings', { cookie, method: 'PUT', json: { settings: { wakeTime: '6:15' } } }))
        .status,
    ).toBe(400);
    expect(
      (
        await call('/settings', {
          cookie,
          method: 'PUT',
          json: { profile: { timezone: 'Mars/Olympus' } },
        })
      ).status,
    ).toBe(400);
  });

  it('issues a snooze link once and stores only its hash', async () => {
    const { cookie, user } = await createUser();
    const { token, url } = await json(
      await call('/settings/snooze-token/reset', { cookie, method: 'POST' }),
    );
    expect(url).toBe(`http://localhost:5180/api/hooks/snooze/${token}`);
    const row = await env.DB.prepare('SELECT snooze_token_hash FROM settings WHERE user_id = ?')
      .bind(user.id)
      .first<{ snooze_token_hash: string }>();
    expect(row?.snooze_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row?.snooze_token_hash).not.toContain(token);
  });
});
