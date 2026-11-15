import { describe, expect, it } from 'vitest';
import {
  r1Verdict,
  r2Sleep,
  r3Wake,
  r4Snooze,
  r5Move,
  r6LastCall,
  r7WindowClosed,
  r8Rescue,
  scorecard,
  signedDays,
} from './messages';

const tomorrow = {
  stackName: 'Legs',
  keyLift: { name: 'Squat', weight: 72.5, reps: 5, delta: 2.5 },
  checkinEnd: '07:30',
};

describe('R1 verdict', () => {
  it('trained day', () => {
    expect(
      r1Verdict({ verdict: { status: 'trained', stackName: 'Pull', intensity: 87 }, tomorrow }),
    ).toEqual({
      title: 'Pull done · 87',
      body: 'Done: Pull. Intensity 87. Tomorrow: Legs. Squat 72.5 kg × 5 (+2.5). Check in by 07:30. Commit?',
      url: '/today',
    });
  });

  it('skip day with cost, pattern warning and avoided stack', () => {
    const m = r1Verdict({
      verdict: { status: 'skip', stackName: 'Legs' },
      skipCost: {
        primaryName: 'April',
        projected: '2027-04-17',
        addedDays: 7 / 6,
        stackName: 'Legs',
        timesThisWeek: 1,
        lift: { name: 'Squat', before: 0.58, after: 0.55 },
      },
      pattern: { k: 3, n: 4 },
      avoided: [{ name: 'Legs', days: 9 }],
      tomorrow,
    });
    expect(m.title).toBe('Skipped: Legs');
    expect(m.body).toBe(
      'Skipped: Legs. April target → Apr 17 (+1.2 days). Legs 1× this week (plan 2×). Squat milestone 58% → 55%. ' +
        '2 skips in a row. 3 of your last 4 breaks started this way. ' +
        'Legs: 9 days. ' +
        'Tomorrow: Legs. Squat 72.5 kg × 5 (+2.5). Check in by 07:30. Commit?',
    );
  });

  it('rest days, with and without the walk', () => {
    expect(r1Verdict({ verdict: { status: 'rest', walkLogged: true }, tomorrow }).body).toMatch(
      /^Rest day used\. Walk logged\. Tomorrow/,
    );
    expect(r1Verdict({ verdict: { status: 'rest', walkLogged: false }, tomorrow }).body).toMatch(
      /No walk: streak reset\./,
    );
  });

  it('pause sends a short status line only', () => {
    expect(
      r1Verdict({
        verdict: { status: 'pause' },
        tomorrow,
        pause: { primaryName: 'April', projected: '2027-04-18', daysVsTarget: 3 },
      }),
    ).toEqual({
      title: 'Paused',
      body: 'Paused. April target: Apr 18 (+3.0 days vs plan).',
      url: '/today',
    });
  });

  it('bodyweight key lift with no weight change', () => {
    const m = r1Verdict({
      verdict: { status: 'rescue', stackName: 'Push', intensity: 71 },
      tomorrow: {
        stackName: 'Pull',
        keyLift: { name: 'Pull-ups', weight: null, reps: 7, delta: null },
        checkinEnd: '07:30',
      },
    });
    expect(m.body).toBe(
      'Rescue: Push (evening). Intensity 71. Tomorrow: Pull. Pull-ups 7 reps. Check in by 07:30. Commit?',
    );
  });
});

describe('Sunday scorecard', () => {
  it('summarises the week and opens Progress', () => {
    expect(
      scorecard({
        week: '2026-W48',
        sessions: 5,
        planned: 6,
        volumeChange: 0.08,
        prs: 2,
        primaryName: 'April',
        projected: '2027-04-11',
        daysChangeThisWeek: -2,
        milestone: { name: 'Wedding 1', onTrack: 3, total: 4 },
        pausedDays: 1,
      }),
    ).toEqual({
      title: 'Week 48 scorecard',
      body: 'Week 48: 5/6 sessions. Total volume +8%. 2 PRs. April target Apr 11 (-2.0 days this week). Wedding 1: 3/4 lifts on track. Paused days: 1.',
      url: '/progress',
    });
  });
});

describe('R2–R8', () => {
  it('renders each rule in data-coach tone', () => {
    expect(
      r2Sleep({ lightsOutBy: '23:15', sleep: '7h15m', wake: '06:30', avgBedtime: '23:48' }).body,
    ).toBe('Lights out by 23:15 → 7h15m sleep before 06:30. Last 7 days avg bedtime 23:48.');
    expect(
      r3Wake({
        stackName: 'Legs',
        checkinStart: '07:00',
        checkinEnd: '07:30',
        nextMilestone: { name: 'Wedding 1', daysLeft: 44 },
      }),
    ).toEqual({
      title: 'Today: Legs',
      body: 'Check-in window 07:00–07:30. Wedding 1: 44d.',
      url: '/today',
    });
    expect(
      r4Snooze({
        minutesLeft: 22,
        skipsThisMonth: 2,
        primaryName: 'April',
        projected: '2027-04-13',
      }).body,
    ).toBe('Window closes in 22 min. Skips this month: 2. April target: Apr 13.');
    expect(r5Move({ checkinBy: '07:15' }).body).toBe('Leave in 10 min to check in by 07:15.');
    expect(r6LastCall({ minutesLeft: 15, doneThisWeek: 0, planned: 6 }).body).toBe(
      '15 min left in check-in window. 0/6 sessions this week.',
    );
    expect(r7WindowClosed({ countsAs: 'skip', rescueCutoff: '21:00' }).body).toBe(
      'Morning missed. Today counts as skip unless you train by 21:00. Evening session still counts.',
    );
    expect(r8Rescue({ hoursLeft: 2.5, rescueCutoff: '21:00', stackName: 'Legs' }).body).toBe(
      'Rescue: 2.5h until 21:00. Legs still open.',
    );
  });

  it('formats signed days', () => {
    expect(signedDays(1.1667)).toBe('+1.2');
    expect(signedDays(-2)).toBe('-2.0');
    expect(signedDays(0)).toBe('+0.0');
  });
});
