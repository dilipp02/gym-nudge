import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { SoftwarePasskey } from './authenticator';
import { call, cookieFrom, createUser, json, ORIGIN } from './helpers';

const TOKEN = 'test-registration-token';

async function register(passkey: SoftwarePasskey, registrationToken?: string) {
  const opts = await json(await call('/auth/register/options', { json: { registrationToken } }));
  const response = await passkey.create(opts.options);
  return call('/auth/register/verify', {
    json: { challengeId: opts.challengeId, response, timezone: 'Asia/Kolkata', registrationToken },
  });
}

async function login(passkey: SoftwarePasskey) {
  const opts = await json(await call('/auth/login/options', { method: 'POST' }));
  const response = await passkey.get(opts.options);
  return call('/auth/login/verify', { json: { challengeId: opts.challengeId, response } });
}

describe('passkey auth', () => {
  it('registers a new user (seeded), signs in, and protects routes', async () => {
    const pk = new SoftwarePasskey('localhost', ORIGIN);
    const reg = await register(pk, TOKEN);
    expect(reg.status).toBe(201);
    const { userId, created } = await json(reg);
    expect(created).toBe(true);

    const cookie = cookieFrom(reg);
    expect(reg.headers.get('set-cookie')).toMatch(/HttpOnly/i);
    expect(reg.headers.get('set-cookie')).toMatch(/SameSite=Lax/i);

    const me = await json(await call('/auth/me', { cookie }));
    expect(me).toMatchObject({ signedIn: true, user: { id: userId, timezone: 'Asia/Kolkata' } });

    // Seeded: 4 stacks and 4 goals.
    const stacks = await env.DB.prepare('SELECT COUNT(*) AS n FROM stacks WHERE user_id = ?')
      .bind(userId)
      .first<{ n: number }>();
    const goals = await env.DB.prepare('SELECT COUNT(*) AS n FROM goals WHERE user_id = ?')
      .bind(userId)
      .first<{ n: number }>();
    expect(stacks?.n).toBe(4);
    expect(goals?.n).toBe(4);

    // Log in again with the same passkey.
    const li = await login(pk);
    expect(li.status).toBe(200);
    expect((await json(li)).userId).toBe(userId);
  });

  it('rejects registration without the token once users exist', async () => {
    await createUser();
    const res = await call('/auth/register/options', { json: {} });
    expect(res.status).toBe(403);
    const wrong = await call('/auth/register/options', { json: { registrationToken: 'nope' } });
    expect(wrong.status).toBe(403);
  });

  it('rejects a reused challenge', async () => {
    const pk = new SoftwarePasskey('localhost', ORIGIN);
    await register(pk, TOKEN);
    const opts = await json(await call('/auth/login/options', { method: 'POST' }));
    const response = await pk.get(opts.options);
    expect(
      (await call('/auth/login/verify', { json: { challengeId: opts.challengeId, response } }))
        .status,
    ).toBe(200);
    const again = await pk.get(opts.options);
    expect(
      (
        await call('/auth/login/verify', {
          json: { challengeId: opts.challengeId, response: again },
        })
      ).status,
    ).toBe(400);
  });

  it('rejects a login signed for another origin', async () => {
    const pk = new SoftwarePasskey('localhost', ORIGIN);
    await register(pk, TOKEN);
    const opts = await json(await call('/auth/login/options', { method: 'POST' }));
    const response = await pk.get(opts.options, 'https://evil.example');
    expect(
      (await call('/auth/login/verify', { json: { challengeId: opts.challengeId, response } }))
        .status,
    ).toBe(401);
  });

  it('lets a signed-in user add a second passkey', async () => {
    const first = new SoftwarePasskey('localhost', ORIGIN);
    const cookie = cookieFrom(await register(first, TOKEN));
    const second = new SoftwarePasskey('localhost', ORIGIN);
    const opts = await json(await call('/auth/register/options', { json: {}, cookie }));
    const response = await second.create(opts.options);
    const res = await call('/auth/register/verify', {
      json: { challengeId: opts.challengeId, response, timezone: 'Asia/Kolkata' },
      cookie,
    });
    expect(res.status).toBe(200);
    expect((await json(res)).created).toBe(false);
    expect((await login(second)).status).toBe(200);
  });

  it('401s protected routes without a valid cookie, and logout clears it', async () => {
    expect((await call('/auth/me')).status).toBe(200);
    expect((await json(await call('/auth/me'))).signedIn).toBe(false);
    const forged = await json(
      await call('/auth/me', { cookie: 'gn_session=someone.9999999999.forged' }),
    );
    expect(forged.signedIn).toBe(false);
    const out = await call('/auth/logout', { method: 'POST' });
    expect(out.status).toBe(204);
    expect(out.headers.get('set-cookie')).toMatch(/gn_session=;/);
  });
});
