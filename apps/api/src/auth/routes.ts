// Passkey registration and login (spec §5.2, plan 3.2).
import { localDate } from '@gym-nudge/core';
import { zValidator } from '@hono/zod-validator';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { AppEnv } from '../app-env';
import {
  countUsers,
  getCredential,
  getUser,
  insertChallenge,
  insertCredentialStatement,
  insertUserStatements,
  listCredentialIds,
  takeChallenge,
  updateCredentialCounter,
} from '../db/repo';
import { safeEqual } from '../lib/crypto';
import { zTimeZone } from '../lib/validate';
import { seedStatements } from '../seed';
import { currentUserId, endSession, startSession } from './session';

const CHALLENGE_TTL_MS = 5 * 60_000;

/**
 * A new account may be created when there are no users yet (first run), or
 * with the REGISTRATION_TOKEN secret. Signed-in users can always add a passkey.
 */
async function mayCreateUser(env: Env, token: string | undefined): Promise<boolean> {
  if ((await countUsers(env.DB)) === 0) return true;
  const expected = env.REGISTRATION_TOKEN ?? '';
  return expected.length > 0 && token !== undefined && safeEqual(token, expected);
}

const zCredentialJson = z
  .object({ id: z.string(), rawId: z.string(), type: z.literal('public-key') })
  .passthrough();

export const authRoutes = new Hono<AppEnv>()
  .post(
    '/register/options',
    zValidator('json', z.object({ registrationToken: z.string().optional() })),
    async (c) => {
      const { registrationToken } = c.req.valid('json');
      const signedIn = await currentUserId(c);
      let userId: string;
      let exclude: string[] = [];
      if (signedIn && (await getUser(c.env.DB, signedIn))) {
        userId = signedIn;
        exclude = await listCredentialIds(c.env.DB, userId);
      } else {
        if (!(await mayCreateUser(c.env, registrationToken))) {
          throw new HTTPException(403, { message: 'Registration is closed' });
        }
        userId = crypto.randomUUID();
      }
      const options = await generateRegistrationOptions({
        rpName: c.env.RP_NAME,
        rpID: c.env.RP_ID,
        userName: 'Gym Nudge',
        userID: new Uint8Array(new TextEncoder().encode(userId)),
        attestationType: 'none',
        authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
        excludeCredentials: exclude.map((id) => ({ id })),
      });
      const challengeId = crypto.randomUUID();
      await insertChallenge(c.env.DB, {
        id: challengeId,
        challenge: options.challenge,
        kind: 'register',
        userId,
        expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS).toISOString(),
      });
      return c.json({ challengeId, options });
    },
  )
  .post(
    '/register/verify',
    zValidator(
      'json',
      z.object({
        challengeId: z.string(),
        response: zCredentialJson,
        timezone: zTimeZone,
        registrationToken: z.string().optional(),
      }),
    ),
    async (c) => {
      const body = c.req.valid('json');
      const now = new Date();
      const challenge = await takeChallenge(
        c.env.DB,
        body.challengeId,
        'register',
        now.toISOString(),
      );
      if (!challenge?.userId)
        throw new HTTPException(400, { message: 'Challenge expired or unknown' });

      const verification = await verifyRegistrationResponse({
        response: body.response as unknown as RegistrationResponseJSON,
        expectedChallenge: challenge.challenge,
        expectedOrigin: c.env.APP_ORIGIN,
        expectedRPID: c.env.RP_ID,
        requireUserVerification: false,
      }).catch(() => ({ verified: false as const }));
      if (!verification.verified)
        throw new HTTPException(400, { message: 'Passkey verification failed' });

      const { credential } = verification.registrationInfo;
      const cred = {
        id: credential.id,
        userId: challenge.userId,
        publicKey: credential.publicKey,
        counter: credential.counter,
        transports: credential.transports ?? [],
      };

      const existing = await getUser(c.env.DB, challenge.userId);
      if (existing) {
        // Adding a passkey: must be the signed-in owner.
        if ((await currentUserId(c)) !== existing.id)
          throw new HTTPException(403, { message: 'Not allowed' });
        await insertCredentialStatement(c.env.DB, cred, now.toISOString()).run();
        return c.json({ userId: existing.id, created: false });
      }

      if (!(await mayCreateUser(c.env, body.registrationToken))) {
        throw new HTTPException(403, { message: 'Registration is closed' });
      }
      const user = {
        id: challenge.userId,
        timezone: body.timezone,
        age: null,
        sex: null,
        heightCm: null,
        startDate: localDate(now, body.timezone),
        createdAt: now.toISOString(),
      };
      await c.env.DB.batch([
        ...insertUserStatements(c.env.DB, user),
        ...seedStatements(c.env.DB, user.id),
        insertCredentialStatement(c.env.DB, cred, now.toISOString()),
      ]);
      await startSession(c, user.id);
      return c.json({ userId: user.id, created: true }, 201);
    },
  )
  .post('/login/options', async (c) => {
    const options = await generateAuthenticationOptions({
      rpID: c.env.RP_ID,
      userVerification: 'preferred',
    });
    const challengeId = crypto.randomUUID();
    await insertChallenge(c.env.DB, {
      id: challengeId,
      challenge: options.challenge,
      kind: 'login',
      userId: null,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS).toISOString(),
    });
    return c.json({ challengeId, options });
  })
  .post(
    '/login/verify',
    zValidator('json', z.object({ challengeId: z.string(), response: zCredentialJson })),
    async (c) => {
      const body = c.req.valid('json');
      const challenge = await takeChallenge(
        c.env.DB,
        body.challengeId,
        'login',
        new Date().toISOString(),
      );
      if (!challenge) throw new HTTPException(400, { message: 'Challenge expired or unknown' });
      const cred = await getCredential(c.env.DB, body.response.id);
      if (!cred) throw new HTTPException(401, { message: 'Unknown passkey' });

      const verification = await verifyAuthenticationResponse({
        response: body.response as unknown as AuthenticationResponseJSON,
        expectedChallenge: challenge.challenge,
        expectedOrigin: c.env.APP_ORIGIN,
        expectedRPID: c.env.RP_ID,
        credential: {
          id: cred.id,
          publicKey: new Uint8Array(cred.publicKey),
          counter: cred.counter,
          transports: cred.transports,
        },
        requireUserVerification: false,
      }).catch(() => ({ verified: false as const, authenticationInfo: undefined }));
      if (!verification.verified || !verification.authenticationInfo) {
        throw new HTTPException(401, { message: 'Passkey verification failed' });
      }
      await updateCredentialCounter(c.env.DB, cred.id, verification.authenticationInfo.newCounter);
      await startSession(c, cred.userId);
      return c.json({ userId: cred.userId });
    },
  )
  .post('/logout', (c) => {
    endSession(c);
    return c.body(null, 204);
  })
  .get('/me', async (c) => {
    const userId = await currentUserId(c);
    const user = userId ? await getUser(c.env.DB, userId) : null;
    return c.json({ signedIn: user != null, user });
  });
