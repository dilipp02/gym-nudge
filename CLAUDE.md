# Gym Nudge: notes for Claude

Read this first when picking the project up on a new machine or in a new session. It's the handover:
what the project is, where it stands, how to run it, and the decisions and traps that aren't obvious
from the code.

## What this is

A personal iPhone web app (installed to the Home Screen) that nudges one user to go to the gym every
morning. The tone is a **data coach**: every message is numbers, such as what a session gained, what a
skip cost in days against real goal dates, and milestone %. No hype, no insults.

- **Design spec (source of truth):** [docs/superpowers/specs/2026-11-15-gym-nudge-design.md](docs/superpowers/specs/2026-11-15-gym-nudge-design.md)
- **Implementation plan + progress log (newest first):** [docs/superpowers/plans/2026-11-15-gym-nudge-plan.md](docs/superpowers/plans/2026-11-15-gym-nudge-plan.md)

When a decision changes during implementation, record it in the spec (marked with the date) and in the
plan's progress log. Both are kept current.

## Status (update this section when it changes)

- Phases 0.2 and 1–5.1 are **done**: core logic, API, web app, deployed.
- **Live:** https://gym-nudge.gym-nudge-api.workers.dev (Cloudflare account of the repo owner).
- **Waiting on the user's iPhone checklist (plan 5.2/5.3):**
  - Add to Home Screen.
  - Create a passkey. The first account to register becomes the owner; registration then needs `REGISTRATION_TOKEN`.
  - Confirm the test push arrives.
  - Set up the snooze Shortcut ("Alarm → Is Snoozed" → POST the personal link).
  - Real push delivery to an iPhone and real Face ID sign-in have **not** been verified yet.
- **Open items:**
  - Plan 0.1: does the iOS "Is Snoozed" automation trigger run without asking? (The user will report back.)
  - Plan 0.3: D1 point-in-time restore on the free plan.
  - Plan 0.4: exact dates for weddings 2 and 3. The seed uses 2027-02-14 and 2027-04-15; edit them in Settings.
  - Playwright end-to-end tests: not written (they need a browser download). Flows were checked by hand.
- **Next after the checklist:** plan Phase 6, a week of real use, then tune nudge times, intensity
  boundaries and strength targets from the week-1 baseline.

## Layout

| Path            | What                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `packages/core` | Pure TS, no I/O, the clock is always passed in: progress maths, day verdicts, projection, nudge rules, message templates. |
| `apps/api`      | Cloudflare Worker (Hono, D1, zod, SimpleWebAuthn, Web Push). Serves `/api/*` and the built web app as static assets.      |
| `apps/web`      | React 19 + Vite 8 web app with a service worker (`src/sw.ts`) and an offline outbox (IndexedDB).                          |

## Setting up a new machine

```bash
git clone ssh://git@github.com:22/dilipp02/gym-nudge.git && cd gym-nudge
```

```bash
npm install
```

```bash
npm run dev:vars -w @gym-nudge/api
```

```bash
npx wrangler d1 migrations apply gym-nudge --local --cwd apps/api
```

```bash
npm test && npm run typecheck && npm run lint
```

- **Run it:** `npm run dev:api` (Worker on 8787) and `npm run dev:web` (http://localhost:5180, proxies `/api`).
- **Use the UI locally without a real passkey:** `npm run dev:user -w @gym-nudge/api` creates a seeded user in the
  **local** D1 and prints a cookie line to paste into the browser console. It never touches production.
- **Deploying needs the owner's Cloudflare login:** the user runs `npx wrangler login`, then `npm run deploy`.
  Production secrets already live in Cloudflare; redeploys keep them. Rotate one with `npx wrangler secret put NAME --cwd apps/api`.
  Production migrations: `npx wrangler d1 migrations apply gym-nudge --remote --cwd apps/api`.
- **Pushing to GitHub from a new machine:**
  - On the original Mac, pushes use a repo-only deploy key (`~/.ssh/gym_nudge_deploy`, set in this repo's `core.sshCommand`).
  - A new machine needs its **own** key added as a write deploy key on the repo (Settings → Deploy keys), or another way to authenticate as the repo owner.
  - Then: `git config core.sshCommand "ssh -i ~/.ssh/<key> -o IdentitiesOnly=yes"`.
  - The remote uses `ssh://git@github.com:22/...` on purpose: the owner's global `~/.gitconfig` rewrites `git@github.com:` to HTTPS, which would bypass the deploy key.
  - Set `git config user.email` to the address the owner uses for this repo before committing.

## Conventions

- **Commit messages:** a single line. No attribution trailers, no mention of Claude.
- **Commit and push only when the user asks.** They work on `main`.
- Tests come first for `packages/core` and the API. Keep the core free of I/O and hidden clocks.
- The UI follows the approved mockups: dark, quiet, numbers in monospace, Today has confirm-then-fix
  logging, Progress is goal-first.
- **No test-only backdoors in app code.**
  - Passkey tests use a software authenticator (`apps/api/test/authenticator.ts`).
  - The route clock can be pinned with an `X-Test-Now` header only when the `TEST_CLOCK` binding is `enabled`, which is set in `vitest.config.ts` only.

## Decisions and traps worth knowing

- **Versions are pinned on purpose:**
  - TypeScript **6.0**: typescript-eslint doesn't support 7 yet.
  - Vitest **4.x**: required by `@cloudflare/vitest-plugin`, which replaced the deprecated `vitest-pool-workers`.
  - npm workspaces, not pnpm.
- **Push library:** `@block65/webcrypto-web-push` v2 (`aes128gcm`, the encoding Apple's push service needs). `@pushforge/builder` was rejected because it only emits legacy `aesgcm`.
- **Projected goal date (spec §7.3):** "on plan from tomorrow" at 6/week, so **each skip costs 7/6 ≈ 1.17 days**. The 28-day-pace date is secondary context only. The original pace-only formula made one early skip cost about 29 days.
- **Offline replays:** the queued check-in and session send the phone's timestamp (`at` and `performedAt`). The server accepts it only if it isn't in the future and falls on the logged day. Late logs re-judge that day and every later one.
- **Baseline week:** for the first 7 days every lift counts as on track and shows grey, because the baseline is still being set.
- **Routing:** `/today` and its sibling routes are mounted at the API root with `requireUser` **per route**. A `.use()` there would also force sign-in onto later routes such as the snooze hook.
- **iPhone Home Screen apps keep cookies separate from Safari**, so setup blocks on the Add to Home Screen step on iOS.
- **The desktop app's in-app browser can't register service workers.** Check the service worker and push in real Safari or Chrome. Don't click "Create passkey" in the in-app browser: it would save a real passkey to the user's macOS keychain. Use `dev:user` instead.
- **Port 5173** may be taken by another local project. The web dev server uses 5180 with `strictPort`.
- **Privacy:** the GitHub repo is public. Don't add personal details beyond what the spec already contains.
