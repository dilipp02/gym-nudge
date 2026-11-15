// D1 queries. Maps snake_case rows to @gym-nudge/core types. Every query is scoped by user_id.
import {
  DEFAULT_SETTINGS,
  type DayStatus,
  type Exercise,
  type ExerciseType,
  type Goal,
  type LocalDate,
  type LoggedSet,
  type Pause,
  type RuleId,
  type Session,
  type Settings,
  type Stack,
} from '@gym-nudge/core';

type Row = Record<string, unknown>;
const bool = (v: unknown) => v === 1 || v === true;
const num = (v: unknown) => (v == null ? null : Number(v));
const str = (v: unknown) => (v == null ? null : String(v));

// ---------- users ----------

export interface User {
  id: string;
  timezone: string;
  age: number | null;
  sex: string | null;
  heightCm: number | null;
  startDate: LocalDate;
  createdAt: string;
}

const toUser = (r: Row): User => ({
  id: String(r.id),
  timezone: String(r.timezone),
  age: num(r.age),
  sex: str(r.sex),
  heightCm: num(r.height_cm),
  startDate: String(r.start_date),
  createdAt: String(r.created_at),
});

export async function getUser(db: D1Database, id: string): Promise<User | null> {
  const r = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<Row>();
  return r ? toUser(r) : null;
}

export async function countUsers(db: D1Database): Promise<number> {
  const r = await db.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
  return r?.n ?? 0;
}

export async function listUsers(db: D1Database): Promise<User[]> {
  const { results } = await db.prepare('SELECT * FROM users').all<Row>();
  return results.map(toUser);
}

export function insertUserStatements(db: D1Database, user: User): D1PreparedStatement[] {
  const s = DEFAULT_SETTINGS;
  return [
    db
      .prepare(
        'INSERT INTO users (id, timezone, age, sex, height_cm, start_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(
        user.id,
        user.timezone,
        user.age,
        user.sex,
        user.heightCm,
        user.startDate,
        user.createdAt,
      ),
    db
      .prepare(
        `INSERT INTO settings (user_id, wake_time, checkin_start, checkin_end, rescue_reminder_time, rescue_cutoff,
          verdict_time, sleep_nudge_time, quiet_start, rules_enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        user.id,
        s.wakeTime,
        s.checkinStart,
        s.checkinEnd,
        s.rescueReminderTime,
        s.rescueCutoff,
        s.verdictTime,
        s.sleepNudgeTime,
        s.quietStart,
        JSON.stringify(s.rulesEnabled),
      ),
  ];
}

export async function updateProfile(
  db: D1Database,
  userId: string,
  p: Partial<Pick<User, 'timezone' | 'age' | 'sex' | 'heightCm'>>,
): Promise<void> {
  const cols: Record<string, unknown> = {
    timezone: p.timezone,
    age: p.age,
    sex: p.sex,
    height_cm: p.heightCm,
  };
  await updateColumns(db, 'users', 'id = ?', [userId], cols);
}

/** UPDATE only the provided (non-undefined) columns. */
async function updateColumns(
  db: D1Database,
  table: string,
  where: string,
  whereArgs: unknown[],
  cols: Record<string, unknown>,
): Promise<number> {
  const entries = Object.entries(cols).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return 0;
  const set = entries.map(([k]) => `${k} = ?`).join(', ');
  const res = await db
    .prepare(`UPDATE ${table} SET ${set} WHERE ${where}`)
    .bind(...entries.map(([, v]) => v), ...whereArgs)
    .run();
  return res.meta.changes ?? 0;
}

// ---------- settings ----------

export interface UserSettings extends Settings {
  measurementWeekday: number;
}

const toSettings = (r: Row, timezone: string): UserSettings => ({
  timezone,
  wakeTime: String(r.wake_time),
  checkinStart: String(r.checkin_start),
  checkinEnd: String(r.checkin_end),
  rescueReminderTime: String(r.rescue_reminder_time),
  rescueCutoff: String(r.rescue_cutoff),
  verdictTime: String(r.verdict_time),
  sleepNudgeTime: String(r.sleep_nudge_time),
  quietStart: String(r.quiet_start),
  rulesEnabled: {
    ...DEFAULT_SETTINGS.rulesEnabled,
    ...(JSON.parse(String(r.rules_enabled)) as Record<RuleId, boolean>),
  },
  measurementWeekday: Number(r.measurement_weekday),
});

export async function getSettings(db: D1Database, user: User): Promise<UserSettings> {
  const r = await db.prepare('SELECT * FROM settings WHERE user_id = ?').bind(user.id).first<Row>();
  if (!r) throw new Error(`No settings for user ${user.id}`);
  return toSettings(r, user.timezone);
}

export async function updateSettings(
  db: D1Database,
  userId: string,
  s: Partial<Omit<UserSettings, 'timezone'>>,
): Promise<void> {
  await updateColumns(db, 'settings', 'user_id = ?', [userId], {
    wake_time: s.wakeTime,
    checkin_start: s.checkinStart,
    checkin_end: s.checkinEnd,
    rescue_reminder_time: s.rescueReminderTime,
    rescue_cutoff: s.rescueCutoff,
    verdict_time: s.verdictTime,
    sleep_nudge_time: s.sleepNudgeTime,
    quiet_start: s.quietStart,
    rules_enabled: s.rulesEnabled ? JSON.stringify(s.rulesEnabled) : undefined,
    measurement_weekday: s.measurementWeekday,
  });
}

export async function setSnoozeTokenHash(db: D1Database, userId: string, hash: string) {
  await db
    .prepare('UPDATE settings SET snooze_token_hash = ? WHERE user_id = ?')
    .bind(hash, userId)
    .run();
}

export async function userIdBySnoozeHash(db: D1Database, hash: string): Promise<string | null> {
  const r = await db
    .prepare('SELECT user_id FROM settings WHERE snooze_token_hash = ?')
    .bind(hash)
    .first<{ user_id: string }>();
  return r?.user_id ?? null;
}

// ---------- stacks & exercises ----------

const toExercise = (r: Row): Exercise => ({
  id: String(r.id),
  stackId: String(r.stack_id),
  name: String(r.name),
  type: String(r.type) as ExerciseType,
  sets: Number(r.sets),
  repMin: Number(r.rep_min),
  repMax: Number(r.rep_max),
  weightStep: Number(r.weight_step),
  startWeight: num(r.start_weight),
  isKeyLift: bool(r.is_key_lift),
  position: Number(r.position),
});

/** Live (non-deleted) stacks with their live exercises and add-on links, in rotation order. */
export async function listStacks(db: D1Database, userId: string): Promise<Stack[]> {
  const [stacks, exercises, addons] = await db.batch<Row>([
    db
      .prepare('SELECT * FROM stacks WHERE user_id = ? AND deleted_at IS NULL ORDER BY position')
      .bind(userId),
    db
      .prepare('SELECT * FROM exercises WHERE user_id = ? AND deleted_at IS NULL ORDER BY position')
      .bind(userId),
    db
      .prepare(
        `SELECT a.stack_id, a.addon_stack_id FROM stack_addons a
         JOIN stacks s ON s.id = a.addon_stack_id
         WHERE s.user_id = ? AND s.deleted_at IS NULL`,
      )
      .bind(userId),
  ]);
  return stacks!.results.map((s) => ({
    id: String(s.id),
    name: String(s.name),
    position: Number(s.position),
    inRotation: bool(s.in_rotation),
    isAddon: bool(s.is_addon),
    addonIds: addons!.results
      .filter((a) => a.stack_id === s.id)
      .map((a) => String(a.addon_stack_id)),
    exercises: exercises!.results.filter((e) => e.stack_id === s.id).map(toExercise),
  }));
}

/** Every exercise ever created (including deleted), for naming history and milestones. */
export async function listAllExercises(db: D1Database, userId: string): Promise<Exercise[]> {
  const { results } = await db
    .prepare('SELECT * FROM exercises WHERE user_id = ?')
    .bind(userId)
    .all<Row>();
  return results.map(toExercise);
}

export async function stackOwned(
  db: D1Database,
  userId: string,
  stackId: string,
): Promise<boolean> {
  const r = await db
    .prepare('SELECT 1 FROM stacks WHERE id = ? AND user_id = ? AND deleted_at IS NULL')
    .bind(stackId, userId)
    .first();
  return r != null;
}

export async function nextStackPosition(db: D1Database, userId: string): Promise<number> {
  const r = await db
    .prepare(
      'SELECT COALESCE(MAX(position), -1) + 1 AS p FROM stacks WHERE user_id = ? AND deleted_at IS NULL',
    )
    .bind(userId)
    .first<{ p: number }>();
  return r?.p ?? 0;
}

export async function nextExercisePosition(db: D1Database, stackId: string): Promise<number> {
  const r = await db
    .prepare(
      'SELECT COALESCE(MAX(position), -1) + 1 AS p FROM exercises WHERE stack_id = ? AND deleted_at IS NULL',
    )
    .bind(stackId)
    .first<{ p: number }>();
  return r?.p ?? 0;
}

export async function insertStack(
  db: D1Database,
  userId: string,
  s: { id: string; name: string; position: number; inRotation: boolean; isAddon: boolean },
) {
  await db
    .prepare(
      'INSERT INTO stacks (id, user_id, name, position, in_rotation, is_addon) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .bind(s.id, userId, s.name, s.position, s.inRotation ? 1 : 0, s.isAddon ? 1 : 0)
    .run();
}

export async function updateStack(
  db: D1Database,
  userId: string,
  stackId: string,
  p: { name?: string; inRotation?: boolean; isAddon?: boolean },
): Promise<number> {
  return updateColumns(
    db,
    'stacks',
    'id = ? AND user_id = ? AND deleted_at IS NULL',
    [stackId, userId],
    {
      name: p.name,
      in_rotation: p.inRotation === undefined ? undefined : p.inRotation ? 1 : 0,
      is_addon: p.isAddon === undefined ? undefined : p.isAddon ? 1 : 0,
    },
  );
}

export async function setStackAddons(db: D1Database, stackId: string, addonIds: string[]) {
  await db.batch([
    db.prepare('DELETE FROM stack_addons WHERE stack_id = ?').bind(stackId),
    ...addonIds.map((a) =>
      db
        .prepare('INSERT INTO stack_addons (stack_id, addon_stack_id) VALUES (?, ?)')
        .bind(stackId, a),
    ),
  ]);
}

export async function softDeleteStack(
  db: D1Database,
  userId: string,
  stackId: string,
  now: string,
) {
  const res = await db.batch([
    db
      .prepare(
        'UPDATE stacks SET deleted_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
      )
      .bind(now, stackId, userId),
    db
      .prepare('UPDATE exercises SET deleted_at = ? WHERE stack_id = ? AND deleted_at IS NULL')
      .bind(now, stackId),
    db
      .prepare('DELETE FROM stack_addons WHERE stack_id = ? OR addon_stack_id = ?')
      .bind(stackId, stackId),
  ]);
  return res[0]!.meta.changes ?? 0;
}

export async function reorder(
  db: D1Database,
  table: 'stacks' | 'exercises',
  userId: string,
  ids: string[],
) {
  await db.batch(
    ids.map((id, position) =>
      db
        .prepare(`UPDATE ${table} SET position = ? WHERE id = ? AND user_id = ?`)
        .bind(position, id, userId),
    ),
  );
}

export interface ExerciseInput {
  name: string;
  type: ExerciseType;
  sets: number;
  repMin: number;
  repMax: number;
  weightStep: number;
  startWeight: number | null;
  isKeyLift: boolean;
}

export async function insertExercise(
  db: D1Database,
  userId: string,
  stackId: string,
  id: string,
  position: number,
  e: ExerciseInput,
) {
  await db
    .prepare(
      `INSERT INTO exercises (id, user_id, stack_id, name, type, sets, rep_min, rep_max, weight_step, start_weight, is_key_lift, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      userId,
      stackId,
      e.name,
      e.type,
      e.sets,
      e.repMin,
      e.repMax,
      e.weightStep,
      e.startWeight,
      e.isKeyLift ? 1 : 0,
      position,
    )
    .run();
}

export async function updateExercise(
  db: D1Database,
  userId: string,
  exerciseId: string,
  e: Partial<ExerciseInput>,
): Promise<number> {
  return updateColumns(
    db,
    'exercises',
    'id = ? AND user_id = ? AND deleted_at IS NULL',
    [exerciseId, userId],
    {
      name: e.name,
      type: e.type,
      sets: e.sets,
      rep_min: e.repMin,
      rep_max: e.repMax,
      weight_step: e.weightStep,
      start_weight: e.startWeight,
      is_key_lift: e.isKeyLift === undefined ? undefined : e.isKeyLift ? 1 : 0,
    },
  );
}

export async function softDeleteExercise(
  db: D1Database,
  userId: string,
  exerciseId: string,
  now: string,
) {
  return updateColumns(
    db,
    'exercises',
    'id = ? AND user_id = ? AND deleted_at IS NULL',
    [exerciseId, userId],
    {
      deleted_at: now,
    },
  );
}

// ---------- sessions ----------

export type StoredSession = Session & { intensity: number | null };

export async function listSessions(db: D1Database, userId: string): Promise<StoredSession[]> {
  const [sessions, sets] = await db.batch<Row>([
    db
      .prepare('SELECT * FROM sessions WHERE user_id = ? ORDER BY local_date, logged_at')
      .bind(userId),
    db
      .prepare(
        `SELECT ss.* FROM session_sets ss JOIN sessions s ON s.id = ss.session_id
         WHERE s.user_id = ? ORDER BY ss.exercise_id, ss.set_index`,
      )
      .bind(userId),
  ]);
  const bySession = new Map<string, LoggedSet[]>();
  for (const r of sets!.results) {
    const list = bySession.get(String(r.session_id)) ?? [];
    list.push({
      exerciseId: String(r.exercise_id),
      type: String(r.exercise_type) as ExerciseType,
      setIndex: Number(r.set_index),
      weight: num(r.weight),
      reps: num(r.reps),
      seconds: num(r.seconds),
      skipped: bool(r.skipped),
    });
    bySession.set(String(r.session_id), list);
  }
  return sessions!.results.map((r) => ({
    id: String(r.id),
    localDate: String(r.local_date),
    stackId: String(r.stack_id),
    loggedAt: String(r.logged_at),
    intensity: num(r.intensity),
    sets: bySession.get(String(r.id)) ?? [],
  }));
}

export async function sessionOwner(db: D1Database, sessionId: string): Promise<string | null> {
  const r = await db
    .prepare('SELECT user_id FROM sessions WHERE id = ?')
    .bind(sessionId)
    .first<{ user_id: string }>();
  return r?.user_id ?? null;
}

/** Insert or replace a session and its sets atomically (idempotent by client id). */
export async function upsertSession(
  db: D1Database,
  userId: string,
  s: Session,
  names: Map<string, string>,
  intensity: number,
  snapshot: unknown,
) {
  await db.batch([
    db.prepare('DELETE FROM session_sets WHERE session_id = ?').bind(s.id),
    db
      .prepare(
        `INSERT INTO sessions (id, user_id, local_date, stack_id, logged_at, intensity, stack_snapshot)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET stack_id = excluded.stack_id, logged_at = excluded.logged_at,
           intensity = excluded.intensity, stack_snapshot = excluded.stack_snapshot`,
      )
      .bind(s.id, userId, s.localDate, s.stackId, s.loggedAt, intensity, JSON.stringify(snapshot)),
    ...s.sets.map((x) =>
      db
        .prepare(
          `INSERT INTO session_sets (session_id, exercise_id, exercise_name, exercise_type, set_index, weight, reps, seconds, skipped)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          s.id,
          x.exerciseId,
          names.get(x.exerciseId) ?? '',
          x.type,
          x.setIndex,
          x.weight,
          x.reps,
          x.seconds,
          x.skipped ? 1 : 0,
        ),
    ),
  ]);
}

// ---------- day records ----------

export interface DayRow {
  localDate: LocalDate;
  status: DayStatus;
  checkedInAt: string | null;
  firstOpenAt: string | null;
  walkLogged: boolean;
  restDeclared: boolean;
  committedStackId: string | null;
  committedAt: string | null;
  lightsOutAt: string | null;
  skipCostDays: number | null;
  finalizedAt: string | null;
}

const toDay = (r: Row): DayRow => ({
  localDate: String(r.local_date),
  status: String(r.status) as DayStatus,
  checkedInAt: str(r.checked_in_at),
  firstOpenAt: str(r.first_open_at),
  walkLogged: bool(r.walk_logged),
  restDeclared: bool(r.rest_declared),
  committedStackId: str(r.committed_stack_id),
  committedAt: str(r.committed_at),
  lightsOutAt: str(r.lights_out_at),
  skipCostDays: num(r.skip_cost_days),
  finalizedAt: str(r.finalized_at),
});

export const emptyDay = (localDate: LocalDate): DayRow => ({
  localDate,
  status: 'pending',
  checkedInAt: null,
  firstOpenAt: null,
  walkLogged: false,
  restDeclared: false,
  committedStackId: null,
  committedAt: null,
  lightsOutAt: null,
  skipCostDays: null,
  finalizedAt: null,
});

export async function listDays(db: D1Database, userId: string): Promise<DayRow[]> {
  const { results } = await db
    .prepare('SELECT * FROM day_records WHERE user_id = ? ORDER BY local_date')
    .bind(userId)
    .all<Row>();
  return results.map(toDay);
}

export async function getDay(db: D1Database, userId: string, date: LocalDate): Promise<DayRow> {
  const r = await db
    .prepare('SELECT * FROM day_records WHERE user_id = ? AND local_date = ?')
    .bind(userId, date)
    .first<Row>();
  return r ? toDay(r) : emptyDay(date);
}

const DAY_COLUMNS: Record<keyof Omit<DayRow, 'localDate'>, string> = {
  status: 'status',
  checkedInAt: 'checked_in_at',
  firstOpenAt: 'first_open_at',
  walkLogged: 'walk_logged',
  restDeclared: 'rest_declared',
  committedStackId: 'committed_stack_id',
  committedAt: 'committed_at',
  lightsOutAt: 'lights_out_at',
  skipCostDays: 'skip_cost_days',
  finalizedAt: 'finalized_at',
};

/** Create the day row if needed, then set the given fields. */
export function upsertDayStatement(
  db: D1Database,
  userId: string,
  date: LocalDate,
  fields: Partial<Omit<DayRow, 'localDate'>>,
): D1PreparedStatement {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined) as Array<
    [keyof typeof DAY_COLUMNS, unknown]
  >;
  const cols = entries.map(([k]) => DAY_COLUMNS[k]);
  const vals = entries.map(([, v]) => (typeof v === 'boolean' ? (v ? 1 : 0) : v));
  const insertCols = ['user_id', 'local_date', ...cols].join(', ');
  const placeholders = ['?', '?', ...cols.map(() => '?')].join(', ');
  const update = cols.length
    ? cols.map((c) => `${c} = excluded.${c}`).join(', ')
    : 'local_date = excluded.local_date';
  return db
    .prepare(
      `INSERT INTO day_records (${insertCols}) VALUES (${placeholders})
       ON CONFLICT(user_id, local_date) DO UPDATE SET ${update}`,
    )
    .bind(userId, date, ...vals);
}

export async function upsertDay(
  db: D1Database,
  userId: string,
  date: LocalDate,
  fields: Partial<Omit<DayRow, 'localDate'>>,
) {
  await upsertDayStatement(db, userId, date, fields).run();
}

// ---------- pauses ----------

export async function listPauses(
  db: D1Database,
  userId: string,
): Promise<Array<Pause & { id: string; reason: string | null }>> {
  const { results } = await db
    .prepare('SELECT * FROM pauses WHERE user_id = ? ORDER BY start_date')
    .bind(userId)
    .all<Row>();
  return results.map((r) => ({
    id: String(r.id),
    startDate: String(r.start_date),
    endDate: str(r.end_date),
    reason: str(r.reason),
  }));
}

export async function insertPause(
  db: D1Database,
  userId: string,
  id: string,
  startDate: LocalDate,
  reason: string | null,
) {
  await db
    .prepare('INSERT INTO pauses (id, user_id, start_date, reason) VALUES (?, ?, ?, ?)')
    .bind(id, userId, startDate, reason)
    .run();
}

export async function endPause(
  db: D1Database,
  userId: string,
  id: string,
  endDate: LocalDate,
): Promise<number> {
  return updateColumns(db, 'pauses', 'id = ? AND user_id = ? AND end_date IS NULL', [id, userId], {
    end_date: endDate,
  });
}

// ---------- goals ----------

export interface GoalRow extends Goal {
  waistTargetDeltaCm: number | null;
  weightMin: number | null;
  weightMax: number | null;
}

export async function listGoals(db: D1Database, userId: string): Promise<GoalRow[]> {
  const [goals, targets] = await db.batch<Row>([
    db
      .prepare('SELECT * FROM goals WHERE user_id = ? AND deleted_at IS NULL ORDER BY date')
      .bind(userId),
    db
      .prepare(
        `SELECT t.* FROM goal_lift_targets t JOIN goals g ON g.id = t.goal_id
         WHERE g.user_id = ? AND g.deleted_at IS NULL`,
      )
      .bind(userId),
  ]);
  return goals!.results.map((g) => ({
    id: String(g.id),
    name: String(g.name),
    date: String(g.date),
    isPrimary: bool(g.is_primary),
    waistTargetDeltaCm: num(g.waist_target_delta_cm),
    weightMin: num(g.weight_min),
    weightMax: num(g.weight_max),
    liftTargets: targets!.results
      .filter((t) => t.goal_id === g.id)
      .map((t) => ({
        exerciseId: String(t.exercise_id),
        targetWeight: num(t.target_weight),
        targetReps: Number(t.target_reps),
      })),
  }));
}

export interface GoalInput {
  name: string;
  date: LocalDate;
  isPrimary: boolean;
  waistTargetDeltaCm: number | null;
  weightMin: number | null;
  weightMax: number | null;
  liftTargets: Array<{ exerciseId: string; targetWeight: number | null; targetReps: number }>;
}

/** Create or fully replace a goal; keeps exactly one primary goal. */
export async function saveGoal(
  db: D1Database,
  userId: string,
  id: string,
  g: GoalInput,
  exists: boolean,
) {
  const stmts: D1PreparedStatement[] = [];
  if (g.isPrimary) {
    stmts.push(
      db.prepare('UPDATE goals SET is_primary = 0 WHERE user_id = ? AND id <> ?').bind(userId, id),
    );
  }
  stmts.push(
    exists
      ? db
          .prepare(
            `UPDATE goals SET name = ?, date = ?, is_primary = ?, waist_target_delta_cm = ?, weight_min = ?, weight_max = ?
             WHERE id = ? AND user_id = ?`,
          )
          .bind(
            g.name,
            g.date,
            g.isPrimary ? 1 : 0,
            g.waistTargetDeltaCm,
            g.weightMin,
            g.weightMax,
            id,
            userId,
          )
      : db
          .prepare(
            `INSERT INTO goals (id, user_id, name, date, is_primary, waist_target_delta_cm, weight_min, weight_max)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            id,
            userId,
            g.name,
            g.date,
            g.isPrimary ? 1 : 0,
            g.waistTargetDeltaCm,
            g.weightMin,
            g.weightMax,
          ),
    db.prepare('DELETE FROM goal_lift_targets WHERE goal_id = ?').bind(id),
    ...g.liftTargets.map((t) =>
      db
        .prepare(
          'INSERT INTO goal_lift_targets (goal_id, exercise_id, target_weight, target_reps) VALUES (?, ?, ?, ?)',
        )
        .bind(id, t.exerciseId, t.targetWeight, t.targetReps),
    ),
  );
  await db.batch(stmts);
}

export async function goalOwned(
  db: D1Database,
  userId: string,
  id: string,
): Promise<GoalRow | null> {
  return (await listGoals(db, userId)).find((g) => g.id === id) ?? null;
}

export async function softDeleteGoal(
  db: D1Database,
  userId: string,
  id: string,
  now: string,
): Promise<number> {
  return updateColumns(db, 'goals', 'id = ? AND user_id = ? AND deleted_at IS NULL', [id, userId], {
    deleted_at: now,
  });
}

// ---------- body metrics ----------

export interface BodyMetric {
  localDate: LocalDate;
  weightKg: number | null;
  waistCm: number | null;
}

export async function listBodyMetrics(db: D1Database, userId: string): Promise<BodyMetric[]> {
  const { results } = await db
    .prepare('SELECT * FROM body_metrics WHERE user_id = ? ORDER BY local_date')
    .bind(userId)
    .all<Row>();
  return results.map((r) => ({
    localDate: String(r.local_date),
    weightKg: num(r.weight_kg),
    waistCm: num(r.waist_cm),
  }));
}

export async function upsertBodyMetric(db: D1Database, userId: string, m: BodyMetric) {
  await db
    .prepare(
      `INSERT INTO body_metrics (user_id, local_date, weight_kg, waist_cm) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, local_date) DO UPDATE SET
         weight_kg = COALESCE(excluded.weight_kg, weight_kg), waist_cm = COALESCE(excluded.waist_cm, waist_cm)`,
    )
    .bind(userId, m.localDate, m.weightKg, m.waistCm)
    .run();
}

// ---------- push subscriptions ----------

export interface PushSub {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function listPushSubs(db: D1Database, userId: string): Promise<PushSub[]> {
  const { results } = await db
    .prepare('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?')
    .bind(userId)
    .all<Row>();
  return results.map((r) => ({
    id: String(r.id),
    endpoint: String(r.endpoint),
    p256dh: String(r.p256dh),
    auth: String(r.auth),
  }));
}

export async function upsertPushSub(
  db: D1Database,
  userId: string,
  s: Omit<PushSub, 'id'>,
  now: string,
) {
  await db
    .prepare(
      `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
    )
    .bind(crypto.randomUUID(), userId, s.endpoint, s.p256dh, s.auth, now)
    .run();
}

export async function deletePushSub(db: D1Database, userId: string | null, endpoint: string) {
  if (userId) {
    await db
      .prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?')
      .bind(endpoint, userId)
      .run();
  } else {
    await db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(endpoint).run();
  }
}

export async function markPushSuccess(db: D1Database, id: string, now: string) {
  await db
    .prepare('UPDATE push_subscriptions SET last_success_at = ? WHERE id = ?')
    .bind(now, id)
    .run();
}

// ---------- nudge log ----------

/** Record a nudge before sending. Returns false if this rule was already logged today. */
export async function tryLogNudge(
  db: D1Database,
  userId: string,
  date: LocalDate,
  ruleId: RuleId,
  sentAt: string,
): Promise<number | null> {
  const res = await db
    .prepare(
      'INSERT OR IGNORE INTO nudge_log (user_id, local_date, rule_id, sent_at) VALUES (?, ?, ?, ?)',
    )
    .bind(userId, date, ruleId, sentAt)
    .run();
  return (res.meta.changes ?? 0) > 0 ? Number(res.meta.last_row_id) : null;
}

export async function setNudgeStatus(db: D1Database, id: number, status: string) {
  await db.prepare('UPDATE nudge_log SET status = ? WHERE id = ?').bind(status, id).run();
}

export async function nudgesForDate(
  db: D1Database,
  userId: string,
  date: LocalDate,
): Promise<Array<{ ruleId: RuleId; sentAt: string }>> {
  const { results } = await db
    .prepare(
      'SELECT rule_id, sent_at FROM nudge_log WHERE user_id = ? AND local_date = ? ORDER BY sent_at',
    )
    .bind(userId, date)
    .all<Row>();
  return results.map((r) => ({ ruleId: String(r.rule_id) as RuleId, sentAt: String(r.sent_at) }));
}

// ---------- credentials & challenges ----------

export async function insertChallenge(
  db: D1Database,
  c: {
    id: string;
    challenge: string;
    kind: 'register' | 'login';
    userId: string | null;
    expiresAt: string;
  },
) {
  await db
    .prepare(
      'INSERT INTO challenges (id, challenge, kind, user_id, expires_at) VALUES (?, ?, ?, ?, ?)',
    )
    .bind(c.id, c.challenge, c.kind, c.userId, c.expiresAt)
    .run();
}

/** Fetch and delete a challenge in one go (single use). */
export async function takeChallenge(
  db: D1Database,
  id: string,
  kind: 'register' | 'login',
  now: string,
): Promise<{ challenge: string; userId: string | null } | null> {
  const r = await db
    .prepare(
      'DELETE FROM challenges WHERE id = ? AND kind = ? RETURNING challenge, user_id, expires_at',
    )
    .bind(id, kind)
    .first<Row>();
  if (!r || String(r.expires_at) < now) return null;
  return { challenge: String(r.challenge), userId: str(r.user_id) };
}

export interface Credential {
  id: string;
  userId: string;
  publicKey: Uint8Array;
  counter: number;
  transports: string[];
}

export async function getCredential(db: D1Database, id: string): Promise<Credential | null> {
  const r = await db.prepare('SELECT * FROM credentials WHERE id = ?').bind(id).first<Row>();
  if (!r) return null;
  return {
    id: String(r.id),
    userId: String(r.user_id),
    publicKey: new Uint8Array(r.public_key as ArrayBuffer),
    counter: Number(r.counter),
    transports: r.transports ? (JSON.parse(String(r.transports)) as string[]) : [],
  };
}

export async function listCredentialIds(db: D1Database, userId: string): Promise<string[]> {
  const { results } = await db
    .prepare('SELECT id FROM credentials WHERE user_id = ?')
    .bind(userId)
    .all<Row>();
  return results.map((r) => String(r.id));
}

export function insertCredentialStatement(
  db: D1Database,
  c: Credential,
  now: string,
): D1PreparedStatement {
  return db
    .prepare(
      'INSERT INTO credentials (id, user_id, public_key, counter, transports, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .bind(c.id, c.userId, c.publicKey, c.counter, JSON.stringify(c.transports), now);
}

export async function updateCredentialCounter(db: D1Database, id: string, counter: number) {
  await db.prepare('UPDATE credentials SET counter = ? WHERE id = ?').bind(counter, id).run();
}

// ---------- export ----------

const EXPORT_TABLES = [
  'users',
  'settings',
  'stacks',
  'exercises',
  'goals',
  'sessions',
  'day_records',
  'pauses',
  'body_metrics',
  'nudge_log',
] as const;

export async function exportUserData(
  db: D1Database,
  userId: string,
): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {};
  for (const t of EXPORT_TABLES) {
    const col = t === 'users' ? 'id' : 'user_id';
    const { results } = await db
      .prepare(`SELECT * FROM ${t} WHERE ${col} = ?`)
      .bind(userId)
      .all<Row>();
    out[t] =
      t === 'settings' ? results.map(({ snooze_token_hash: _omit, ...rest }) => rest) : results;
  }
  const extra = await db.batch<Row>([
    db
      .prepare(
        'SELECT ss.* FROM session_sets ss JOIN sessions s ON s.id = ss.session_id WHERE s.user_id = ?',
      )
      .bind(userId),
    db
      .prepare(
        'SELECT a.* FROM stack_addons a JOIN stacks s ON s.id = a.stack_id WHERE s.user_id = ?',
      )
      .bind(userId),
    db
      .prepare(
        'SELECT t.* FROM goal_lift_targets t JOIN goals g ON g.id = t.goal_id WHERE g.user_id = ?',
      )
      .bind(userId),
  ]);
  out.session_sets = extra[0]!.results;
  out.stack_addons = extra[1]!.results;
  out.goal_lift_targets = extra[2]!.results;
  return out;
}
