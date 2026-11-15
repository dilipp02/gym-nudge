import { env } from 'cloudflare:test';
import { exports } from 'cloudflare:workers';
import { localDate } from '@gym-nudge/core';
import { SESSION_COOKIE, signSession } from '../src/auth/session';
import { insertUserStatements, type User } from '../src/db/repo';
import { seedStatements } from '../src/seed';

export const ORIGIN = 'http://localhost:5180';

export interface CallInit {
  method?: string;
  json?: unknown;
  cookie?: string;
  headers?: Record<string, string>;
}

export async function call(path: string, init: CallInit = {}): Promise<Response> {
  const headers: Record<string, string> = { Origin: ORIGIN, ...init.headers };
  if (init.cookie) headers.Cookie = init.cookie;
  let body: string | undefined;
  if (init.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(init.json);
  }
  return exports.default.fetch(`http://localhost/api${path}`, {
    method: init.method ?? (body ? 'POST' : 'GET'),
    headers,
    body,
  });
}

/** `Cookie` header value from a response's Set-Cookie. */
export function cookieFrom(res: Response): string {
  const set = res.headers.get('set-cookie') ?? '';
  const m = new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(set);
  if (!m) throw new Error(`No session cookie in: ${set}`);
  return `${SESSION_COOKIE}=${m[1]}`;
}

/** Create a seeded user directly in D1 and a signed session cookie for it. */
export async function createUser(
  over: Partial<User> = {},
): Promise<{ user: User; cookie: string }> {
  const timezone = over.timezone ?? 'Europe/London';
  const user: User = {
    id: crypto.randomUUID(),
    timezone,
    age: 28,
    sex: 'M',
    heightCm: 183,
    startDate: localDate(new Date(), timezone),
    createdAt: new Date().toISOString(),
    ...over,
  };
  await env.DB.batch([...insertUserStatements(env.DB, user), ...seedStatements(env.DB, user.id)]);
  const token = await signSession(
    user.id,
    Math.floor(Date.now() / 1000) + 3600,
    env.SESSION_SECRET,
  );
  return { user, cookie: `${SESSION_COOKIE}=${token}` };
}

export async function json<T = any>(res: Response): Promise<T> {
  return (await res.json()) as T;
}
