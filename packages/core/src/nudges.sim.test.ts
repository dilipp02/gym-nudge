// Full-day simulations of the nudge engine on a fake clock (plan 2.10).
// The cron runs every 5 minutes; user events happen at exact local times.
import { describe, expect, it } from 'vitest';
import { dueRules, snoozeDue, type DayState, type NudgeState } from './nudges';
import { atLocal, localDate, localTime } from './time';
import { DEFAULT_SETTINGS, type RuleId, type Settings } from './types';

type Event =
  | { at: string; do: 'open' | 'checkin' | 'session' | 'rest' | 'lightsOut' }
  | { at: string; do: 'snooze' };

interface SimOptions {
  date?: string;
  tz?: string;
  events?: Event[];
  /** Cron down for ticks in [from, to) local time. */
  cronDown?: [string, string];
  settings?: Partial<Settings>;
  initial?: Partial<DayState>;
}

function simulate(opts: SimOptions = {}) {
  const date = opts.date ?? '2026-11-18';
  const tz = opts.tz ?? 'Europe/London';
  const settings: Settings = { ...DEFAULT_SETTINGS, timezone: tz, ...opts.settings };
  const day: DayState = {
    localDate: date,
    checkedIn: false,
    sessionLogged: false,
    restDeclared: false,
    paused: false,
    openedSinceWake: false,
    lightsOut: false,
    ...opts.initial,
  };
  const sent = new Set<RuleId>();
  let lastSnooze: Date | null = null;
  const log: string[] = [];
  const instants: string[] = [];

  // Timeline: every 5-minute cron tick of the local day, plus each event.
  type Item = { t: number; kind: 'tick' } | { t: number; kind: 'event'; e: Event };
  const items: Item[] = [];
  const dayStart = atLocal(date, '00:00', tz).getTime();
  for (let t = dayStart; localDate(new Date(t), tz) === date; t += 5 * 60_000) {
    items.push({ t, kind: 'tick' });
  }
  for (const e of opts.events ?? [])
    items.push({ t: atLocal(date, e.at, tz).getTime(), kind: 'event', e });
  items.sort((a, b) => a.t - b.t || (a.kind === 'event' ? -1 : 1));

  const down: [number, number] | undefined = opts.cronDown && [
    atLocal(date, opts.cronDown[0], tz).getTime(),
    atLocal(date, opts.cronDown[1], tz).getTime(),
  ];

  for (const item of items) {
    const now = new Date(item.t);
    const state = (): NudgeState => ({
      settings,
      day,
      sentToday: sent,
      lastSnoozeNudgeAt: lastSnooze,
    });
    if (item.kind === 'event') {
      const e = item.e;
      if (e.do === 'snooze') {
        if (snoozeDue(state(), now)) {
          lastSnooze = now;
          log.push(`${localTime(now, tz)} R4`);
        }
      } else if (e.do === 'open') day.openedSinceWake = true;
      else if (e.do === 'checkin') day.checkedIn = true;
      else if (e.do === 'session') day.sessionLogged = true;
      else if (e.do === 'rest') day.restDeclared = true;
      else if (e.do === 'lightsOut') day.lightsOut = true;
      continue;
    }
    if (down && item.t >= down[0] && item.t < down[1]) continue;
    for (const r of dueRules(state(), now)) {
      sent.add(r.ruleId);
      log.push(`${localTime(now, tz)} ${r.ruleId}`);
      instants.push(`${r.ruleId} ${r.scheduledAt.toISOString()}`);
    }
  }
  return { log, instants };
}

const goodMorning: Event[] = [
  { at: '06:32', do: 'open' },
  { at: '07:08', do: 'checkin' },
  { at: '08:20', do: 'session' },
];

describe('nudge engine: full days', () => {
  it('1. good day → wake + verdict only', () => {
    const { log } = simulate({ events: [...goodMorning, { at: '22:30', do: 'lightsOut' }] });
    expect(log).toEqual(['06:30 R3', '21:30 R1']);
  });

  it('2. snoozing three times, out the door late', () => {
    const { log } = simulate({
      events: [
        { at: '06:31', do: 'snooze' },
        { at: '06:33', do: 'snooze' }, // within 5 min → ignored
        { at: '06:40', do: 'snooze' },
        { at: '06:49', do: 'snooze' },
        { at: '06:52', do: 'open' },
        { at: '07:20', do: 'checkin' },
        { at: '08:35', do: 'session' },
      ],
    });
    expect(log).toEqual([
      '06:30 R3',
      '06:31 R4',
      '06:40 R4',
      '06:49 R4',
      '06:50 R5',
      '07:15 R6',
      '21:30 R1',
      '22:45 R2',
    ]);
  });

  it('3. missed morning, rescued in the evening', () => {
    const { log } = simulate({
      events: [
        { at: '07:40', do: 'open' },
        { at: '18:00', do: 'checkin' },
        { at: '19:10', do: 'session' },
        { at: '22:40', do: 'lightsOut' },
      ],
    });
    expect(log).toEqual(['06:30 R3', '06:50 R5', '07:15 R6', '07:30 R7', '21:30 R1']);
  });

  it('4. missed morning, nothing all day', () => {
    const { log } = simulate();
    expect(log).toEqual([
      '06:30 R3',
      '06:50 R5',
      '07:15 R6',
      '07:30 R7',
      '18:30 R8',
      '21:30 R1',
      '22:45 R2',
    ]);
  });

  it('5a. rest declared after waking turns off the rest of the morning', () => {
    const { log } = simulate({ events: [{ at: '06:35', do: 'rest' }] });
    expect(log).toEqual(['06:30 R3', '21:30 R1', '22:45 R2']);
  });

  it('5b. rest declared the night before also skips the wake nudge', () => {
    const { log } = simulate({ initial: { restDeclared: true } });
    expect(log).toEqual(['21:30 R1', '22:45 R2']);
  });

  it('6. pause → only the evening status line', () => {
    const { log } = simulate({
      initial: { paused: true },
      events: [{ at: '06:31', do: 'snooze' }],
    });
    expect(log).toEqual(['21:30 R1']);
  });

  it('7. DST spring-forward (New York, 2027-03-14): local times hold, UTC shifts', () => {
    const { log, instants } = simulate({
      date: '2027-03-14',
      tz: 'America/New_York',
      events: [...goodMorning, { at: '22:30', do: 'lightsOut' }],
    });
    expect(log).toEqual(['06:30 R3', '21:30 R1']);
    expect(instants).toEqual(['R3 2027-03-14T10:30:00.000Z', 'R1 2027-03-15T01:30:00.000Z']);
  });

  it('8. cron down 06:40–07:20: R5 dropped (too late), R6 sent 5 min late', () => {
    const { log } = simulate({ cronDown: ['06:40', '07:20'] });
    expect(log).toEqual(['06:30 R3', '07:20 R6', '07:30 R7', '18:30 R8', '21:30 R1', '22:45 R2']);
  });

  it('9. a disabled rule never fires', () => {
    const { log } = simulate({
      settings: { rulesEnabled: { ...DEFAULT_SETTINGS.rulesEnabled, R2: false, R8: false } },
    });
    expect(log).not.toContain('22:45 R2');
    expect(log).not.toContain('18:30 R8');
  });

  it('10. quiet hours block scheduled rules but not an early snooze', () => {
    const { log } = simulate({
      settings: { sleepNudgeTime: '23:45' },
      events: [{ at: '05:50', do: 'snooze' }, ...goodMorning],
    });
    expect(log).toEqual(['05:50 R4', '06:30 R3', '21:30 R1']);
  });

  it('11. no snooze response after check-in or after the window closes', () => {
    const { log } = simulate({
      events: [
        { at: '06:32', do: 'open' },
        { at: '06:58', do: 'checkin' },
        { at: '07:05', do: 'snooze' },
        { at: '08:00', do: 'session' },
      ],
    });
    expect(log.filter((l) => l.endsWith('R4'))).toEqual([]);

    const late = simulate({
      initial: { openedSinceWake: true },
      events: [{ at: '07:31', do: 'snooze' }],
    });
    expect(late.log.filter((l) => l.endsWith('R4'))).toEqual([]);
  });

  it('12. different settings move every rule with them', () => {
    const { log } = simulate({
      settings: {
        wakeTime: '05:45',
        checkinStart: '06:15',
        checkinEnd: '06:45',
        verdictTime: '21:00',
      },
    });
    expect(log.slice(0, 4)).toEqual(['05:45 R3', '06:05 R5', '06:30 R6', '06:45 R7']);
    expect(log).toContain('21:00 R1');
  });
});

describe('dueRules guards', () => {
  it('refuses a day state for the wrong date', () => {
    const settings: Settings = { ...DEFAULT_SETTINGS, timezone: 'Europe/London' };
    const day: DayState = {
      localDate: '2026-11-17',
      checkedIn: false,
      sessionLogged: false,
      restDeclared: false,
      paused: false,
      openedSinceWake: false,
      lightsOut: false,
    };
    expect(() =>
      dueRules(
        { settings, day, sentToday: new Set(), lastSnoozeNudgeAt: null },
        new Date('2026-11-18T06:30:00Z'),
      ),
    ).toThrow(/2026-11-18/);
  });
});
