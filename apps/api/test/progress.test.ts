import { describe, expect, it } from 'vitest';
import { call, createUser, json } from './helpers';

const START = '2026-11-16'; // Monday; Europe/London = UTC in November
const at = (date: string, hhmm: string) => `${date}T${hhmm}:00.000Z`;

async function setup() {
  const u = await createUser({ timezone: 'Europe/London', startDate: START });
  const req = (path: string, time: string, init: Parameters<typeof call>[1] = {}) =>
    call(path, { ...init, cookie: u.cookie, headers: { 'X-Test-Now': time, ...init.headers } });

  /** Check in at 07:05 and log the plan for `stackName`, optionally overriding the first exercise's weight. */
  async function train(date: string, stackName: string, firstWeight?: number) {
    const base = await json(await req('/today', at(date, '06:40')));
    const stackId = base.stacks.find((s: any) => s.name === stackName).id;
    const today = await json(await req(`/today?stackId=${stackId}`, at(date, '06:41')));
    await req('/checkin', at(date, '07:05'), { method: 'POST' });
    const sets = today.plan.flatMap((p: any, i: number) =>
      p.sets.map((s: any, setIndex: number) => ({
        exerciseId: p.exerciseId,
        setIndex,
        weight: i === 0 && firstWeight != null ? firstWeight : s.weight,
        reps: s.reps ?? 6,
        seconds: s.seconds,
      })),
    );
    const res = await req('/sessions', at(date, '08:05'), {
      json: { id: crypto.randomUUID(), localDate: date, stackId, sets },
    });
    return json(res);
  }
  return { ...u, req, train };
}

describe('progress and scorecard', () => {
  it('reflects a real week: projection, streak, calendar, milestones', async () => {
    const { req, train } = await setup();
    await train('2026-11-16', 'Push'); // Mon trained
    // Tue: nothing (rest), Wed: nothing (skip)
    const thu = await train('2026-11-19', 'Push', 52.5); // Thu trained, bench PR
    expect(thu.report.prs.map((p: any) => p.name)).toEqual(['Barbell bench press']);

    const p = await json(await req('/progress', at('2026-11-19', '22:00')));
    expect(p.asOf).toBe('2026-11-19');
    expect(p.calendar.slice(-4).map((d: any) => d.status)).toEqual([
      'trained',
      'rest',
      'skip',
      'trained',
    ]);
    expect(p.calendar[0].status).toBeNull(); // before the start date
    expect(p.streak).toEqual({ current: 1, best: 1 });
    // 4 days at 6/7 per day = 3.43 planned sessions; 2 done → 1.43 behind × 7/6 = 1.67 days.
    expect(p.projection.daysVsTarget).toBeCloseTo(4 - 7 / 3, 2);
    expect(p.projection.primaryName).toBe('April');
    expect(p.milestones[0].name).toBe('Wedding 1');
    // Still week 1: the best lift so far *is* the baseline, so progress reads 0%.
    const bench = p.milestones[0].lifts.find((l: any) => l.name === 'Barbell bench press');
    expect(bench.baseline).toBeCloseTo(52.5 * (1 + 5 / 30));
    expect(bench.current).toBeCloseTo(bench.baseline);
    expect(bench.pct).toBe(0);
    // 2 Push sessions over the 4 days since the start → 3.5 per week.
    expect(p.stackFrequency.find((s: any) => s.name === 'Push').perWeek).toBeCloseTo(3.5);
    expect(p.frequencyWindowDays).toBe(4);
  });

  it('weekly scorecard', async () => {
    const { req, train } = await setup();
    await train('2026-11-16', 'Push');
    await train('2026-11-19', 'Push', 52.5);
    const sc = await json(await req('/scorecard?week=2026-W47', at('2026-11-22', '22:00')));
    expect(sc).toMatchObject({
      week: '2026-W47',
      monday: '2026-11-16',
      sunday: '2026-11-22',
      sessions: 2,
      planned: 6,
      prs: 1,
      volumeChange: null,
      pausedDays: 0,
      primaryName: 'April',
    });
    // Mon–Sun: 2 sessions where 6 were planned → 4 behind × 7/6 ≈ 4.67 days.
    expect(sc.daysChangeThisWeek).toBeCloseTo(7 - 2 * (7 / 6), 2);
    expect((await req('/scorecard?week=nope', at('2026-11-22', '22:00'))).status).toBe(400);
  });

  it('exports JSON and CSV for the signed-in user only', async () => {
    const { req, train, user } = await setup();
    await train('2026-11-16', 'Push');
    const other = await setup();
    await other.train('2026-11-16', 'Legs');

    const res = await req('/export', at('2026-11-16', '22:00'));
    expect(res.headers.get('content-disposition')).toMatch(/attachment/);
    const data = await json(res);
    expect(data.users).toHaveLength(1);
    expect(data.users[0].id).toBe(user.id);
    expect(data.sessions).toHaveLength(1);
    expect(data.session_sets.length).toBeGreaterThan(10);
    expect(data.settings[0].snooze_token_hash).toBeUndefined();

    const csv = await (await req('/export/sessions.csv', at('2026-11-16', '22:00'))).text();
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe(
      'date,session_id,exercise,type,set,weight,reps,seconds,skipped,intensity',
    );
    expect(lines.slice(1).every((l) => l.startsWith('2026-11-16,'))).toBe(true);
    expect(csv).toContain('Barbell bench press');
    expect(csv).not.toContain('Back squat');
  });
});
