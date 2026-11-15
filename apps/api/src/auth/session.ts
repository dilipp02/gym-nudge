// Session cookie: `<userId>.<expiresEpochSeconds>.<hmac>`, HTTP-only, SameSite=Lax (spec §5.2).
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../app-env';
import { getUser } from '../db/repo';
import { hmacSign, hmacVerify } from '../lib/crypto';

export const SESSION_COOKIE = 'gn_session';
export const SESSION_DAYS = 180;

export async function signSession(
  userId: string,
  expiresAt: number,
  secret: string,
): Promise<string> {
  const data = `${userId}.${expiresAt}`;
  return `${data}.${await hmacSign(secret, data)}`;
}

export async function verifySession(
  token: string,
  secret: string,
  nowSeconds: number,
): Promise<string | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [userId, exp, sig] = parts as [string, string, string];
  if (!(await hmacVerify(secret, `${userId}.${exp}`, sig))) return null;
  if (!/^\d+$/.test(exp) || Number(exp) < nowSeconds) return null;
  return userId;
}

const isLocalOrigin = (origin: string) => /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

export async function startSession(c: Context<AppEnv>, userId: string): Promise<void> {
  const maxAge = SESSION_DAYS * 86_400;
  const token = await signSession(
    userId,
    Math.floor(Date.now() / 1000) + maxAge,
    c.env.SESSION_SECRET,
  );
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: !isLocalOrigin(c.env.APP_ORIGIN),
    sameSite: 'Lax',
    path: '/',
    maxAge,
  });
}

export function endSession(c: Context<AppEnv>): void {
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}

/** Resolves the signed-in user or returns null (no error). */
export async function currentUserId(c: Context<AppEnv>): Promise<string | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  return verifySession(token, c.env.SESSION_SECRET, Math.floor(Date.now() / 1000));
}

export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const userId = await currentUserId(c);
  const user = userId ? await getUser(c.env.DB, userId) : null;
  if (!user) throw new HTTPException(401, { message: 'Not signed in' });
  c.set('user', user);
  await next();
});
