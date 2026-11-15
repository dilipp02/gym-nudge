import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { call, createUser, json } from './helpers';

// Europe/London in November is UTC, so these instants read as local times.
const START = '2026-11-16';
const at = (date: string, hhmm: string) => `${date}T${hhmm}:00.000Z`;

async function setup() {
  const u = await createUser({ timezone: 'Europe/London', startDate: START });
  const req = (path: string, time: string, init: Parameters<typeof call>[1] = {}) =>
    call(path, { ...init, cookie: u.cookie, headers: { 'X-Test-Now': time, ...init.headers } });
  return { ...u, req };
}

/** Log every planned set exactly as prefilled. */
function setsFromPlan(plan: any[]) {
  return plan.flatMap((p: any) =>
    p.sets.map((s: any, setIndex: number) => ({
      exerciseId: p.exerciseId,
      setIndex,
      weight: s.weight,
      reps: s.reps ?? (p.type === 'bodyweight' ? 6 : null),
      seconds: s.seconds,
      skipped: false,
    })),
  );
}

async function dayRow(userId: string, date: string) {
  return env.DB.prepare('SELECT * FROM day_records WHERE user_id = ? AND local_date = ?')
    .bind(userId, date)
    .first<any>();
}

describe('today + sessions + verdicts', () => {
  it('day 1: plan, check-in, log, report; idempotent re-save', async () => {
    const { req, user } = await setup();
    const today = await json(await req('/today', at(START, '06:40')));
    expect(today).toMatchObject({
      date: START,
      status: 'pending',
      restAvailable: true,
      paused: false,
    });
    expect(today.stacks.map((s: any) => s.name)).toEqual(['Push', 'Pull', 'Legs']);
    expect(today.stackId).toBe(today.suggestedStackId);
    const bench = today.plan[0];
    expect(bench).toMatchObject({ name: 'Barbell bench press', isKeyLift: true });
    expect(bench.sets).toHaveLength(3); // 4 sets, ramped to 2/3
    expect(bench.sets[0]).toEqual({ weight: 50, reps: 5, seconds: null });
    expect(today.nextMilestone).toEqual({ name: 'Wedding 1', date: '2026-12-29', daysLeft: 43 });

    const ci = await json(await req('/checkin', at(START, '07:05'), { method: 'POST' }));
    expect(ci).toEqual({ date: START, checkedInAt: at(START, '07:05') });

    const id = crypto.randomUUID();
    const body = { id, localDate: START, stackId: today.stackId, sets: setsFromPlan(today.plan) };
    const saved = await req('/sessions', at(START, '08:10'), { json: body });
    expect(saved.status).toBe(201);
    const { report } = await json(saved);
    expect(report.intensity).toEqual({ score: 75, completion: 50, volume: 15, progression: 10 });
    expect(report.prs).toEqual([]);
    expect(report.milestone).toMatchObject({ name: 'Wedding 1', daysLeft: 43 });
    expect(report.projection.primaryName).toBe('April');
    expect(report.projection.daysVsTarget).toBeCloseTo(-1 / 6, 2);

    const again = await req('/sessions', at(START, '08:12'), { json: body });
    expect(again.status).toBe(200);
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?')
      .bind(user.id)
      .first<{ n: number }>();
    expect(n?.n).toBe(1);

    // Next morning: day 1 is final (trained), Pull is suggested with the Abs add-on appended.
    const d2 = await json(await req('/today', at('2026-11-17', '06:40')));
    expect((await dayRow(user.id, START)).status).toBe('trained');
    const pull = d2.stacks.find((s: any) => s.id === d2.stackId);
    expect(pull.name).toBe('Pull');
    expect(d2.plan.map((p: any) => p.name)).toContain('Plank');
  });

  it('verdicts: first missed day is rest, second is a skip costing 7/6 days', async () => {
    const { req, user } = await setup();
    await req('/today', at('2026-11-16', '21:31'));
    expect((await dayRow(user.id, '2026-11-16')).status).toBe('rest');
    await req('/today', at('2026-11-17', '21:31'));
    const d2 = await dayRow(user.id, '2026-11-17');
    expect(d2.status).toBe('skip');
    expect(d2.skip_cost_days).toBeCloseTo(7 / 6);
    // Before the verdict time, today stays pending.
    await req('/today', at('2026-11-18', '21:00'));
    expect(await dayRow(user.id, '2026-11-18')).toBeNull();
  });

  it('check-in after the window → rescue', async () => {
    const { req, user } = await setup();
    const today = await json(await req('/today', at(START, '18:00')));
    await req('/checkin', at(START, '18:05'), { method: 'POST' });
    await req('/sessions', at(START, '19:00'), {
      json: {
        id: crypto.randomUUID(),
        localDate: START,
        stackId: today.stackId,
        sets: setsFromPlan(today.plan),
      },
    });
    await req('/today', at(START, '21:45'));
    expect((await dayRow(user.id, START)).status).toBe('rescue');
  });

  it('offline replay next morning: phone timestamps rescue a day already judged as rest', async () => {
    const { req, user } = await setup();
    const today = await json(await req('/today', at(START, '06:40')));
    await req('/today', at(START, '21:31'));
    expect((await dayRow(user.id, START)).status).toBe('rest');

    // Next morning the queued check-in and session finally sync.
    const ci = await json(
      await req('/checkin', at('2026-11-17', '06:45'), { json: { at: at(START, '07:04') } }),
    );
    expect(ci.date).toBe(START);
    const res = await req('/sessions', at('2026-11-17', '06:46'), {
      json: {
        id: crypto.randomUUID(),
        localDate: START,
        stackId: today.stackId,
        sets: setsFromPlan(today.plan),
        performedAt: at(START, '08:15'),
      },
    });
    expect(res.status).toBe(201);
    expect((await dayRow(user.id, START)).status).toBe('trained');
  });

  it('rejects future, locked, foreign-exercise and foreign-id sessions', async () => {
    const { req } = await setup();
    const other = await setup();
    const today = await json(await req('/today', at('2026-11-20', '07:00')));
    const sets = setsFromPlan(today.plan);
    const base = { stackId: today.stackId, sets };
    const t = at('2026-11-20', '08:00');
    expect(
      (
        await req('/sessions', t, {
          json: { ...base, id: crypto.randomUUID(), localDate: '2026-11-21' },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await req('/sessions', t, {
          json: { ...base, id: crypto.randomUUID(), localDate: '2026-11-18' },
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await req('/sessions', t, {
          json: { ...base, id: crypto.randomUUID(), localDate: '2026-11-19' },
        })
      ).status,
    ).toBe(201);

    const otherToday = await json(await other.req('/today', t));
    const foreign = setsFromPlan(otherToday.plan).slice(0, 1);
    expect(
      (
        await req('/sessions', t, {
          json: { ...base, id: crypto.randomUUID(), localDate: '2026-11-20', sets: foreign },
        })
      ).status,
    ).toBe(400);

    const id = crypto.randomUUID();
    await req('/sessions', t, { json: { ...base, id, localDate: '2026-11-20' } });
    const hijack = await other.req('/sessions', t, {
      json: {
        id,
        localDate: '2026-11-20',
        stackId: otherToday.stackId,
        sets: setsFromPlan(otherToday.plan),
      },
    });
    expect(hijack.status).toBe(409);
  });

  it('rest once per 7 days; commit; lights-out after midnight belongs to the evening', async () => {
    const { req, user } = await setup();
    expect((await req(`/days/${START}/rest`, at(START, '06:35'), { method: 'POST' })).status).toBe(
      200,
    );
    await req('/today', at(START, '21:31'));
    expect((await dayRow(user.id, START)).status).toBe('rest');
    expect(
      (await req('/days/2026-11-18/rest', at('2026-11-18', '06:35'), { method: 'POST' })).status,
    ).toBe(409);

    const today = await json(await req('/today', at('2026-11-18', '20:00')));
    const legs = today.stacks.find((s: any) => s.name === 'Legs');
    const commit = await json(
      await req('/commit', at('2026-11-18', '21:35'), { json: { stackId: legs.id } }),
    );
    expect(commit).toEqual({ date: '2026-11-19', committedStackId: legs.id });
    const next = await json(await req('/today', at('2026-11-19', '06:30')));
    expect(next.stackId).toBe(legs.id);

    const lo = await json(await req('/lights-out', at('2026-11-20', '00:30'), { method: 'POST' }));
    expect(lo.date).toBe('2026-11-19');
  });
});
