import { describe, expect, it } from 'vitest';
import { session, stack } from './fixtures';
import { addonsFor, avoidedStacks, suggestStack, timesThisWeek, trainedYesterday } from './stacks';

const push = stack({ id: 'push', name: 'Push', position: 0, addonIds: [] });
const pull = stack({ id: 'pull', name: 'Pull', position: 1, addonIds: ['abs'] });
const legs = stack({ id: 'legs', name: 'Legs', position: 2, addonIds: ['abs'] });
const abs = stack({ id: 'abs', name: 'Abs', position: 3, isAddon: true });
const old = stack({ id: 'old', name: 'Old', position: 4, inRotation: false });
const all = [push, pull, legs, abs, old];

describe('suggestStack', () => {
  it('starts with the first stack in rotation order', () => {
    expect(suggestStack(all, [])!.id).toBe('push');
  });

  it('prefers never-trained stacks, then the one trained longest ago', () => {
    expect(suggestStack(all, [session('2026-11-16', 'push', [])])!.id).toBe('pull');
    const sessions = [
      session('2026-11-16', 'push', []),
      session('2026-11-17', 'pull', []),
      session('2026-11-18', 'legs', []),
      session('2026-11-19', 'push', []),
    ];
    expect(suggestStack(all, sessions)!.id).toBe('pull');
  });

  it('never suggests add-ons or stacks out of rotation', () => {
    const sessions = ['push', 'pull', 'legs'].map((id) => session('2026-11-20', id, []));
    expect(['push', 'pull', 'legs']).toContain(suggestStack(all, sessions)!.id);
    expect(suggestStack([abs, old], [])).toBeNull();
  });

  it('breaks ties by rotation order', () => {
    const sessions = ['legs', 'pull', 'push'].map((id) => session('2026-11-20', id, []));
    expect(suggestStack(all, sessions)!.id).toBe('push');
  });
});

describe('guardrails', () => {
  it('knows when a stack was trained yesterday', () => {
    const sessions = [session('2026-11-19', 'pull', [])];
    expect(trainedYesterday('pull', sessions, '2026-11-20')).toBe(true);
    expect(trainedYesterday('pull', sessions, '2026-11-21')).toBe(false);
  });

  it('lists stacks untrained for 6+ days, longest first', () => {
    const sessions = [session('2026-11-17', 'push', []), session('2026-11-20', 'pull', [])];
    expect(avoidedStacks(all, sessions, '2026-11-16', '2026-11-25')).toEqual([
      { stackId: 'legs', name: 'Legs', days: 9 },
      { stackId: 'push', name: 'Push', days: 8 },
    ]);
  });

  it('resolves add-ons and counts sessions this week (Mon–Sun)', () => {
    expect(addonsFor(legs, all).map((s) => s.id)).toEqual(['abs']);
    const sessions = [
      session('2026-11-15', 'legs', []), // Sunday of the previous week
      session('2026-11-16', 'legs', []), // Monday
      session('2026-11-19', 'legs', []),
    ];
    expect(timesThisWeek('legs', sessions, '2026-11-20')).toBe(2);
  });
});
