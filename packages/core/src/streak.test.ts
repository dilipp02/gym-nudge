import { describe, expect, it } from 'vitest';
import { breaks, patternWarning, streak, trailingSkips } from './streak';
import { addDays } from './time';
import type { DayRecord, DayStatus } from './types';

/** Build consecutive day records from a compact code: T trained, R rescue, W rest+walk, r rest, S skip, P pause. */
function days(code: string, start = '2026-11-16'): DayRecord[] {
  const map: Record<string, [DayStatus, boolean]> = {
    T: ['trained', false],
    R: ['rescue', false],
    W: ['rest', true],
    r: ['rest', false],
    S: ['skip', false],
    P: ['pause', false],
    '.': ['pending', false],
  };
  return [...code].map((c, i) => {
    const [status, walkLogged] = map[c]!;
    return { localDate: addDays(start, i), status, walkLogged };
  });
}

describe('streak', () => {
  it.each([
    ['TTTTTT', 6, 6],
    ['TTTWTT', 6, 6],
    ['TTTrTT', 2, 3],
    ['TTSTT', 2, 2],
    ['TTPPTT', 4, 4],
    ['TRT', 3, 3],
    ['TTTTSTT', 2, 4],
    ['TTT.', 3, 3], // pending ignored
    ['', 0, 0],
  ])('%s → current %i, best %i', (code, current, best) => {
    expect(streak(days(code))).toEqual({ current, best });
  });
});

describe('trailingSkips', () => {
  it('counts skips at the end, passing over pauses', () => {
    expect(trailingSkips(days('TTSS'))).toBe(2);
    expect(trailingSkips(days('TSPS'))).toBe(2);
    expect(trailingSkips(days('TSrS'))).toBe(1);
    expect(trailingSkips(days('TTT'))).toBe(0);
  });
});

describe('breaks', () => {
  it('finds runs of 7+ non-training days, ignoring pauses', () => {
    // Second run: r S S (P P) S S S S → 7 counted days; the pauses don't count or split it.
    const b = breaks(days('T' + 'SSrSSSS' + 'T' + 'rSSPPSSSS' + 'T' + 'SSSS'));
    expect(b).toHaveLength(2);
    expect(b[0]).toMatchObject({
      start: '2026-11-17',
      length: 7,
      startedWithDoubleSkip: true,
      ongoing: false,
    });
    expect(b[1]).toMatchObject({ length: 7, startedWithDoubleSkip: false, ongoing: false });
    // Six counted days is not a break.
    expect(breaks(days('T' + 'rSSPPSSS' + 'T'))).toHaveLength(0);
  });

  it('marks a break that runs to the latest day as ongoing', () => {
    const b = breaks(days('T' + 'SSSSSSSS'));
    expect(b).toEqual([expect.objectContaining({ ongoing: true, length: 8 })]);
  });
});

describe('patternWarning', () => {
  const twoBreaksBothDouble = 'T' + 'SSSSSSS' + 'T' + 'SSrSSSS' + 'T';
  const oneDouble = 'T' + 'SSSSSSS' + 'T' + 'rSSSSSS' + 'T';

  it('fires only on exactly the second skip in a row', () => {
    expect(patternWarning(days(twoBreaksBothDouble + 'TS'))).toBeNull();
    expect(patternWarning(days(twoBreaksBothDouble + 'TSS'))).toEqual({ k: 2, n: 2 });
    expect(patternWarning(days(twoBreaksBothDouble + 'TSSS'))).toBeNull();
  });

  it('counts how many past breaks began with two skips', () => {
    expect(patternWarning(days(oneDouble + 'SS'))).toEqual({ k: 1, n: 2 });
  });

  it('needs at least 2 finished breaks', () => {
    expect(patternWarning(days('T' + 'SSSSSSS' + 'T' + 'SS'))).toBeNull();
    expect(patternWarning(days('TTTSS'))).toBeNull();
  });
});
