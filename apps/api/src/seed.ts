// Default data for a new user (spec §2, §3.1). Everything here is editable in the app.
import type { ExerciseType } from '@gym-nudge/core';

interface SeedExercise {
  key?: 'bench' | 'squat' | 'deadlift' | 'pullups';
  name: string;
  type: ExerciseType;
  sets: number;
  repMin: number;
  repMax: number;
  step: number;
  start: number | null;
}

interface SeedStack {
  key: 'push' | 'pull' | 'legs' | 'abs';
  name: string;
  isAddon?: boolean;
  addons?: Array<SeedStack['key']>;
  exercises: SeedExercise[];
}

// Starting weights are conservative guesses for a returning lifter at 76 kg;
// week 1 sets the real baseline.
export const SEED_STACKS: SeedStack[] = [
  {
    key: 'push',
    name: 'Push',
    exercises: [
      {
        key: 'bench',
        name: 'Barbell bench press',
        type: 'weighted',
        sets: 4,
        repMin: 5,
        repMax: 8,
        step: 2.5,
        start: 50,
      },
      {
        name: 'Incline dumbbell press',
        type: 'weighted',
        sets: 3,
        repMin: 8,
        repMax: 10,
        step: 2,
        start: 16,
      },
      {
        name: 'Seated dumbbell shoulder press',
        type: 'weighted',
        sets: 3,
        repMin: 8,
        repMax: 10,
        step: 2,
        start: 14,
      },
      {
        name: 'Cable lateral raise',
        type: 'weighted',
        sets: 3,
        repMin: 12,
        repMax: 15,
        step: 1,
        start: 5,
      },
      {
        name: 'Triceps rope pushdown',
        type: 'weighted',
        sets: 3,
        repMin: 10,
        repMax: 12,
        step: 2.5,
        start: 20,
      },
      {
        name: 'Overhead cable triceps extension',
        type: 'weighted',
        sets: 2,
        repMin: 10,
        repMax: 12,
        step: 2.5,
        start: 15,
      },
    ],
  },
  {
    key: 'pull',
    name: 'Pull',
    addons: ['abs'],
    exercises: [
      {
        key: 'deadlift',
        name: 'Deadlift',
        type: 'weighted',
        sets: 3,
        repMin: 5,
        repMax: 5,
        step: 5,
        start: 80,
      },
      {
        key: 'pullups',
        name: 'Pull-ups',
        type: 'bodyweight',
        sets: 3,
        repMin: 5,
        repMax: 10,
        step: 0,
        start: null,
      },
      {
        name: 'Barbell row',
        type: 'weighted',
        sets: 3,
        repMin: 6,
        repMax: 8,
        step: 2.5,
        start: 45,
      },
      {
        name: 'Lat pulldown',
        type: 'weighted',
        sets: 3,
        repMin: 10,
        repMax: 12,
        step: 2.5,
        start: 40,
      },
      {
        name: 'Face pull',
        type: 'weighted',
        sets: 3,
        repMin: 15,
        repMax: 15,
        step: 2.5,
        start: 15,
      },
      {
        name: 'Dumbbell curl',
        type: 'weighted',
        sets: 3,
        repMin: 10,
        repMax: 12,
        step: 1,
        start: 10,
      },
      {
        name: 'Hammer curl',
        type: 'weighted',
        sets: 2,
        repMin: 10,
        repMax: 12,
        step: 1,
        start: 10,
      },
    ],
  },
  {
    key: 'legs',
    name: 'Legs',
    addons: ['abs'],
    exercises: [
      {
        key: 'squat',
        name: 'Back squat',
        type: 'weighted',
        sets: 4,
        repMin: 5,
        repMax: 8,
        step: 5,
        start: 60,
      },
      {
        name: 'Romanian deadlift',
        type: 'weighted',
        sets: 3,
        repMin: 8,
        repMax: 10,
        step: 5,
        start: 50,
      },
      { name: 'Leg press', type: 'weighted', sets: 3, repMin: 10, repMax: 12, step: 5, start: 80 },
      {
        name: 'Walking lunges (per leg)',
        type: 'weighted',
        sets: 2,
        repMin: 10,
        repMax: 10,
        step: 2,
        start: 10,
      },
      {
        name: 'Lying leg curl',
        type: 'weighted',
        sets: 3,
        repMin: 10,
        repMax: 12,
        step: 2.5,
        start: 25,
      },
      {
        name: 'Standing calf raise',
        type: 'weighted',
        sets: 3,
        repMin: 12,
        repMax: 15,
        step: 5,
        start: 40,
      },
    ],
  },
  {
    key: 'abs',
    name: 'Abs',
    isAddon: true,
    exercises: [
      {
        name: 'Hanging knee raise',
        type: 'bodyweight',
        sets: 3,
        repMin: 10,
        repMax: 15,
        step: 0,
        start: null,
      },
      {
        name: 'Cable crunch',
        type: 'weighted',
        sets: 3,
        repMin: 12,
        repMax: 15,
        step: 2.5,
        start: 25,
      },
      { name: 'Plank', type: 'timed', sets: 3, repMin: 45, repMax: 60, step: 5, start: 45 },
      {
        name: 'Pallof press (per side)',
        type: 'weighted',
        sets: 2,
        repMin: 12,
        repMax: 12,
        step: 1,
        start: 10,
      },
    ],
  },
];

interface SeedGoal {
  name: string;
  date: string;
  isPrimary: boolean;
  waistDelta: number | null;
  weightMin: number | null;
  weightMax: number | null;
  // Upper end of each target range (spec §2.2).
  lifts: Partial<Record<NonNullable<SeedExercise['key']>, { weight: number | null; reps: number }>>;
}

export const SEED_GOALS: SeedGoal[] = [
  {
    name: 'Wedding 1',
    date: '2026-12-29',
    isPrimary: false,
    waistDelta: -3,
    weightMin: 75,
    weightMax: 76,
    lifts: {
      bench: { weight: 60, reps: 5 },
      squat: { weight: 80, reps: 5 },
      deadlift: { weight: 100, reps: 5 },
      pullups: { weight: null, reps: 5 },
    },
  },
  {
    name: 'Wedding 2',
    date: '2027-02-14',
    isPrimary: false,
    waistDelta: -4,
    weightMin: 75.5,
    weightMax: 76.5,
    lifts: {
      bench: { weight: 70, reps: 5 },
      squat: { weight: 90, reps: 5 },
      deadlift: { weight: 110, reps: 5 },
      pullups: { weight: null, reps: 8 },
    },
  },
  {
    name: 'April',
    date: '2027-04-15',
    isPrimary: true,
    waistDelta: -5,
    weightMin: 76,
    weightMax: 77,
    lifts: {
      bench: { weight: 80, reps: 5 },
      squat: { weight: 105, reps: 5 },
      deadlift: { weight: 130, reps: 5 },
      pullups: { weight: null, reps: 10 },
    },
  },
  {
    name: 'North star',
    date: '2027-11-15',
    isPrimary: false,
    waistDelta: null,
    weightMin: 79,
    weightMax: 81,
    lifts: {},
  },
];

/** SQL statements that create a new user's stacks, exercises and goals. */
export function seedStatements(db: D1Database, userId: string): D1PreparedStatement[] {
  const stmts: D1PreparedStatement[] = [];
  const stackIds = new Map<string, string>();
  const keyLiftIds = new Map<string, string>();
  for (const s of SEED_STACKS) stackIds.set(s.key, crypto.randomUUID());

  SEED_STACKS.forEach((s, position) => {
    const stackId = stackIds.get(s.key)!;
    stmts.push(
      db
        .prepare(
          'INSERT INTO stacks (id, user_id, name, position, in_rotation, is_addon) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .bind(stackId, userId, s.name, position, s.isAddon ? 0 : 1, s.isAddon ? 1 : 0),
    );
    s.exercises.forEach((e, i) => {
      const exId = crypto.randomUUID();
      if (e.key) keyLiftIds.set(e.key, exId);
      stmts.push(
        db
          .prepare(
            `INSERT INTO exercises (id, user_id, stack_id, name, type, sets, rep_min, rep_max, weight_step, start_weight, is_key_lift, position)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            exId,
            userId,
            stackId,
            e.name,
            e.type,
            e.sets,
            e.repMin,
            e.repMax,
            e.step,
            e.start,
            e.key ? 1 : 0,
            i,
          ),
      );
    });
  });
  for (const s of SEED_STACKS) {
    for (const a of s.addons ?? []) {
      stmts.push(
        db
          .prepare('INSERT INTO stack_addons (stack_id, addon_stack_id) VALUES (?, ?)')
          .bind(stackIds.get(s.key)!, stackIds.get(a)!),
      );
    }
  }
  for (const g of SEED_GOALS) {
    const goalId = crypto.randomUUID();
    stmts.push(
      db
        .prepare(
          `INSERT INTO goals (id, user_id, name, date, is_primary, waist_target_delta_cm, weight_min, weight_max)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          goalId,
          userId,
          g.name,
          g.date,
          g.isPrimary ? 1 : 0,
          g.waistDelta,
          g.weightMin,
          g.weightMax,
        ),
    );
    for (const [key, t] of Object.entries(g.lifts)) {
      stmts.push(
        db
          .prepare(
            'INSERT INTO goal_lift_targets (goal_id, exercise_id, target_weight, target_reps) VALUES (?, ?, ?, ?)',
          )
          .bind(goalId, keyLiftIds.get(key)!, t.weight, t.reps),
      );
    }
  }
  return stmts;
}
