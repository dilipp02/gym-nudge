import { Hono } from 'hono';

export type AppEnv = { Bindings: Env };

// Served under /api so the web app and the API share one site (same-site
// session cookie, plan 5.1).
export const app = new Hono<AppEnv>().basePath('/api');

app.get('/health', (c) => c.json({ ok: true }));

export default {
  fetch: app.fetch,
  // Nudge scheduler and day verdicts (plan 3.9). Runs every 5 minutes.
  async scheduled(_controller, _env, _ctx) {},
} satisfies ExportedHandler<Env>;
