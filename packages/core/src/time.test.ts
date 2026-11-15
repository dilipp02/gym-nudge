import { describe, expect, it } from 'vitest';
import {
  addDays,
  atLocal,
  daysBetween,
  formatShortDate,
  hhmmToMinutes,
  isoWeek,
  localDate,
  localMinutes,
  localTime,
  minutesToHhmm,
  weekday,
} from './time';

describe('local date and time', () => {
  it.each([
    // [utc, tz, date, time]
    ['2026-11-15T01:30:00Z', 'Asia/Kolkata', '2026-11-15', '07:00'],
    ['2026-11-14T20:00:00Z', 'Asia/Kolkata', '2026-11-15', '01:30'],
    ['2026-11-15T12:00:00Z', 'America/New_York', '2026-11-15', '07:00'],
    ['2026-11-15T03:00:00Z', 'America/New_York', '2026-11-14', '22:00'],
    ['2026-07-01T06:30:00Z', 'Europe/London', '2026-07-01', '07:30'],
    ['2026-12-01T06:30:00Z', 'Europe/London', '2026-12-01', '06:30'],
  ])('%s in %s is %s %s', (utc, tz, date, time) => {
    expect(localDate(new Date(utc), tz)).toBe(date);
    expect(localTime(new Date(utc), tz)).toBe(time);
    expect(localMinutes(new Date(utc), tz)).toBe(hhmmToMinutes(time));
  });
});

describe('atLocal', () => {
  it('round-trips ordinary times', () => {
    for (const tz of ['Asia/Kolkata', 'America/New_York', 'Europe/London']) {
      const d = atLocal('2026-11-15', '06:30', tz);
      expect(localDate(d, tz)).toBe('2026-11-15');
      expect(localTime(d, tz)).toBe('06:30');
    }
  });

  it('handles US DST start (2027-03-14): 06:30 is EDT, UTC-4', () => {
    expect(atLocal('2027-03-14', '06:30', 'America/New_York').toISOString()).toBe(
      '2027-03-14T10:30:00.000Z',
    );
    expect(atLocal('2027-03-13', '06:30', 'America/New_York').toISOString()).toBe(
      '2027-03-13T11:30:00.000Z',
    );
  });

  it('resolves a time inside the spring-forward gap to just after it', () => {
    const d = atLocal('2027-03-14', '02:30', 'America/New_York');
    expect(localTime(d, 'America/New_York')).toBe('03:30');
  });

  it('handles UK DST end (2026-10-25): 06:30 is GMT again', () => {
    expect(atLocal('2026-10-25', '06:30', 'Europe/London').toISOString()).toBe(
      '2026-10-25T06:30:00.000Z',
    );
    expect(atLocal('2026-10-24', '06:30', 'Europe/London').toISOString()).toBe(
      '2026-10-24T05:30:00.000Z',
    );
  });
});

describe('date arithmetic', () => {
  it('adds days across months and years', () => {
    expect(addDays('2026-12-29', 3)).toBe('2027-01-01');
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
  });

  it('counts days between dates', () => {
    expect(daysBetween('2026-11-15', '2026-12-29')).toBe(44);
    expect(daysBetween('2026-12-29', '2026-11-15')).toBe(-44);
    expect(daysBetween('2026-11-15', '2027-04-15')).toBe(151);
  });

  it('knows weekdays and ISO weeks', () => {
    expect(weekday('2026-11-15')).toBe(0); // Sunday
    expect(weekday('2026-11-16')).toBe(1);
    expect(isoWeek('2026-11-15')).toBe('2026-W46');
    expect(isoWeek('2026-11-16')).toBe('2026-W47');
    expect(isoWeek('2027-01-01')).toBe('2026-W53');
  });

  it('formats times and dates', () => {
    expect(minutesToHhmm(hhmmToMinutes('06:30') + 20)).toBe('06:50');
    expect(minutesToHhmm(-15)).toBe('23:45');
    expect(formatShortDate('2027-04-13')).toBe('Apr 13');
    expect(() => hhmmToMinutes('7:00')).toThrow();
    expect(() => hhmmToMinutes('24:00')).toThrow();
  });
});
