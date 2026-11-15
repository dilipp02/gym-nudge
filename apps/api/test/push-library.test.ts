// Plan 0.2: checks that @block65/webcrypto-web-push produces a valid Web Push
// request when run inside the Workers runtime. Acting as the browser, this
// test decrypts the payload (RFC 8291 / RFC 8188 aes128gcm, the only encoding
// Apple's push service accepts) and verifies the VAPID JWT (RFC 8292). Kept as
// a compatibility test for the real sender (plan 3.8). A real-iPhone delivery
// check still happens after deploy (plan 5.3).
//
// @pushforge/builder was tried first and rejected: it only emits the legacy
// "aesgcm" encoding.
import { buildPushPayload } from '@block65/webcrypto-web-push';
import { describe, expect, it } from 'vitest';

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    bytes * 8,
  );
  return new Uint8Array(bits);
}

/** Decrypts a single-record aes128gcm Web Push body the way a browser would. */
async function decryptAsBrowser(
  body: Uint8Array,
  uaKeys: CryptoKeyPair,
  uaPublicRaw: Uint8Array,
  authSecret: Uint8Array,
): Promise<string> {
  const salt = body.slice(0, 16);
  const idlen = body[20]!;
  const asPublicRaw = body.slice(21, 21 + idlen);
  const ciphertext = body.slice(21 + idlen);

  const asPublic = await crypto.subtle.importKey(
    'raw',
    asPublicRaw,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  // workers-types names this field `$public`; the runtime takes the standard `public`.
  const ecdhParams = {
    name: 'ECDH',
    public: asPublic,
  } as unknown as SubtleCryptoDeriveKeyAlgorithm;
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits(ecdhParams, uaKeys.privateKey, 256),
  );
  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublicRaw, asPublicRaw);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const padded = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, aesKey, ciphertext),
  );
  // Last record: content, then a 0x02 delimiter, then optional zero padding.
  let end = padded.length - 1;
  while (end >= 0 && padded[end] === 0) end--;
  expect(padded[end]).toBe(2);
  return new TextDecoder().decode(padded.slice(0, end));
}

describe('Web Push library in the Workers runtime', () => {
  it('builds a request a browser can decrypt, signed with a valid VAPID JWT', async () => {
    // Server VAPID key pair (ECDSA P-256), private half as JWK like the real secret.
    const vapid = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ])) as CryptoKeyPair;
    const vapidPrivateJwk = (await crypto.subtle.exportKey('jwk', vapid.privateKey)) as JsonWebKey;
    const vapidPublicRaw = new Uint8Array(
      (await crypto.subtle.exportKey('raw', vapid.publicKey)) as ArrayBuffer,
    );

    // Browser subscription keys (ECDH P-256 + 16-byte auth secret).
    const ua = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ])) as CryptoKeyPair;
    const uaPublicRaw = new Uint8Array(
      (await crypto.subtle.exportKey('raw', ua.publicKey)) as ArrayBuffer,
    );
    const authSecret = crypto.getRandomValues(new Uint8Array(16));

    const payload = {
      title: 'Gym Nudge',
      body: 'Today: Legs. Check-in window 07:00–07:30. Wedding 1: 44d.',
      url: '/today',
    };
    const endpoint = 'https://web.push.apple.com/QGuQyavXutnMx7aZd6Oq';

    const req = await buildPushPayload(
      { data: payload, options: { ttl: 900, urgency: 'high' } },
      {
        endpoint,
        expirationTime: null,
        keys: { p256dh: b64url(uaPublicRaw), auth: b64url(authSecret) },
      },
      {
        subject: 'mailto:admin@example.com',
        publicKey: b64url(vapidPublicRaw),
        privateKey: vapidPrivateJwk.d,
      },
    );

    const headers = new Headers(req.headers);
    expect(headers.get('content-encoding')).toBe('aes128gcm');
    expect(headers.get('ttl')).toBe('900');
    expect(headers.get('urgency')).toBe('high');

    // Payload decrypts back to exactly what was sent.
    const plaintext = await decryptAsBrowser(new Uint8Array(req.body), ua, uaPublicRaw, authSecret);
    expect(JSON.parse(plaintext)).toEqual(payload);

    // VAPID: "vapid t=<jwt>, k=<server public key>"
    const auth = headers.get('authorization') ?? '';
    const match = /^vapid t=([^,]+),\s*k=(.+)$/.exec(auth);
    expect(match).not.toBeNull();
    const [, jwt, k] = match!;
    expect(fromB64url(k!)).toEqual(vapidPublicRaw);

    const [h, p, sig] = jwt!.split('.');
    const verified = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      vapid.publicKey,
      fromB64url(sig!),
      enc.encode(`${h}.${p}`),
    );
    expect(verified).toBe(true);

    const claims = JSON.parse(new TextDecoder().decode(fromB64url(p!)));
    expect(claims.aud).toBe('https://web.push.apple.com');
    expect(claims.sub).toBe('mailto:admin@example.com');
    const now = Math.floor(Date.now() / 1000);
    expect(claims.exp).toBeGreaterThan(now);
    expect(claims.exp).toBeLessThanOrEqual(now + 24 * 60 * 60);
  });
});
