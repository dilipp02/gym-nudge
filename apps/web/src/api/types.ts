// Response shapes from the Worker API (apps/api). Kept in one place so screens agree.
import type {
  Exercise,
  ExerciseType,
  LocalDate,
  MilestoneProgress,
  PlannedExercise,
  Projection,
  RuleId,
  Stack,
} from '@gym-nudge/core';

export type { Exercise, ExerciseType, PlannedExercise, RuleId, Stack };

export interface User {
  id: string;
  timezone: string;
  age: number | null;
  sex: string | null;
  heightCm: number | null;
  startDate: LocalDate;
}

export type DayStatus = 'pending' | 'trained' | 'rescue' | 'rest' | 'skip' | 'pause';

export interface TodayResponse {
  date: LocalDate;
  status: DayStatus;
  checkedInAt: string | null;
  restDeclared: boolean;
  walkLogged: boolean;
  paused: boolean;
  restAvailable: boolean;
  restUsedOn: LocalDate | null;
  window: { start: string; end: string };
  rescueCutoff: string;
  stacks: Array<{ id: string; name: string }>;
  suggestedStackId: string | null;
  stackId: string | null;
  trainedYesterday: boolean;
  plan: PlannedExercise[];
  sessionsToday: Array<{ id: string; stackId: string; intensity: number | null }>;
  nextMilestone: { name: string; date: LocalDate; daysLeft: number } | null;
  tomorrow: { suggestedStackId: string | null; committedStackId: string | null };
}

export interface SessionReport {
  intensity: { score: number; completion: number; volume: number; progression: number };
  prs: Array<{ exerciseId: string; name: string; value: number; previous: number }>;
  milestone: {
    name: string;
    date: LocalDate;
    daysLeft: number;
    baselineWeek: boolean;
    lifts: Array<{ name: string; before: number; after: number; onTrack: boolean }>;
  } | null;
  projection: { primaryName: string; onPlan: LocalDate; daysVsTarget: number } | null;
}

export interface ProgressResponse {
  today: LocalDate;
  asOf: LocalDate;
  projection: (Projection & { primaryName: string; primaryDate: LocalDate }) | null;
  milestones: MilestoneProgress[];
  calendar: Array<{ date: LocalDate; status: DayStatus | null }>;
  streak: { current: number; best: number };
  body: {
    weight: { baseline: number | null; latest: number | null };
    waist: { baseline: number | null; latest: number | null; targetNow: number | null };
    target: { name: string; weightMin: number | null; weightMax: number | null } | null;
  };
  stackFrequency: Array<{ stackId: string; name: string; perWeek: number }>;
  frequencyWindowDays: number;
}

export interface Goal {
  id: string;
  name: string;
  date: LocalDate;
  isPrimary: boolean;
  waistTargetDeltaCm: number | null;
  weightMin: number | null;
  weightMax: number | null;
  liftTargets: Array<{ exerciseId: string; targetWeight: number | null; targetReps: number }>;
}

export interface Settings {
  timezone: string;
  wakeTime: string;
  checkinStart: string;
  checkinEnd: string;
  rescueReminderTime: string;
  rescueCutoff: string;
  verdictTime: string;
  sleepNudgeTime: string;
  quietStart: string;
  rulesEnabled: Record<RuleId, boolean>;
  measurementWeekday: number;
}

export interface Pause {
  id: string;
  startDate: LocalDate;
  endDate: LocalDate | null;
  reason: string | null;
}

export interface BodyMetric {
  localDate: LocalDate;
  weightKg: number | null;
  waistCm: number | null;
}
