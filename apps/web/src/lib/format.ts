import { formatShortDate } from '@gym-nudge/core';

export { formatShortDate };

/** `+1.2` / `-2.0` days. */
export const signedDays = (n: number) => `${n >= 0 ? '+' : '-'}${Math.abs(n).toFixed(1)}`;

export const pct = (n: number) => `${Math.round(n * 100)}%`;

export const kg = (n: number | null | undefined) =>
  n == null ? '—' : Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');

/** Local `HH:mm` of an ISO time in the browser's zone. */
export const clock = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
    : '—';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const weekdayName = (date: string) => WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()]!;
