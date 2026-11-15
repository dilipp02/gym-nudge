# Gym Nudge — Design Spec

_Working name. Date: 2026-11-15. Status: approved in brainstorming, pending written-spec review._

## 1. Problem

The user skips the gym because the consequences are long-term and invisible. The app makes each day's choice concrete: after a session it shows exactly what was gained, and after a skip it shows exactly what was lost, as honest numbers tied to real goals and dates. The tone is a **data coach**: numbers only, no hype, no insults.

The usual way a day is lost is **hitting snooze** on a morning alarm. The nudge system is built around that moment.

## 2. User profile and goals

| Field              | Value                                                                     |
| ------------------ | ------------------------------------------------------------------------- |
| Age / sex          | 28 / M                                                                    |
| Height / weight    | 183 cm / 76 kg (BMI 22.7)                                                 |
| Estimated body fat | ~18–20% ("slim with some belly"), estimate only                           |
| History            | On-and-off training; 4 months off                                         |
| Goal               | Build muscle + health and energy                                          |
| Strategy           | Recomp (lose fat, gain muscle together) until mid-April, then a lean bulk |

### 2.1 Milestones

All dates and targets can be edited in Settings. The app is seeded with these values.

| Milestone                      | Date                                       | Weight   | Body fat (est.) | Waist vs baseline |
| ------------------------------ | ------------------------------------------ | -------- | --------------- | ----------------- |
| Wedding 1                      | 2026-12-29                                 | 75–76 kg | ~17–18%         | −2 to −3 cm       |
| Wedding 2                      | 2027-02-14 _(confirm exact date at setup)_ | ~76 kg   | ~16%            | −4 cm             |
| Wedding 3 / **primary target** | 2027-04-15 _(confirm exact date at setup)_ | 76–77 kg | ~15%            | −5 cm             |
| North star                     | 2027-11-15                                 | 79–81 kg | ~13%            | —                 |

### 2.2 Strength targets (key lifts)

These are rough. They get adjusted after the week-1 baseline.

| Lift        | Wedding 1    | Wedding 2 | Wedding 3   |
| ----------- | ------------ | --------- | ----------- |
| Bench press | 55–60 kg × 5 | 65–70 × 5 | 75–80 × 5   |
| Back squat  | 70–80 × 5    | 90 × 5    | 100–105 × 5 |
| Deadlift    | 90–100 × 5   | 110 × 5   | 125–130 × 5 |
| Pull-ups    | 3–5 reps     | 6–8       | 8–10        |

The app uses the **upper end** of each range as the target.

### 2.3 Health targets (shown, not enforced)

7+ hours of sleep, measured by the user tapping "lights out". Steps and resting heart rate are out of scope for v1, because there's no Apple Health access.

## 3. Training model

- **Rotating PPL, 6 gym days a week.** The app suggests the stack trained longest ago, which is normally the next in rotation. The user can **pick any stack** for the day.
- **Abs is an add-on stack**, appended to Pull and Legs by default.
- **One flexible rest day in any rolling 7 days.** The first day without training in a 7-day window counts as rest; any further one counts as a skip.
- **Rest day with a 20-minute walk logged** keeps the streak going.
- **Ramp-up:** in the first 14 days, each exercise's planned sets = `round(sets × 2/3)`, with a minimum of 1.
- **Stack guardrails:**
  - Picking the stack trained yesterday shows a one-time warning, then is allowed.
  - A stack untrained for 6+ days is called out in the evening message.

### 3.1 Default stacks (seed data; full create/edit/delete in the app)

| Stack        | Exercise                         | Type       | Sets × reps              | Weight step | Key lift |
| ------------ | -------------------------------- | ---------- | ------------------------ | ----------- | -------- |
| Push         | Barbell bench press              | weighted   | 4 × 5–8                  | +2.5        | ★        |
|              | Incline dumbbell press           | weighted   | 3 × 8–10                 | +2          |          |
|              | Seated dumbbell shoulder press   | weighted   | 3 × 8–10                 | +2          |          |
|              | Cable lateral raise              | weighted   | 3 × 12–15                | +1          |          |
|              | Triceps rope pushdown            | weighted   | 3 × 10–12                | +2.5        |          |
|              | Overhead cable triceps extension | weighted   | 2 × 10–12                | +2.5        |          |
| Pull         | Deadlift                         | weighted   | 3 × 5–5                  | +5          | ★        |
|              | Pull-ups                         | bodyweight | 3 × max (rep range 5–10) | —           | ★        |
|              | Barbell row                      | weighted   | 3 × 6–8                  | +2.5        |          |
|              | Lat pulldown                     | weighted   | 3 × 10–12                | +2.5        |          |
|              | Face pull                        | weighted   | 3 × 15–15                | +2.5        |          |
|              | Dumbbell curl                    | weighted   | 3 × 10–12                | +1          |          |
|              | Hammer curl                      | weighted   | 2 × 10–12                | +1          |          |
| Legs         | Back squat                       | weighted   | 4 × 5–8                  | +5          | ★        |
|              | Romanian deadlift                | weighted   | 3 × 8–10                 | +5          |          |
|              | Leg press                        | weighted   | 3 × 10–12                | +5          |          |
|              | Walking lunges                   | weighted   | 2 × 10–10 (per leg)      | +2          |          |
|              | Lying leg curl                   | weighted   | 3 × 10–12                | +2.5        |          |
|              | Standing calf raise              | weighted   | 3 × 12–15                | +5          |          |
| Abs (add-on) | Hanging knee raise               | bodyweight | 3 × 10–15                | —           |          |
|              | Cable crunch                     | weighted   | 3 × 12–15                | +2.5        |          |
|              | Plank                            | timed      | 3 × 45–60 s              | +5 s        |          |
|              | Pallof press                     | weighted   | 2 × 12–12 (per side)     | +1          |          |

## 4. Scope

**In v1**

- Installable web app (added to the iPhone Home Screen)
- Passkey login
- Check-in, after-workout logging, stacks and exercises (create/edit/delete)
- Progress maths, nudge scheduler, Progress screen, weekly scorecard
- Body measurements, sick/travel pause, data export

**Out of v1**

- Logging during the workout (the app isn't used mid-session)
- Apple Health or Apple Watch data
- Nutrition tracking (calorie and protein guidance stays in this doc only)
- Friends and social features (the data model is ready for multiple users)
- Money or treat-fund rewards (rejected: rewards are progress data only)
- Native iOS app

## 5. Architecture

```
iPhone (Home Screen web app)          Cloudflare
┌──────────────────────────┐        ┌──────────────────────────────┐
│ React app (Vite)         │──API──▶│ Worker (Hono)                │
│ Service worker           │        │  • REST API + passkey auth   │
│  • receives push         │◀─push──│  • scheduled handler (*/5)   │
│  • offline log queue     │        │ packages/core (shared)       │
└──────────────────────────┘        │ D1 (SQLite)                  │
iOS Shortcut (alarm snoozed)──POST─▶└──────────────────────────────┘
```

### 5.1 Repo layout (npm workspaces)

- `packages/core`: pure TypeScript with no I/O.
  - Progress maths (§7) and day classification
  - Nudge rule evaluation, `dueNudges(state, now)` (§8)
  - Message templates
  - Used by both the web app and the Worker.
- `apps/api`: the Cloudflare Worker.
  - Hono router, passkey auth (SimpleWebAuthn), D1 access
  - Web Push sending (VAPID)
  - `scheduled()` handler on the cron `*/5 * * * *`
- `apps/web`: React + Vite + TypeScript web app.
  - `vite-plugin-pwa` for the manifest and service worker
  - IndexedDB queue for offline writes
  - Hosted on Cloudflare Pages.

### 5.2 API

All routes need a session cookie except the auth and snooze routes. All write requests carry a client-generated ID or are naturally idempotent.

| Method & path                                         | Purpose                                                                                  |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `POST /auth/{register,login}/{options,verify}`        | Passkey ceremonies                                                                       |
| `GET /today`                                          | Today's state: suggested stack, plan with targets, window, rest availability, day status |
| `POST /open`                                          | Records the first app open of the day (used by R5)                                       |
| `POST /checkin`                                       | "I'm here" check-in; timestamp is server time                                            |
| `POST /sessions`                                      | Save a session. Body: `{id, localDate, stackId, sets[]}`. Upsert by `id`.                |
| `POST /days/:date/rest`                               | Declare today a rest day                                                                 |
| `POST /days/:date/walk`                               | Log a recovery walk                                                                      |
| `POST /commit`                                        | Commit to tomorrow's stack                                                               |
| `POST /lights-out`                                    | Record bedtime                                                                           |
| `GET/POST/PATCH/DELETE /stacks[/:id]`                 | Stack create/edit/delete (soft delete)                                                   |
| `PATCH /stacks/order`                                 | Set rotation order                                                                       |
| `GET/POST/PATCH/DELETE /stacks/:id/exercises[/:exId]` | Exercise create/edit/delete (soft delete); includes reordering                           |
| `GET /progress`                                       | Data for the Progress screen                                                             |
| `GET /scorecard?week=YYYY-Www`                        | Weekly scorecard                                                                         |
| `GET/POST/PATCH/DELETE /goals[/:id]`                  | Milestones and lift targets                                                              |
| `POST /body-metrics`                                  | Weight and waist entry                                                                   |
| `POST /pauses`, `PATCH /pauses/:id`                   | Start or end a pause                                                                     |
| `GET/PUT /settings`                                   | Schedule and rule toggles                                                                |
| `POST/DELETE /push/subscription`, `POST /push/test`   | Web Push management                                                                      |
| `POST /hooks/snooze/:token`                           | Snooze ping from the iOS Shortcut; no session needed                                     |
| `POST /settings/snooze-token/reset`                   | Replace the snooze link                                                                  |
| `GET /export`                                         | All of the user's data as JSON; CSV for sessions                                         |

## 6. Data model (D1)

Every user-owned table has a `user_id`. All timestamps are stored in UTC; `local_date` is the user's local calendar date.

| Table                | Key fields                                                                                                                                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`              | id, timezone, age, sex, height_cm, start_date, created_at                                                                                                                                                        |
| `credentials`        | id, user_id, public_key, counter, transports                                                                                                                                                                     |
| `push_subscriptions` | id, user_id, endpoint, p256dh, auth, last_success_at                                                                                                                                                             |
| `settings`           | user_id (PK), wake_time, checkin_start, checkin_end, rescue_cutoff, verdict_time, sleep_nudge_time, quiet_start, rules_enabled (JSON), measurement_weekday, snooze_token_hash                                    |
| `goals`              | id, user_id, name, date, is_primary, waist_target_delta_cm, weight_min, weight_max, deleted_at                                                                                                                   |
| `goal_lift_targets`  | goal_id, exercise_id, target_weight, target_reps                                                                                                                                                                 |
| `stacks`             | id, user_id, name, position, in_rotation, is_addon, deleted_at                                                                                                                                                   |
| `stack_addons`       | stack_id, addon_stack_id                                                                                                                                                                                         |
| `exercises`          | id, user_id, stack_id, name, type (`weighted`/`bodyweight`/`timed`), sets, rep_min, rep_max, weight_step, start_weight, is_key_lift, position, deleted_at                                                        |
| `sessions`           | id (client UUID), user_id, local_date, stack_id, kind (`morning`/`rescue`), checked_in_at, logged_at, intensity, stack_snapshot (JSON)                                                                           |
| `session_sets`       | session_id, exercise_id, exercise_name, exercise_type, set_index, weight, reps, seconds, skipped                                                                                                                 |
| `day_records`        | (user_id, local_date) PK, status (`pending`/`trained`/`rescue`/`rest`/`skip`/`pause`), checked_in_at, first_open_at, walk_logged, rest_declared, committed_stack_id, lights_out_at, skip_cost_days, finalized_at |
| `pauses`             | id, user_id, start_date, end_date, reason                                                                                                                                                                        |
| `body_metrics`       | user_id, local_date, weight_kg, waist_cm                                                                                                                                                                         |
| `nudge_log`          | user_id, local_date, rule_id, sent_at, status. Unique on (user_id, local_date, rule_id), except R4, which is rate-limited by `sent_at`.                                                                          |

## 7. Progress maths (`packages/core`)

### 7.1 Intensity score (0–100)

The score has three parts.

- **Completion, 0–50:** `50 × setsDone / setsPlanned`. Planned sets include the ramp-up reduction.
- **Volume, 0–30:**
  - Exercise volume: weighted = Σ weight × reps; bodyweight = Σ (bodyweight + added weight) × reps; timed = Σ seconds. Bodyweight is the latest body measurement.
  - For each exercise, ratio = today's volume ÷ the average of its last 4 sessions.
  - Session ratio = the mean of those exercise ratios.
  - Points scale linearly from 0 at ratio ≤ 0.80 to 30 at ratio ≥ 1.15.
  - An exercise with no history counts as ratio 1.0. A stack with no history scores 15.
- **Progression, 0–20:** `20 × (share of exercises where today's best set beat last time's best set on weight, or on reps at the same weight)`.

### 7.2 Strength and milestones

- **Estimated one-rep max (Epley):** `e1RM = weight × (1 + reps/30)`. Pull-ups use the best set's reps instead.
- **Baseline:** the best e1RM (or reps) for each key lift during the first 7 days.
- **Target:** the milestone's e1RM from `target_weight × target_reps`, or reps for pull-ups.
- **Milestone %** = `clamp((current best − baseline) / (target − baseline), 0, 1)`.
- **"Current best"** means the best result in the last 14 days, so a lift that's no longer trained loses its credit.
- **On track** if milestone % ≥ elapsed % = `(today − start) / (milestone date − start)`.

### 7.3 Projected date for the primary target

- `planned = 6 × weeks(start → primary date)`. That's about 132 sessions.
- `done` = trained days + rescue days.
- **Rate** = sessions in the last `W` days × 7 / `W`, where `W = min(28, days since start)`.
  - Rate is capped at 6.
  - If `W < 7`, use rate 6.
  - If the rate is 0, show "no sessions in 28 days" instead of a date.
- **Projected date** = today + `ceil((planned − done) / rate × 7)` days.
- **Skip cost:** at the verdict, `skip_cost_days` = projection after the skip − projection before it. The **total skip cost** is the sum of these.

### 7.4 Day classification (decided at the verdict time)

- Precedence, first match wins:
  1. `trained`: checked in within the check-in window, and a session logged that day.
  2. `rescue`: checked in after the window closed but before the rescue deadline, and a session logged.
  3. `pause`: the day falls inside a pause.
  4. `rest`: no session, and no other `rest` day in the previous 6 local days.
  5. `skip`: anything else.
- **Training during a pause** counts as `trained` or `rescue`, because those come first.
- **A check-in with no session logged** counts as no session, so tapping "I'm here" alone doesn't protect the day.
- **Second skip in a row:** the evening message gets a warning on the second consecutive skip.

### 7.5 Streak

- Increases on `trained`, `rescue`, or `rest` with a walk logged.
- Resets on `skip`, or on `rest` without a walk.
- `pause` freezes it: no increase and no reset.
- Both the current streak and the best streak are stored.

### 7.6 Pattern warning

- A **break** = 7 or more consecutive non-training days, excluding pauses.
- On a second skip in a row, if the user has at least 2 breaks on record, the evening message says: "_k_ of your last _n_ breaks started with 2 skips in a row."
- With fewer than 2 breaks, the warning is not shown.

### 7.7 Weight suggestions

- If every set in the last session reached `rep_max`, suggest `weight + weight_step` next time. Otherwise suggest the same weight.
- Bodyweight exercises suggest `reps + 1`. Timed exercises suggest `seconds + step`.

### 7.8 Body trend

- The target path is a straight line from baseline to each milestone's waist and weight targets.
- It's displayed only; it doesn't affect the maths.

## 8. Nudge engine

### 8.1 How the scheduler runs

The `scheduled()` handler runs every 5 minutes. For each user it:

1. Loads the state.
2. Computes `dueNudges(state, nowLocal)`.
3. For each nudge returned: inserts into `nudge_log` (the unique key stops duplicates), then sends the push.
4. Finalizes any `day_records` still `pending` whose verdict time has passed. Finalizing is idempotent, so a missed run catches up on the next one.

### 8.2 Rules

These are the default times. All of them are configurable.

| Rule                | Time                 | Fires only if                                               | Template                                                                                            |
| ------------------- | -------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| R1 commit / verdict | 21:30                | always (Sundays: the scorecard)                             | `"{verdictLine} Tomorrow: {stack}. {keyLift} {w}×{r} ({delta}). Check in by {checkinEnd}. Commit?"` |
| R2 sleep            | 22:45                | no lights-out tapped                                        | `"Lights out by {t} → {h} sleep before {wake}. Last 7 days avg bedtime {avg}."`                     |
| R3 wake             | 06:30                | not a declared rest day; not paused                         | `"Today: {stack}. Check-in window {start}–{end}. {nextMilestone}: {d}d."`                           |
| R4 snooze           | snooze ping received | not checked in; at most 1 per 5 min; not during quiet hours | `"Window closes in {m} min. Skips this month: {s}. {primary} target: {date}."`                      |
| R5 move             | 06:50                | no app open since R3 and not checked in                     | `"Leave in 10 min to check in by {t}."`                                                             |
| R6 last call        | 07:15                | not checked in                                              | `"{m} min left in check-in window. {done}/6 sessions this week."`                                   |
| R7 window closed    | 07:30                | not checked in                                              | `"Morning missed. Today counts as {rest                                                             | skip} unless you train by {cutoff}. Evening session still counts."` |
| R8 rescue           | 18:30                | morning missed and no rest declared                         | `"Rescue: {h}h until {cutoff}. {stack} still open."`                                                |

**Extra lines added to the R1 verdict:**

- Skip cost: `"Skipped: {stack}. {primary} target → {date} (+{x} days). {muscle} {n}× this week (plan 2×). {lift} milestone {a}% → {b}%."`
- Avoided stack (6+ days untrained): `"{stack}: {n} days."`
- Pattern warning (§7.6), when it applies.

### 8.3 Behaviour rules

- **Drop late nudges:** a scheduled nudge more than 15 minutes overdue is not sent.
- **Quiet hours:** nothing from `quiet_start` (23:30) until the wake time, except R4.
- **Declared rest:** turns off R3, R5, R6, R7 and R8 for that day.
- **Pause:** turns off everything except R1. During a pause, R1 sends a short status line only.
- **Session report:** shown in the app after saving, never sent as a push.
- **No notification buttons:** iOS web push doesn't support action buttons, so every action happens in the app after a tap. Tapping opens the matching screen: R1 opens Today/tomorrow; the Sunday scorecard opens Progress.

## 9. Screens

**Navigation:** a bottom tab bar with Today · Progress · Stacks · Settings.

### 9.1 Today (changes through the day)

1. **Before check-in:**
   - Suggested stack as chips, tappable to switch; the yesterday guardrail applies.
   - Check-in window countdown and the **I'm here** button.
   - **Rest today** button, disabled with "Rest used {day}" once this week's rest is used.
   - **Log walk** button on rest days.
2. **Logging, after the workout: confirm, then fix differences.**
   - Every exercise is prefilled with planned weight × reps × sets (last time plus any suggested increase).
   - The main button is **Done as planned**.
   - Tapping an exercise opens editable fields for each set, plus a **skipped** toggle.
   - **Save session** sends the log (offline-safe).
3. **Session report:** intensity, PRs, volume vs average, milestone % changes, projected-date change.
4. **Evening:** tomorrow's suggested stack with targets, and the **Commit** button.

### 9.2 Progress (goal first)

From top to bottom:

1. Projected primary date with the difference from plan, total skip cost, and 28-day rate.
2. Next-milestone card: a bar for each key lift with the "should be here" marker, an on-track count, and a note on any lift that's behind (with how often its stack is trained).
3. 4-week calendar coloured by day status (trained / rescue / rest / skip / pause), with current and best streak.
4. Body: waist and weight against the target path.
5. Below that: later milestones and the weekly scorecard history.

### 9.3 Stacks

- **List:**
  - Drag to reorder (this sets the rotation).
  - Rotation toggle per stack.
  - ⋯ menu: rename, duplicate, delete. Delete asks for confirmation and states that history is kept.
  - **New stack** button; add-on stacks show which stacks they're attached to.
- **Edit stack:**
  - Name.
  - Exercises: drag to reorder, swipe to delete, **Add exercise**.
  - Toggles for which add-ons to attach.
- **Exercise form:**
  - Name.
  - Type (weighted / bodyweight / timed).
  - Sets, rep range (or seconds range).
  - Weight step: +1 / +2.5 / +5 / custom.
  - Starting weight, key-lift toggle, delete.

### 9.4 Settings

- **Profile:** age, height, sex, time zone.
- **Goals:** create/edit/delete milestones; set the primary target.
- **Schedule:** all §8.2 times and quiet hours.
- **Notifications:** a toggle per rule, test push, snooze Shortcut setup.
- **Body measurements:** measurement weekday and entry.
- **Pause:** start or end a pause.
- **Account:** passkeys, export, snooze link reset.

### 9.5 First-time setup

1. If not running from the Home Screen, a Share → Add to Home Screen guide blocks progress until it's done.
2. Create a passkey.
3. Allow notifications, then send a test push.
4. Profile and goals, prefilled from §2.
5. Snooze Shortcut setup: step-by-step instructions plus the personal `POST /hooks/snooze/:token` link.
6. Week 1 is the baseline (§7.2), and the ramp-up (§3) starts.

## 10. Handling failures

| What goes wrong                     | How it's handled                                                                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Offline when logging                | Writes are queued in IndexedDB and replayed by the service worker. `sessions.id` is a client UUID and saves are upserts, so a replay can't duplicate.  |
| A log arrives after the verdict     | The day is reclassified and `skip_cost_days` recalculated. **Logs are accepted for a day until 24 hours after it ends**; after that the day is locked. |
| Push returns 404/410                | The subscription is deleted. The app shows a "Notifications are off" banner whenever no subscription is active.                                        |
| A scheduler run is missed or fails  | Late nudges are dropped (§8.3). Verdict finalizing is idempotent and catches up on the next run.                                                       |
| Time zones and daylight saving      | Times are stored in UTC and evaluated in the user's IANA time zone. Day boundaries are local midnight.                                                 |
| Phone clock is wrong                | Server time is authoritative for check-ins and verdicts.                                                                                               |
| Stack or exercise edited or deleted | Soft delete. Sessions keep `stack_snapshot`, and sets keep the exercise name and type, so history and progress stay intact.                            |
| Snooze link leaks                   | Only a hash of the token is stored; it can be reset in Settings; rate-limited to 1 ping per 5 minutes.                                                 |
| Phone or passkey lost               | Passkeys sync via iCloud Keychain; a second passkey can be registered. Data export is available, plus D1 point-in-time restore.                        |

## 11. Testing

1. **`packages/core` unit tests (Vitest), table-driven:** intensity, e1RM, milestone % and on-track, projection and skip cost, day classification, rest rule, streak, pattern warning, weight suggestions, ramp-up.
2. **Nudge simulation tests:** `dueNudges` replayed across scripted days and weeks with a fake clock. Scenarios: good day, snooze day, rescue day, double skip, declared rest, pause, DST change, missed cron run. Each asserts the exact nudges sent and their times.
3. **API integration tests:** `@cloudflare/vitest-plugin` with a local D1. Covers auth, check-in, session upsert and duplicate prevention, late log reclassification, stack and exercise create/edit/delete with soft delete, and the snooze hook rate limit.
4. **UI tests:** Playwright at iPhone viewport. Flows: confirm a log, fix one exercise, stack and exercise create/edit/delete, setup steps.
5. **Manual iPhone checklist:** Home Screen install, push delivery, snooze Shortcut ping → push, offline log then sync, passkey login.

## 12. To confirm before or early in implementation

1. **The iOS Shortcuts "Alarm → Is Snoozed" automation trigger** exists on the user's iOS version and can run "Get Contents of URL" without asking each time. If it can't, R4 is dropped and R5/R6 carry the morning.
2. **A Web Push library that works on Workers.** _Partly resolved 2026-11-15:_ `@block65/webcrypto-web-push` v2 (RFC 8291 `aes128gcm` + RFC 8292 VAPID) passes an in-runtime decrypt and signature test. `@pushforge/builder` was rejected for emitting only the legacy `aesgcm`. Real delivery to an iPhone is still to be confirmed after the first deploy.
3. **D1 point-in-time restore** availability and retention on the free plan.
4. **Exact dates** for Wedding 2 and Wedding 3, collected at setup.
