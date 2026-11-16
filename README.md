# Gym Nudge

A Home Screen web app that turns each gym day into numbers: what a session gained, and what a skip
cost, measured against your real goals and dates.

- Design spec: [docs/superpowers/specs/2026-11-15-gym-nudge-design.md](docs/superpowers/specs/2026-11-15-gym-nudge-design.md)
- Implementation plan: [docs/superpowers/plans/2026-11-15-gym-nudge-plan.md](docs/superpowers/plans/2026-11-15-gym-nudge-plan.md)

## Layout

| Path            | What it is                                                                      |
| --------------- | ------------------------------------------------------------------------------- |
| `packages/core` | Pure TypeScript: progress maths, day rules, nudge engine, message templates     |
| `apps/api`      | Cloudflare Worker (Hono, D1, Web Push, 5-minute scheduler), served at `/api`    |
| `apps/web`      | React + Vite web app with a service worker, installed to the iPhone Home Screen |

## Commands

```bash
npm install
```

```bash
npm test
```

```bash
npm run typecheck
```

```bash
npm run lint
```

```bash
npm run dev:api
```

```bash
npm run dev:web
```

The web app runs on http://localhost:5180 and proxies `/api` to the Worker on port 8787.

To use the UI locally without registering a real passkey, create a local test user and paste the
printed cookie line into the browser console on http://localhost:5180:

```bash
npm run dev:user -w @gym-nudge/api
```

The first time, apply the database migrations to the local dev database:

```bash
npx wrangler d1 migrations apply gym-nudge --local
```

Service workers and push notifications only work in a regular browser (Chrome or Safari), not in
the Claude desktop app's preview pane.
