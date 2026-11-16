// Local development only: creates a seeded test user in the LOCAL D1 database and
// prints a session cookie signed with the local SESSION_SECRET from .dev.vars.
// Lets you use the app in a browser without registering a real passkey.
// It cannot affect production: it only touches `wrangler d1 execute --local`.
//
// Usage: npm run dev:user -w @gym-nudge/api [-- --tz Europe/London --start 2026-11-15]
import { execFileSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedStatements } from '../src/seed.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};

const vars = Object.fromEntries(
  readFileSync(join(root, '.dev.vars'), 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
if (!vars.SESSION_SECRET) throw new Error('No SESSION_SECRET in .dev.vars');

const tz = arg('tz', Intl.DateTimeFormat().resolvedOptions().timeZone);
const start = arg('start', new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date()));
const userId = randomUUID();
const now = new Date().toISOString();

const lit = (v) =>
  v === null || v === undefined
    ? 'NULL'
    : typeof v === 'number'
      ? String(v)
      : `'${String(v).replace(/'/g, "''")}'`;
const inline = (sql, args) => {
  let i = 0;
  return sql.replace(/\?/g, () => lit(args[i++]));
};
// Collects what seedStatements would run against D1, as plain SQL.
const recorder = { prepare: (sql) => ({ bind: (...args) => inline(sql, args) }) };

const rules = JSON.stringify({
  R1: true,
  R2: true,
  R3: true,
  R4: true,
  R5: true,
  R6: true,
  R7: true,
  R8: true,
});
const statements = [
  inline(
    'INSERT INTO users (id, timezone, age, sex, height_cm, start_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [userId, tz, 28, 'M', 183, start, now],
  ),
  inline(
    `INSERT INTO settings (user_id, wake_time, checkin_start, checkin_end, rescue_reminder_time, rescue_cutoff,
      verdict_time, sleep_nudge_time, quiet_start, rules_enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, '06:30', '07:00', '07:30', '18:30', '21:00', '21:30', '22:45', '23:30', rules],
  ),
  inline(
    'INSERT INTO body_metrics (user_id, local_date, weight_kg, waist_cm) VALUES (?, ?, ?, ?)',
    [userId, start, 76, 88],
  ),
  ...seedStatements(recorder, userId),
];

const file = join(root, '.wrangler', 'dev-user.sql');
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, statements.map((s) => `${s};`).join('\n') + '\n');
execFileSync('npx', ['wrangler', 'd1', 'execute', 'gym-nudge', '--local', '--file', file], {
  cwd: root,
  stdio: ['ignore', 'ignore', 'inherit'],
});

const exp = Math.floor(Date.now() / 1000) + 30 * 86_400;
const data = `${userId}.${exp}`;
const sig = createHmac('sha256', vars.SESSION_SECRET).update(data).digest('base64url');
console.log(`Created local dev user ${userId} (tz ${tz}, start ${start}).`);
console.log(
  `In the browser console on the web app:\ndocument.cookie = "gn_session=${data}.${sig}; path=/";`,
);
