import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from './app-env';
import { authRoutes } from './auth/routes';
import { bodyRoutes, goalRoutes, pauseRoutes, settingsRoutes } from './routes/account';
import { exportRoutes, progressRoutes, scorecardRoutes } from './routes/progress';
import { hookRoutes, pushRoutes } from './routes/push';
import { sessionRoutes } from './routes/sessions';
import { stackRoutes } from './routes/stacks';
import { todayRoutes } from './routes/today';
import { runScheduled } from './services/scheduler';

export type { AppEnv } from './app-env';

// Served under /api so the web app and the API share one site (same-site
// session cookie, plan 5.1).
export const app = new Hono<AppEnv>().basePath('/api');

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: 'Internal error' }, 500);
});

app.get('/health', (c) => c.json({ ok: true }));
app.route('/auth', authRoutes);
app.route('/stacks', stackRoutes);
app.route('/goals', goalRoutes);
app.route('/body-metrics', bodyRoutes);
app.route('/pauses', pauseRoutes);
app.route('/settings', settingsRoutes);
app.route('/sessions', sessionRoutes);
app.route('/progress', progressRoutes);
app.route('/scorecard', scorecardRoutes);
app.route('/export', exportRoutes);
app.route('/push', pushRoutes);
app.route('/hooks', hookRoutes);
app.route('/', todayRoutes);

export default {
  fetch: app.fetch,
  // Nudge scheduler and day verdicts (plan 3.9). Runs every 5 minutes.
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runScheduled(env, new Date(controller.scheduledTime)));
  },
} satisfies ExportedHandler<Env>;
