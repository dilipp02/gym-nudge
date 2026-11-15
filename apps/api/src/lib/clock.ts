import type { Context } from 'hono';
import type { AppEnv } from '../app-env';

/**
 * The current time. Integration tests can pin it with an `X-Test-Now` header,
 * but only when the TEST_CLOCK binding is "enabled" (set in vitest.config.ts,
 * never in wrangler.jsonc or production secrets).
 */
export function now(c: Context<AppEnv>): Date {
  if (c.env.TEST_CLOCK === 'enabled') {
    const pinned = c.req.header('X-Test-Now');
    if (pinned && !Number.isNaN(Date.parse(pinned))) return new Date(pinned);
  }
  return new Date();
}
