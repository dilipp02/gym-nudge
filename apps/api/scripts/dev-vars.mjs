// Generates apps/api/.dev.vars (local development secrets) on a fresh machine.
// The file is gitignored; production secrets live in Cloudflare and are never here.
// Refuses to overwrite an existing file unless --force is passed.
//
// Usage: npm run dev:vars -w @gym-nudge/api [-- --force]
import { webcrypto as c } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const file = join(dirname(fileURLToPath(import.meta.url)), '..', '.dev.vars');
if (existsSync(file) && !process.argv.includes('--force')) {
  console.log('.dev.vars already exists; leaving it alone (pass --force to replace it).');
  process.exit(0);
}

const kp = await c.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
  'sign',
  'verify',
]);
const jwk = await c.subtle.exportKey('jwk', kp.privateKey);
const publicKey = Buffer.from(await c.subtle.exportKey('raw', kp.publicKey)).toString('base64url');
const secret = Buffer.from(c.getRandomValues(new Uint8Array(32))).toString('base64url');

const lines = [
  '# Local development secrets. Never commit. Production uses `wrangler secret put`.',
  `SESSION_SECRET=${secret}`,
  `VAPID_PUBLIC_KEY=${publicKey}`,
  `VAPID_PRIVATE_KEY=${jwk.d}`,
  'VAPID_SUBJECT=mailto:admin@localhost',
  'REGISTRATION_TOKEN=',
  'RP_ID=localhost',
  'APP_ORIGIN=http://localhost:5180',
];
writeFileSync(file, lines.join('\n') + '\n', { mode: 0o600 });
console.log('Wrote apps/api/.dev.vars (values not printed).');
