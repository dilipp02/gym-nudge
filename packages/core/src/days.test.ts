import { describe, expect, it } from 'vitest';
import { classifyDay, isPaused, restUsedWithin, type ClassifyInput } from './days';
import { session } from './fixtures';
import type { DayRecord } from './types';

const TZ = 'Asia/Kolkata'; // UTC+5:30, no DST
const settings = { timezone: TZ, checkinEnd: '07:30', rescueCutoff: '21:00' };
const DATE = '2026-11-20';

/** UTC ISO for a local Kolkata time on DATE. */
const at = (hhmm: string, date = DATE) => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return new Date(
    Date.UTC(
      ...((date.split('-').map(Number) as [number, number, number]).map((v, i) =>
        i === 1 ? v - 1 : v,
      ) as [number, number, number]),
      h,
      m,
    ) -
      330 * 60_000,
  ).toISOString();
};

const rec = (localDate: string, status: DayRecord['status'], walkLogged = false): DayRecord => ({
  localDate,
  status,
  walkLogged,
});

function input(over: Partial<ClassifyInput>): ClassifyInput {
  return {
    date: DATE,
    sessions: [],
    checkedInAt: null,
    pauses: [],
    priorDays: [],
    settings,
    ...over,
  };
}

describe('classifyDay', () => {
  it('trained: checked in by the end of the window and logged a session', () => {
    expect(
      classifyDay(
        input({ checkedInAt: at('07:12'), sessions: [session(DATE, 'push', [], at('08:30'))] }),
      ),
    ).toBe('trained');
    expect(
      classifyDay(
        input({ checkedInAt: at('06:55'), sessions: [session(DATE, 'push', [], at('08:10'))] }),
      ),
    ).toBe('trained');
    expect(
      classifyDay(
        input({ checkedInAt: at('07:30'), sessions: [session(DATE, 'push', [], at('08:40'))] }),
      ),
    ).toBe('trained');
  });

  it('rescue: checked in after the window, before the evening cutoff', () => {
    expect(
      classifyDay(
        input({ checkedInAt: at('07:31'), sessions: [session(DATE, 'push', [], at('08:50'))] }),
      ),
    ).toBe('rescue');
    expect(
      classifyDay(
        input({ checkedInAt: at('19:00'), sessions: [session(DATE, 'push', [], at('20:15'))] }),
      ),
    ).toBe('rescue');
  });

  it('a check-in without a logged session protects nothing', () => {
    expect(classifyDay(input({ checkedInAt: at('07:05') }))).toBe('rest');
    expect(
      classifyDay(input({ checkedInAt: at('07:05'), priorDays: [rec('2026-11-17', 'rest')] })),
    ).toBe('skip');
  });

  it('missing check-in: the save time stands in for it', () => {
    expect(classifyDay(input({ sessions: [session(DATE, 'push', [], at('07:20'))] }))).toBe(
      'trained',
    );
    expect(classifyDay(input({ sessions: [session(DATE, 'push', [], at('08:40'))] }))).toBe(
      'rescue',
    );
  });

  it('check-in after the cutoff does not count', () => {
    expect(
      classifyDay(
        input({ checkedInAt: at('21:05'), sessions: [session(DATE, 'push', [], at('22:00'))] }),
      ),
    ).toBe('rest');
  });

  it('a late log saved the next day still counts if the check-in was in the window', () => {
    expect(
      classifyDay(
        input({
          checkedInAt: at('07:10'),
          sessions: [session(DATE, 'push', [], at('09:00', '2026-11-21'))],
        }),
      ),
    ).toBe('trained');
  });

  it('training during a pause still counts; otherwise pause wins over rest and skip', () => {
    const pauses = [{ startDate: '2026-11-19', endDate: null }];
    expect(
      classifyDay(
        input({
          pauses,
          checkedInAt: at('07:00'),
          sessions: [session(DATE, 'push', [], at('08:00'))],
        }),
      ),
    ).toBe('trained');
    expect(classifyDay(input({ pauses, priorDays: [rec('2026-11-18', 'rest')] }))).toBe('pause');
  });

  it('rest is available once in any 7 days', () => {
    expect(classifyDay(input({ priorDays: [rec('2026-11-13', 'rest')] }))).toBe('rest'); // 7 days ago
    expect(classifyDay(input({ priorDays: [rec('2026-11-14', 'rest')] }))).toBe('skip'); // 6 days ago
  });
});

describe('helpers', () => {
  it('isPaused respects open and closed ranges', () => {
    expect(isPaused('2026-11-20', [{ startDate: '2026-11-18', endDate: '2026-11-20' }])).toBe(true);
    expect(isPaused('2026-11-21', [{ startDate: '2026-11-18', endDate: '2026-11-20' }])).toBe(
      false,
    );
    expect(isPaused('2026-11-21', [{ startDate: '2026-11-18', endDate: null }])).toBe(true);
  });

  it('restUsedWithin returns the most recent rest in the window', () => {
    const prior = [
      rec('2026-11-15', 'rest'),
      rec('2026-11-18', 'rest'),
      rec('2026-11-19', 'trained'),
    ];
    expect(restUsedWithin(DATE, prior)).toBe('2026-11-18');
    expect(restUsedWithin('2026-11-25', prior)).toBeNull();
  });
});
