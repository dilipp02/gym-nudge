import { describe, expect, it } from 'vitest';
import { call, createUser, json } from './helpers';

const exerciseBody = {
  name: 'Cable fly',
  type: 'weighted',
  sets: 3,
  repMin: 10,
  repMax: 12,
  weightStep: 2.5,
  startWeight: 15,
  isKeyLift: false,
};

describe('stacks', () => {
  it('lists the seeded stacks in rotation order with add-ons linked', async () => {
    const { cookie } = await createUser();
    const stacks = await json(await call('/stacks', { cookie }));
    expect(stacks.map((s: any) => s.name)).toEqual(['Push', 'Pull', 'Legs', 'Abs']);
    const abs = stacks.find((s: any) => s.name === 'Abs');
    expect(abs.isAddon).toBe(true);
    expect(stacks.find((s: any) => s.name === 'Legs').addonIds).toEqual([abs.id]);
    expect(stacks[0].exercises[0]).toMatchObject({
      name: 'Barbell bench press',
      isKeyLift: true,
      sets: 4,
    });
  });

  it('full create / edit / reorder / delete flow', async () => {
    const { cookie } = await createUser();
    const created = await json(await call('/stacks', { cookie, json: { name: 'Arms' } }));
    expect(created).toMatchObject({
      name: 'Arms',
      inRotation: true,
      isAddon: false,
      exercises: [],
    });

    const a = await json(
      await call(`/stacks/${created.id}/exercises`, { cookie, json: exerciseBody }),
    );
    const b = await json(
      await call(`/stacks/${created.id}/exercises`, {
        cookie,
        json: {
          ...exerciseBody,
          name: 'Dips',
          type: 'bodyweight',
          weightStep: 0,
          startWeight: null,
        },
      }),
    );
    expect([a.position, b.position]).toEqual([0, 1]);

    const reordered = await json(
      await call(`/stacks/${created.id}/exercises/order`, {
        cookie,
        method: 'PATCH',
        json: { ids: [b.id, a.id] },
      }),
    );
    expect(reordered.exercises.map((e: any) => e.name)).toEqual(['Dips', 'Cable fly']);

    const edited = await json(
      await call(`/stacks/${created.id}/exercises/${a.id}`, {
        cookie,
        method: 'PATCH',
        json: { sets: 4, isKeyLift: true },
      }),
    );
    expect(edited).toMatchObject({ sets: 4, isKeyLift: true, name: 'Cable fly' });

    expect(
      (await call(`/stacks/${created.id}/exercises/${b.id}`, { cookie, method: 'DELETE' })).status,
    ).toBe(204);
    const renamed = await json(
      await call(`/stacks/${created.id}`, {
        cookie,
        method: 'PATCH',
        json: { name: 'Arms day', inRotation: false },
      }),
    );
    expect(renamed).toMatchObject({ name: 'Arms day', inRotation: false });
    expect(renamed.exercises.map((e: any) => e.name)).toEqual(['Cable fly']);

    const all = await json(await call('/stacks', { cookie }));
    const ids = all.map((s: any) => s.id).reverse();
    const order = await json(
      await call('/stacks/order', { cookie, method: 'PATCH', json: { ids } }),
    );
    expect(order[0].id).toBe(created.id);

    const dup = await json(
      await call(`/stacks/${created.id}/duplicate`, { cookie, method: 'POST' }),
    );
    expect(dup).toMatchObject({ name: 'Arms day (copy)', inRotation: false });
    expect(dup.exercises).toHaveLength(1);

    expect((await call(`/stacks/${created.id}`, { cookie, method: 'DELETE' })).status).toBe(204);
    const after = await json(await call('/stacks', { cookie }));
    expect(after.some((s: any) => s.id === created.id)).toBe(false);
  });

  it('validates input', async () => {
    const { cookie } = await createUser();
    const stacks = await json(await call('/stacks', { cookie }));
    const push = stacks[0];
    expect((await call('/stacks', { cookie, json: { name: '' } })).status).toBe(400);
    expect(
      (
        await call(`/stacks/${push.id}/exercises`, {
          cookie,
          json: { ...exerciseBody, repMin: 12, repMax: 8 },
        })
      ).status,
    ).toBe(400);
    const ex = push.exercises[0];
    expect(
      (
        await call(`/stacks/${push.id}/exercises/${ex.id}`, {
          cookie,
          method: 'PATCH',
          json: { repMin: 99 },
        })
      ).status,
    ).toBe(400);
    expect(
      (await call('/stacks/order', { cookie, method: 'PATCH', json: { ids: [push.id] } })).status,
    ).toBe(400);
    // Only add-on stacks can be attached as add-ons.
    expect(
      (
        await call(`/stacks/${push.id}`, {
          cookie,
          method: 'PATCH',
          json: { addonIds: [stacks[1].id] },
        })
      ).status,
    ).toBe(400);
  });

  it('isolates users from each other', async () => {
    const a = await createUser();
    const b = await createUser();
    const aStacks = await json(await call('/stacks', { cookie: a.cookie }));
    const target = aStacks[0];
    expect(
      (
        await call(`/stacks/${target.id}`, {
          cookie: b.cookie,
          method: 'PATCH',
          json: { name: 'hacked' },
        })
      ).status,
    ).toBe(404);
    expect(
      (await call(`/stacks/${target.id}`, { cookie: b.cookie, method: 'DELETE' })).status,
    ).toBe(404);
    expect(
      (await call(`/stacks/${target.id}/exercises`, { cookie: b.cookie, json: exerciseBody }))
        .status,
    ).toBe(404);
    expect(
      (
        await call(`/stacks/${target.id}/exercises/${target.exercises[0].id}`, {
          cookie: b.cookie,
          method: 'DELETE',
        })
      ).status,
    ).toBe(404);
    const still = await json(await call('/stacks', { cookie: a.cookie }));
    expect(still[0].name).toBe('Push');
  });

  it('requires sign-in', async () => {
    expect((await call('/stacks')).status).toBe(401);
  });
});
