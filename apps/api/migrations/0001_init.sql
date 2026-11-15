-- Gym Nudge schema (spec §6). Every user-owned table carries user_id.
-- Timestamps are UTC ISO strings; local_date is the user's local YYYY-MM-DD.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  timezone TEXT NOT NULL,
  age INTEGER,
  sex TEXT,
  height_cm REAL,
  start_date TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  public_key BLOB NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX credentials_user ON credentials(user_id);

-- Short-lived passkey ceremony challenges.
CREATE TABLE challenges (
  id TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('register', 'login')),
  user_id TEXT,
  expires_at TEXT NOT NULL
);

CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_success_at TEXT
);
CREATE INDEX push_subscriptions_user ON push_subscriptions(user_id);

CREATE TABLE settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  wake_time TEXT NOT NULL,
  checkin_start TEXT NOT NULL,
  checkin_end TEXT NOT NULL,
  rescue_reminder_time TEXT NOT NULL,
  rescue_cutoff TEXT NOT NULL,
  verdict_time TEXT NOT NULL,
  sleep_nudge_time TEXT NOT NULL,
  quiet_start TEXT NOT NULL,
  rules_enabled TEXT NOT NULL,
  measurement_weekday INTEGER NOT NULL DEFAULT 0,
  snooze_token_hash TEXT UNIQUE
);

CREATE TABLE stacks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  position INTEGER NOT NULL,
  in_rotation INTEGER NOT NULL DEFAULT 1,
  is_addon INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT
);
CREATE INDEX stacks_user ON stacks(user_id);

CREATE TABLE stack_addons (
  stack_id TEXT NOT NULL REFERENCES stacks(id),
  addon_stack_id TEXT NOT NULL REFERENCES stacks(id),
  PRIMARY KEY (stack_id, addon_stack_id)
);

CREATE TABLE exercises (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  stack_id TEXT NOT NULL REFERENCES stacks(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('weighted', 'bodyweight', 'timed')),
  sets INTEGER NOT NULL,
  rep_min INTEGER NOT NULL,
  rep_max INTEGER NOT NULL,
  weight_step REAL NOT NULL,
  start_weight REAL,
  is_key_lift INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL,
  deleted_at TEXT
);
CREATE INDEX exercises_stack ON exercises(stack_id);

CREATE TABLE goals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  date TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  waist_target_delta_cm REAL,
  weight_min REAL,
  weight_max REAL,
  deleted_at TEXT
);
CREATE INDEX goals_user ON goals(user_id);

CREATE TABLE goal_lift_targets (
  goal_id TEXT NOT NULL REFERENCES goals(id),
  exercise_id TEXT NOT NULL REFERENCES exercises(id),
  target_weight REAL,
  target_reps INTEGER NOT NULL,
  PRIMARY KEY (goal_id, exercise_id)
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  local_date TEXT NOT NULL,
  stack_id TEXT NOT NULL,
  logged_at TEXT NOT NULL,
  intensity INTEGER,
  stack_snapshot TEXT NOT NULL
);
CREATE INDEX sessions_user_date ON sessions(user_id, local_date);

CREATE TABLE session_sets (
  session_id TEXT NOT NULL REFERENCES sessions(id),
  exercise_id TEXT NOT NULL,
  exercise_name TEXT NOT NULL,
  exercise_type TEXT NOT NULL,
  set_index INTEGER NOT NULL,
  weight REAL,
  reps INTEGER,
  seconds INTEGER,
  skipped INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, exercise_id, set_index)
);

CREATE TABLE day_records (
  user_id TEXT NOT NULL REFERENCES users(id),
  local_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'trained', 'rescue', 'rest', 'skip', 'pause')),
  checked_in_at TEXT,
  first_open_at TEXT,
  walk_logged INTEGER NOT NULL DEFAULT 0,
  rest_declared INTEGER NOT NULL DEFAULT 0,
  committed_stack_id TEXT,
  committed_at TEXT,
  lights_out_at TEXT,
  skip_cost_days REAL,
  finalized_at TEXT,
  PRIMARY KEY (user_id, local_date)
);

CREATE TABLE pauses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  start_date TEXT NOT NULL,
  end_date TEXT,
  reason TEXT
);
CREATE INDEX pauses_user ON pauses(user_id);

CREATE TABLE body_metrics (
  user_id TEXT NOT NULL REFERENCES users(id),
  local_date TEXT NOT NULL,
  weight_kg REAL,
  waist_cm REAL,
  PRIMARY KEY (user_id, local_date)
);

CREATE TABLE nudge_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  local_date TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
);
-- Each scheduled rule fires at most once per day; R4 (snooze) may repeat.
CREATE UNIQUE INDEX nudge_log_once ON nudge_log(user_id, local_date, rule_id) WHERE rule_id <> 'R4';
CREATE INDEX nudge_log_user_date ON nudge_log(user_id, local_date);
