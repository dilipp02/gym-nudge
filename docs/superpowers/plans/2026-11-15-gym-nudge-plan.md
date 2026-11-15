# Gym Nudge — Implementation Plan

_Spec: [2026-11-15-gym-nudge-design.md](../specs/2026-11-15-gym-nudge-design.md). Section numbers like §7.3 refer to the spec._

## How to use this plan

- Tasks run in order. Each one lists the **files**, the **tests to write first**, and **done when**.
- **Test-first** for everything in `packages/core` and the API. UI tasks are covered by Playwright smoke tests and the manual iPhone checklist.
- Each task should end in a single-line commit.
- **Stack:** TypeScript 6.0 everywhere, npm workspaces, Vitest 4, Hono, Cloudflare Workers + D1 + Pages, React 19 + Vite 8 + `vite-plugin-pwa`, `@block65/webcrypto-web-push`, SimpleWebAuthn, `@dnd-kit` for drag-to-reorder.
- Where this plan says `pnpm …`, use the npm workspace equivalent (`npm test`, `npm test -w @gym-nudge/core`, `npm run dev:api`).

## Progress log

**2026-11-15: Phase 2 done (`packages/core`, 109 tests).**

- **Modules:** `time`, `plan`, `strength`, `intensity`, `days`, `streak`, `projection`, `stacks`, `messages`, `nudges`.
- **No date library:** time-zone handling is `Intl` only, with no `date-fns-tz`. It's covered by tests across New York and London daylight-saving changes.
- **Projection change (spec §7.3):**
  - The headline date is now "on plan from tomorrow". A skip costs exactly 7/6 ≈ 1.17 days.
  - The 28-day-pace date is kept as a secondary figure. Under the original formula, one skip in week 1 moved the date about +29 days.
- **Engine split:**
  - `dueRules`/`snoozeDue` decide timing; `messages.ts` renders the text.
  - The pattern warning and the Sunday scorecard are tested in `messages.test.ts` and `streak.test.ts`, not in the day simulations.
- **Simulation 8 (cron down 06:40–07:20):** R5 is dropped, and R6 is sent at 07:20 because it's only 5 minutes late. The plan's earlier expectation that R6 would also be dropped was wrong.
- **Other small rules now in the spec:**
  - An exercise skipped entirely is left out of the volume mean.
  - Progression scores a neutral 10 when nothing is comparable.
  - The save time stands in for a missing check-in.
  - Snooze (R4) works in quiet hours but not after the window closes.
  - R5 = wake + 20 min; R6 = window end − 15 min.
  - New setting `rescue_reminder_time`.

**2026-11-15: Phase 1 done, 0.2 checked in the runtime.**

- **Repo layout:** npm workspaces; pnpm isn't installed, and Node 25 no longer bundles corepack. The Worker config is `wrangler.jsonc`.
- **Cloudflare test runner:** `@cloudflare/vitest-plugin`. `@cloudflare/vitest-pool-workers` is deprecated, and it pins TypeScript to 6.0 (typescript-eslint doesn't support 7) and Vitest to 4.
- **API routes** are served under `/api` (basePath), so the Pages site and the API share one origin.
- **Dev ports:** web `5180` (strict), API `8787`. Vite proxies `/api` to the API.
- **Push library:**
  - `@pushforge/builder` was rejected: it only emits the legacy `aesgcm` encoding.
  - `@block65/webcrypto-web-push` v2 (`aes128gcm` + RFC 8292 VAPID) was chosen.
  - `apps/api/test/push-library.test.ts` runs in workerd, decrypts the payload as a browser would, and verifies the VAPID JWT.
  - **Still open:** real delivery to an iPhone after the first deploy (5.3).
- **Preview browser limit:** the desktop app's built-in browser pane can't register service workers. Check the service worker and push in real Chrome or Safari.
- **Time zones:** use `Intl` plus `date-fns-tz`. All "local" logic takes an IANA time zone explicitly; there are no hidden `new Date()` calls in `packages/core`. The current time is always passed in.

---

## Phase 0: Pre-flight checks (half a day)

These are the open items from spec §12. They're done first because they can change the design.

**0.1 Snooze trigger check.** _Done by you, on your iPhone._

1. Shortcuts → Automation → **Alarm** → choose your alarm → **Is Snoozed**.
2. Add the action **Get Contents of URL** with POST to `https://httpbin.org/post`.
3. Turn on **Run Immediately**.
4. Snooze the alarm once, then check the automation's run history.

**Done when:** we know whether the trigger exists and runs without asking for confirmation. If it doesn't, mark R4 as dropped in the spec.

**0.2 Web Push on Workers check.**

- Files: `spikes/webpush-worker/` (throwaway).
- Try a Workers-compatible library built on WebCrypto. Fall back to `web-push` under `nodejs_compat` only if it actually runs.
- Send one push to Chrome desktop, then to an iPhone Home Screen web app.

**Done when:** a push from a deployed Worker reaches the iPhone. Record the chosen library in the spec.

**0.3 Database backup check.** Confirm D1 point-in-time restore availability and retention on the free plan, and record it in spec §10.

**0.4 Wedding dates.** Get the exact dates for Wedding 2 and 3 and update spec §2.1 and the seed data.

---

## Phase 1: Repo scaffold

**1.1 Workspace**

- Files: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.editorconfig`, `.prettierrc`, `eslint.config.js`, `.gitignore`, `README.md`.
- Root scripts: `test`, `lint`, `typecheck`, `dev:api`, `dev:web`.

**Done when:** `pnpm install && pnpm typecheck` passes on an empty workspace.

**1.2 `packages/core` skeleton**

- Files: `packages/core/{package.json,tsconfig.json,vitest.config.ts,src/index.ts}`.

**Done when:** `pnpm --filter core test` runs one placeholder test.

**1.3 `apps/api` skeleton**

- Files: `apps/api/{package.json,wrangler.toml,src/index.ts,vitest.config.ts}`.
- Hono app with `GET /health`; an empty `scheduled()` handler; cron `*/5 * * * *`; local D1 binding `DB`.
- Test (`@cloudflare/vitest-pool-workers`): `GET /health` → 200.

**Done when:** `pnpm dev:api` serves `/health`, and the test passes.

**1.4 `apps/web` skeleton**

- Files: `apps/web/{package.json,vite.config.ts,index.html,src/main.tsx,src/App.tsx}`.
- React app, `vite-plugin-pwa` with a manifest (name, icons, `display: standalone`, theme colour), a dev proxy to the API, and a bottom tab bar with 4 empty routes.

**Done when:** `pnpm dev:web` shows the tab bar, and Lighthouse reports it as installable.

**1.5 CI (optional)**

- File: `.github/workflows/ci.yml` running lint, typecheck and test.

---

## Phase 2: `packages/core`, the maths and rules (no I/O)

All of these are pure functions. Write the table-driven tests first, then the implementation.

**2.1 Domain types**

- File: `src/types.ts`.
- Types: `ExerciseType`, `Exercise`, `Stack`, `PlannedSet`, `LoggedSet`, `Session`, `DayStatus`, `DayRecord`, `Goal`, `LiftTarget`, `Settings`, `Pause`, `BodyMetric`, `UserState` (everything `dueNudges` and the progress calculations need).
- File: `src/time.ts`.
- Functions: `localDate(utc, tz)`, `localTime(utc, tz)`, `atLocal(date, "HH:mm", tz) → UTC`, `daysBetween`, `isoWeek`.
- Tests (`time.test.ts`): conversions across DST in `America/New_York`, `Europe/London`, `Asia/Kolkata`.

**2.2 Planning helpers (§3, §7.7)**

- File: `src/plan.ts`.
- `plannedSets(exercise, startDate, today)`: applies the 2/3 ramp for 14 days, minimum 1.
- `suggestNext(exercise, lastSession?)`: next weight / reps / seconds.
- `buildPlan(stack, addons, history, today)`: the prefilled log for Today.
- Tests: ramp boundaries (day 13 vs 14), top-of-range progression for each exercise type, no history → starting weight.

**2.3 Strength (§7.2)**

- File: `src/strength.ts`.
- Functions: `e1rm(w, r)`, `bestResult(exercise, sessions, since)` (pull-ups by reps), `baseline(...)`, `milestonePct(...)`, `onTrack(...)`.
- Tests: Epley values; clamping to 0–1; the 14-day "current best" window; elapsed-% maths.

**2.4 Intensity (§7.1)**

- File: `src/intensity.ts`.
- Functions: `exerciseVolume(sets, type, bodyweight)`, `intensity(session, plan, history, bodyweight) → {score, completion, volume, progression}`.
- Tests: all three parts at their boundaries (ratio 0.80 / 1.15); no history → 15; mixed exercise types; skipped exercises.

**2.5 Day classification and rest rule (§7.4)**

- File: `src/days.ts`.
- `classifyDay(date, sessions, checkins, pauses, priorDays, settings, tz) → DayStatus`.
- Tests: each precedence branch; a check-in with no session → not trained; rest available vs already used within the previous 6 days; training during a pause.

**2.6 Streak and pattern (§7.5, §7.6)**

- File: `src/streak.ts`.
- `streak(days) → {current, best}`.
- `breaks(days)`.
- `patternWarning(days) → string | null`.
- Tests: pause freezes the streak; rest without a walk resets it; fewer than 2 breaks → null; counting _k of n_.

**2.7 Projection and skip cost (§7.3)**

- File: `src/projection.ts`.
- `projectedDate(startDate, primaryDate, days, today)`.
- `skipCost(before, after)`.
- Tests: `W < 7` uses rate 6; the cap at 6; rate 0 → null; one skip at a 6/week rate ≈ +1–2 days; recovery moves the date earlier.

**2.8 Stack suggestion and guardrails (§3)**

- File: `src/stacks.ts`.
- `suggestStack(stacks, history)`: the in-rotation stack trained longest ago, with rotation order breaking ties.
- `yesterdayWarning(stackId, history)`.
- `avoidedStacks(stacks, history, today, 6)`.
- Tests: rotation order, ties, add-on stacks never suggested on their own, avoided threshold.

**2.9 Message templates (§8.2)**

- File: `src/messages.ts`.
- One function per rule, R1–R8, plus `verdictLine`, `skipCostLine`, `scorecard`. Data-coach tone only.
- Tests: snapshot tests for each template with fixed inputs.

**2.10 Nudge engine (§8)**

- File: `src/nudges.ts`.
- `dueNudges(state: UserState, nowUtc) → Array<{ruleId, localDate, title, body, url}>`.
- Encodes: rule times, conditions, the 15-minute drop window, quiet hours, rest and pause suppression, and the rules-enabled toggles.
- R4 is not time-based; it's handled by a separate `snoozeNudge(state, nowUtc)`, which applies the 5-minute rate limit and the quiet-hours check.
- File: `src/nudges.sim.test.ts`, which replays scripted days on a fake clock, stepping every 5 minutes, and records what's sent. Scenarios:
  1. Good day
  2. Snooze ×3 day
  3. Missed morning + evening rescue
  4. Missed morning, nothing (first in the week = rest)
  5. Second missed day (skip)
  6. Two skips in a row (pattern warning, once history exists)
  7. Declared rest
  8. Pause
  9. DST spring-forward night
  10. Scheduler down from 06:40 to 07:20 (R5 and R6 dropped, R7 sent)
  11. Sunday scorecard

**Done when:** all scenarios match the expected nudges and their times exactly.

---

## Phase 3: API (`apps/api`)

Every route is covered by integration tests against a local D1.

**3.1 Schema and seed**

- Files: `migrations/0001_init.sql` (all tables in spec §6, plus a `challenges` table for passkey ceremonies, indexes on `(user_id, local_date)`, unique key on `nudge_log`).
- File: `src/seed.ts`: default stacks and exercises (§3.1), milestones and lift targets (§2), and default settings, applied when a user is created.
- Test: migrate → create user → seed → counts match.

**3.2 Auth (passkeys)**

- Files: `src/auth/*.ts`, `src/middleware/session.ts`.
- SimpleWebAuthn register/login ceremonies.
- Session = a signed, HTTP-only, `SameSite=Lax` cookie (HMAC with the `SESSION_SECRET` secret).
- Challenge storage: a short-lived row in a `challenges` table.
- Tests: register → login → protected route allowed; protected route without a cookie → 401; a reused challenge is rejected.

**3.3 Stacks and exercises create/edit/delete**

- File: `src/routes/stacks.ts`.
- Includes ordering (`PATCH /stacks/order`, exercise reordering), soft delete, `in_rotation`, add-on links, and duplicate.
- Tests: full create/edit/delete; soft-deleted items hidden from lists but still referenced by sessions; reorder keeps order stable; user isolation (user B can't see user A's data).

**3.4 Day actions**

- File: `src/routes/today.ts`.
- `GET /today` (uses core's `suggestStack`, `buildPlan`, `classifyDay` and rest availability).
- `POST /open`, `/checkin`, `/days/:date/rest`, `/days/:date/walk`, `/commit`, `/lights-out`.
- Tests: check-in records server time; rest rejected if already used; first-open recorded only once.

**3.5 Sessions**

- File: `src/routes/sessions.ts`.
- `POST /sessions`: upsert by client `id`, store `stack_snapshot` and the sets, compute intensity, return the **session report** (intensity, PRs, milestone changes, projected-date change).
- Late arrival: if the day is already finalized and still within the 24-hour window, reclassify it and recalculate `skip_cost_days`. Past the window → 409.
- Tests: sending the same request twice → one session; a late log flips a skip to trained; past the window → 409.

**3.6 Goals, body metrics, pauses, settings**

- Files: `src/routes/{goals,body,pauses,settings}.ts`.
- Tests: create/edit/delete goals; exactly one primary goal; pause start/end; settings validation (times as `HH:mm`, valid time zone).

**3.7 Progress and scorecard**

- File: `src/routes/progress.ts`.
- `GET /progress` returns everything the Progress screen needs in one response.
- `GET /scorecard`.
- Tests: fixtures with known history → expected numbers. Reuse the core fixtures.

**3.8 Push**

- Files: `src/push/send.ts` (library chosen in 0.2), `src/routes/push.ts`.
- Subscribe/unsubscribe and test push. On 404/410, delete the subscription.
- Secrets: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
- Tests: the sender is mocked so a 410 leads to deletion; the payload format matches what the service worker expects.

**3.9 Scheduled handler**

- File: `src/scheduled.ts`.
- For each user: load `UserState` → `dueNudges` → insert into `nudge_log` (skip on conflict) → send → finalize any days still pending past the verdict time, which also writes `skip_cost_days`.
- Tests: two runs in the same 5-minute slot → no duplicate sends; a missed day gets finalized on the next run.

**3.10 Snooze hook**

- File: `src/routes/hooks.ts`.
- `POST /hooks/snooze/:token`: compare the token's hash, then `snoozeNudge`, then send. Token reset endpoint.
- Tests: wrong token → 404; second ping within 5 minutes → no send; already checked in → no send.

**3.11 Export**

- File: `src/routes/export.ts`.
- JSON of all the user's tables, plus `sessions.csv`.
- Test: the export contains only the user's own data.

---

## Phase 4: Web app (`apps/web`)

**4.1 App shell and API client**

- Files: `src/api.ts` (typed fetch wrapper, error handling), `src/routes/*`, `src/components/TabBar.tsx`.
- Data-coach visual style: dark theme, monospace numbers.

**4.2 Service worker and push**

- File: `src/sw.ts` (with `vite-plugin-pwa` `injectManifest`).
- Handles `push` → `showNotification`, and `notificationclick` → focus or open the URL in the payload.
- File: `src/push.ts`: request permission from a user tap, subscribe, send the subscription to the API.
- Manual check: test push from Settings arrives on the iPhone, and tapping it opens the right screen.

**4.3 Offline queue**

- File: `src/offline/queue.ts`.
- Queues writes in IndexedDB (`idb-keyval`): sessions, check-in, rest, walk, commit. Replays when the app comes back online or opens. Client-generated UUIDs.
- Test (Vitest + fake-indexeddb): a queued write is replayed once, then removed.

**4.4 First-time setup (§9.5)**

- File: `src/onboarding/*`.
- Steps: standalone check with the Add to Home Screen guide (`navigator.standalone` / `display-mode`), passkey, notifications plus test, profile and goals (prefilled), snooze Shortcut instructions with a copy-link button.
- Setup also saves the first body measurement (weight 76 kg, waist). Bodyweight exercises need a bodyweight from day 1, and the Settings entry form only arrives in 4.9.

**4.5 Today screen (§9.1)**

- File: `src/today/*`.
- States: before check-in → logging → report → evening commit. Stack chips with the yesterday warning; rest and walk buttons.

**4.6 Logging: confirm, then fix (§9.1.2)**

- File: `src/today/LogForm.tsx`.
- **Done as planned** button; tap to edit an exercise's sets; skipped toggle; save through the offline queue.
- Playwright: confirm-all flow; edit one exercise; offline save shows "will sync".

**4.7 Stacks screen (§9.3)**

- Files: `src/stacks/*`.
- List with drag-to-reorder, rotation toggle, ⋯ menu (rename / duplicate / delete with confirmation), edit-stack screen, exercise form.
- Playwright: create a stack → add 2 exercises → reorder → edit one → delete one → delete the stack.

**4.8 Progress screen (§9.2)**

- Files: `src/progress/*`.
- Projected date header, milestone card with progress bars and the expected-progress marker, 4-week calendar, body trend, later milestones, scorecard history.
- Charts as simple SVG or HTML; no chart library unless needed.

**4.9 Settings (§9.4)**

- Files: `src/settings/*`.
- Profile, goals create/edit/delete, schedule, per-rule toggles, test push, measurements, pause, account (passkeys, export, snooze link reset).

---

## Phase 5: Deploy and set up the iPhone

**5.1 Cloudflare setup**

- `wrangler d1 create gym-nudge`; apply migrations to the remote database.
- Secrets: `SESSION_SECRET`, `VAPID_*`.
- Deploy the Worker; deploy Pages, with the API on the same site through a Pages Functions proxy or a route, so the cookie stays same-site.

**5.2 iPhone setup**

- Open in Safari → Add to Home Screen → go through setup → create the snooze Shortcut automation.

**5.3 Manual checklist (spec §11.5)**
Check each item off:

- Home Screen install
- Push delivery for R1, R3 and the test push
- Snooze ping → push
- Offline log, then sync
- Passkey login on a fresh install
- Export

---

## Phase 6: First week of real use and tuning

- Use it for 7 days.
- Review the messages in `nudge_log` against what actually happened.
- Adjust: notification times, the volume boundaries in the intensity score, and the strength targets once the week-1 baseline is in.
- Write down any changes to the spec.

---

## Order and checkpoints

| Checkpoint | After             | You can…                                                              |
| ---------- | ----------------- | --------------------------------------------------------------------- |
| A          | Phase 2           | Run `pnpm test`: all maths and nudge simulations pass, with no UI yet |
| B          | Phase 3           | Run the API locally; the full flow works through the HTTP client      |
| C          | Phase 4.1–4.6     | Log workouts on your phone locally, and get pushes once deployed      |
| D          | Phase 5           | Use it for real every morning                                         |
| E          | Phase 4.7–4.9 + 6 | Full feature set, tuned                                               |

**Recommended order:** 0 → 1 → 2 → 3 → 4.1–4.6 → **5 (deploy)** → 4.7–4.9 → 6.

The stack editor, the full Progress screen and Settings can come after the first deploy: the seeded stacks work without the editor. That gets the morning nudges running well before the Dec 29 wedding.
