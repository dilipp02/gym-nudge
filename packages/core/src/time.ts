import type { HHMM, LocalDate, TimeZone } from './types';

const MS_PER_MIN = 60_000;
const MS_PER_DAY = 86_400_000;

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: TimeZone): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(tz, f);
  }
  return f;
}

interface Parts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function parts(utc: Date, tz: TimeZone): Parts {
  const out: Record<string, number> = {};
  for (const p of formatter(tz).formatToParts(utc)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return {
    year: out.year!,
    month: out.month!,
    day: out.day!,
    hour: out.hour!,
    minute: out.minute!,
    second: out.second!,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Offset of `tz` from UTC at instant `utcMs`, in milliseconds (local − UTC). */
function offsetMs(utcMs: number, tz: TimeZone): number {
  const p = parts(new Date(utcMs), tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** Local calendar date of a UTC instant. */
export function localDate(utc: Date, tz: TimeZone): LocalDate {
  const p = parts(utc, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Local wall-clock time of a UTC instant, `HH:mm`. */
export function localTime(utc: Date, tz: TimeZone): HHMM {
  const p = parts(utc, tz);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** Minutes since local midnight for a UTC instant. */
export function localMinutes(utc: Date, tz: TimeZone): number {
  const p = parts(utc, tz);
  return p.hour * 60 + p.minute;
}

/** `HH:mm` → minutes since midnight. */
export function hhmmToMinutes(t: HHMM): number {
  const m = /^(\d{2}):(\d{2})$/.exec(t);
  if (!m) throw new Error(`Invalid time: ${t}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw new Error(`Invalid time: ${t}`);
  return h * 60 + min;
}

/** Minutes since midnight → `HH:mm` (wraps around the day). */
export function minutesToHhmm(mins: number): HHMM {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/**
 * The UTC instant of local wall time `time` on local date `date` in `tz`.
 * A time inside a spring-forward gap resolves to the instant just after the
 * gap (e.g. 02:30 on a 02:00→03:00 night becomes 03:30 local).
 */
export function atLocal(date: LocalDate, time: HHMM, tz: TimeZone): Date {
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number];
  const mins = hhmmToMinutes(time);
  const wallAsUtc = Date.UTC(y, mo - 1, d, Math.floor(mins / 60), mins % 60);
  const first = wallAsUtc - offsetMs(wallAsUtc, tz);
  const second = wallAsUtc - offsetMs(first, tz);
  if (first === second) return new Date(first);
  // Offsets differ around a DST change: keep the candidate that really shows
  // this wall time; in a spring-forward gap neither does, so take the later one.
  for (const c of [second, first]) {
    if (localMinutes(new Date(c), tz) === mins && localDate(new Date(c), tz) === date) {
      return new Date(c);
    }
  }
  return new Date(Math.max(first, second));
}

function dateToUtcNoon(date: LocalDate): number {
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, mo - 1, d, 12);
}

/** Shift a local date by whole days. */
export function addDays(date: LocalDate, days: number): LocalDate {
  const t = new Date(dateToUtcNoon(date) + days * MS_PER_DAY);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Whole days from `a` to `b` (positive when `b` is later). */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  return Math.round((dateToUtcNoon(b) - dateToUtcNoon(a)) / MS_PER_DAY);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date: LocalDate): number {
  return new Date(dateToUtcNoon(date)).getUTCDay();
}

/** ISO-8601 week label, e.g. `2026-W47`. */
export function isoWeek(date: LocalDate): string {
  const t = new Date(dateToUtcNoon(date));
  const day = (t.getUTCDay() + 6) % 7; // Monday = 0
  t.setUTCDate(t.getUTCDate() - day + 3); // Thursday of this week
  const year = t.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const fDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - fDay + 3);
  const week = 1 + Math.round((t.getTime() - firstThursday.getTime()) / (7 * MS_PER_DAY));
  return `${year}-W${pad(week)}`;
}

/** Minutes between two instants (b − a). */
export function minutesBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / MS_PER_MIN;
}

/** Short display date, e.g. `Apr 13`. */
export function formatShortDate(date: LocalDate): string {
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const [, mo, d] = date.split('-').map(Number) as [number, number, number];
  return `${months[mo - 1]} ${d}`;
}
