import { addDays, daysBetween } from './time';
import type { LocalDate, Session, Stack } from './types';

/** A stack untrained this long gets called out in the evening message (spec §3). */
export const AVOIDED_AFTER_DAYS = 6;

export function lastTrainedDates(sessions: Session[]): Map<string, LocalDate> {
  const m = new Map<string, LocalDate>();
  for (const s of sessions) {
    const prev = m.get(s.stackId);
    if (!prev || s.localDate > prev) m.set(s.stackId, s.localDate);
  }
  return m;
}

const rotation = (stacks: Stack[]) =>
  stacks.filter((s) => s.inRotation && !s.isAddon).sort((a, b) => a.position - b.position);

/**
 * The in-rotation stack trained longest ago; never-trained stacks first, rotation
 * order breaks ties. Add-on stacks are never suggested on their own.
 */
export function suggestStack(stacks: Stack[], sessions: Session[]): Stack | null {
  const last = lastTrainedDates(sessions);
  let best: Stack | null = null;
  let bestDate: LocalDate | undefined;
  for (const s of rotation(stacks)) {
    const d = last.get(s.id);
    if (!best) {
      best = s;
      bestDate = d;
      continue;
    }
    if (d === undefined && bestDate !== undefined) {
      best = s;
      bestDate = d;
    } else if (d !== undefined && bestDate !== undefined && d < bestDate) {
      best = s;
      bestDate = d;
    }
  }
  return best;
}

export function trainedYesterday(stackId: string, sessions: Session[], today: LocalDate): boolean {
  const y = addDays(today, -1);
  return sessions.some((s) => s.stackId === stackId && s.localDate === y);
}

export function addonsFor(stack: Stack, stacks: Stack[]): Stack[] {
  return stack.addonIds
    .map((id) => stacks.find((s) => s.id === id))
    .filter((s): s is Stack => s != null);
}

/** In-rotation stacks untrained for `AVOIDED_AFTER_DAYS`+ days (never-trained counts from the start). */
export function avoidedStacks(
  stacks: Stack[],
  sessions: Session[],
  startDate: LocalDate,
  today: LocalDate,
): Array<{ stackId: string; name: string; days: number }> {
  const last = lastTrainedDates(sessions);
  return rotation(stacks)
    .map((s) => ({
      stackId: s.id,
      name: s.name,
      days: daysBetween(last.get(s.id) ?? startDate, today),
    }))
    .filter((x) => x.days >= AVOIDED_AFTER_DAYS)
    .sort((a, b) => b.days - a.days);
}

/** Sessions of a stack in the ISO week (Mon–Sun) containing `today`. */
export function timesThisWeek(stackId: string, sessions: Session[], today: LocalDate): number {
  const dow = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  const monday = addDays(today, -dow);
  return sessions.filter(
    (s) => s.stackId === stackId && s.localDate >= monday && s.localDate <= today,
  ).length;
}
