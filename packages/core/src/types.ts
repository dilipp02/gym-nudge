/** Local calendar date in the user's time zone, `YYYY-MM-DD`. */
export type LocalDate = string;
/** Local wall-clock time, `HH:mm` (24h). */
export type HHMM = string;
/** IANA time zone, e.g. `Asia/Kolkata`. */
export type TimeZone = string;

export type ExerciseType = 'weighted' | 'bodyweight' | 'timed';

export interface Exercise {
  id: string;
  stackId: string;
  name: string;
  type: ExerciseType;
  sets: number;
  /** Reps for weighted/bodyweight; seconds for timed. */
  repMin: number;
  repMax: number;
  /** kg for weighted; seconds for timed; unused for bodyweight. */
  weightStep: number;
  /** First-time weight (kg) or seconds; null = none. */
  startWeight: number | null;
  isKeyLift: boolean;
  position: number;
}

export interface Stack {
  id: string;
  name: string;
  position: number;
  inRotation: boolean;
  isAddon: boolean;
  /** Add-on stacks appended to this one (e.g. Abs on Pull and Legs). */
  addonIds: string[];
  exercises: Exercise[];
}

export interface LoggedSet {
  exerciseId: string;
  type: ExerciseType;
  setIndex: number;
  /** kg (weighted) or added kg (bodyweight); null when not applicable. */
  weight: number | null;
  reps: number | null;
  seconds: number | null;
  skipped: boolean;
}

export interface Session {
  id: string;
  localDate: LocalDate;
  stackId: string;
  /** UTC ISO timestamp the log was saved. */
  loggedAt: string;
  sets: LoggedSet[];
}

export type DayStatus = 'pending' | 'trained' | 'rescue' | 'rest' | 'skip' | 'pause';

export interface DayRecord {
  localDate: LocalDate;
  status: DayStatus;
  walkLogged: boolean;
}

export interface Pause {
  startDate: LocalDate;
  /** Inclusive; null = still paused. */
  endDate: LocalDate | null;
}

export interface LiftTarget {
  exerciseId: string;
  targetWeight: number | null;
  targetReps: number;
}

export interface Goal {
  id: string;
  name: string;
  date: LocalDate;
  isPrimary: boolean;
  liftTargets: LiftTarget[];
}

export type RuleId = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7' | 'R8';

export interface Settings {
  timezone: TimeZone;
  wakeTime: HHMM;
  checkinStart: HHMM;
  checkinEnd: HHMM;
  rescueReminderTime: HHMM;
  rescueCutoff: HHMM;
  verdictTime: HHMM;
  sleepNudgeTime: HHMM;
  quietStart: HHMM;
  rulesEnabled: Record<RuleId, boolean>;
}

export const DEFAULT_SETTINGS: Omit<Settings, 'timezone'> = {
  wakeTime: '06:30',
  checkinStart: '07:00',
  checkinEnd: '07:30',
  rescueReminderTime: '18:30',
  rescueCutoff: '21:00',
  verdictTime: '21:30',
  sleepNudgeTime: '22:45',
  quietStart: '23:30',
  rulesEnabled: { R1: true, R2: true, R3: true, R4: true, R5: true, R6: true, R7: true, R8: true },
};

/** Gym days planned per week (spec §3). */
export const SESSIONS_PER_WEEK = 6;
