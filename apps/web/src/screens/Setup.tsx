// First-time setup (spec §9.5): Home Screen install → passkey → notifications →
// profile & first measurement → snooze Shortcut.
import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';
import type { Goal } from '../api/types';
import { ErrorText, Field } from '../components/ui';
import { useAuth } from '../lib/auth';
import { enablePush, isIos, isStandalone, pushState, type PushState } from '../lib/device';
import { formatShortDate } from '../lib/format';

const STEPS = ['notifications', 'profile', 'shortcut'] as const;
type Step = (typeof STEPS)[number];

const storageKey = (userId: string) => `gn-setup-${userId}`;

export function setupDone(userId: string): boolean {
  try {
    return localStorage.getItem(storageKey(userId)) === 'done';
  } catch {
    return true; // storage unavailable: don't trap the user in setup
  }
}

function saveStep(userId: string, value: Step | 'done') {
  try {
    localStorage.setItem(storageKey(userId), value);
  } catch {
    /* ignore */
  }
}

function savedStep(userId: string): Step {
  try {
    const v = localStorage.getItem(storageKey(userId));
    return (STEPS as readonly string[]).includes(v ?? '') ? (v as Step) : 'notifications';
  } catch {
    return 'notifications';
  }
}

function AddToHomeScreen() {
  return (
    <div className="stack">
      <h1>Add to Home Screen</h1>
      <p className="muted">
        On iPhone, notifications only work when Gym Nudge is opened from the Home Screen.
      </p>
      <div className="card">
        <ol className="stack" style={{ margin: 0, paddingLeft: 20 }}>
          <li>Tap the Share button in Safari's toolbar.</li>
          <li>Choose “Add to Home Screen”, then “Add”.</li>
          <li>Open Gym Nudge from your Home Screen.</li>
        </ol>
      </div>
    </div>
  );
}

function Welcome() {
  const { register, login } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [token, setToken] = useState('');

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <h1>Gym Nudge</h1>
      <p className="muted">
        A data coach for showing up: what each session gains and what each skip costs, against your
        real goals.
      </p>
      <button
        className="btn primary block"
        disabled={busy}
        onClick={() => run(() => register(token || undefined))}
      >
        Create passkey (Face ID)
      </button>
      <button className="btn block" disabled={busy} onClick={() => run(login)}>
        I already have a passkey
      </button>
      {showToken ? (
        <Field label="Registration code">
          <input
            className="input"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="off"
          />
        </Field>
      ) : (
        <button className="link small" onClick={() => setShowToken(true)}>
          I have a registration code
        </button>
      )}
      <ErrorText error={error} />
    </div>
  );
}

function NotificationsStep({ next }: { next: () => void }) {
  const [state, setState] = useState<PushState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tested, setTested] = useState<string | null>(null);
  useEffect(() => {
    void pushState().then(setState);
  }, []);

  const enable = async () => {
    setError(null);
    try {
      setState(await enablePush());
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  const test = async () => {
    try {
      const r = await api.post<{ delivered: number }>('/push/test');
      setTested(
        r.delivered > 0
          ? 'Sent. It should appear in a few seconds.'
          : 'Not delivered. Try enabling again.',
      );
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div className="stack">
      <h1>Notifications</h1>
      <p className="muted">
        The nudges are the point: 6:30 wake-up, last calls before the check-in window closes, and
        the 9:30 pm verdict.
      </p>
      {state === 'unsupported' && (
        <div className="banner warn">
          This browser can't receive notifications. On iPhone, open the app from the Home Screen.
        </div>
      )}
      {state === 'denied' && (
        <div className="banner bad">
          Notifications are blocked. Allow them in Settings → Notifications → Gym Nudge.
        </div>
      )}
      {state === 'on' ? (
        <>
          <div className="banner">Notifications are on.</div>
          <button className="btn block" onClick={test}>
            Send a test notification
          </button>
          {tested && <p className="small muted">{tested}</p>}
          <button className="btn primary block" onClick={next}>
            Continue
          </button>
        </>
      ) : (
        <>
          <button className="btn primary block" onClick={enable} disabled={state === 'unsupported'}>
            Allow notifications
          </button>
          <button className="link" onClick={next}>
            Skip for now
          </button>
        </>
      )}
      <ErrorText error={error} />
    </div>
  );
}

function ProfileStep({ next }: { next: () => void }) {
  const [age, setAge] = useState('28');
  const [height, setHeight] = useState('183');
  const [weight, setWeight] = useState('76');
  const [waist, setWaist] = useState('');
  const [goals, setGoals] = useState<Goal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void api.get<Goal[]>('/goals').then(setGoals, () => undefined);
  }, []);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.put('/settings', {
        profile: { age: age ? Number(age) : null, heightCm: height ? Number(height) : null },
      });
      // Bodyweight exercises need a bodyweight from day 1 (plan 4.4).
      if (weight || waist) {
        await api.post('/body-metrics', {
          weightKg: weight ? Number(weight) : null,
          waistCm: waist ? Number(waist) : null,
        });
      }
      next();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <h1>You and your goals</h1>
      <div className="grid-2">
        <Field label="Age">
          <input
            className="input"
            inputMode="numeric"
            value={age}
            onChange={(e) => setAge(e.target.value)}
          />
        </Field>
        <Field label="Height (cm)">
          <input
            className="input"
            inputMode="decimal"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
          />
        </Field>
        <Field label="Weight today (kg)">
          <input
            className="input"
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
          />
        </Field>
        <Field label="Waist at navel (cm)">
          <input
            className="input"
            inputMode="decimal"
            value={waist}
            placeholder="optional"
            onChange={(e) => setWaist(e.target.value)}
          />
        </Field>
      </div>
      <div className="card">
        <div className="label">Milestones (edit any time in Settings)</div>
        <div className="list">
          {goals.map((g) => (
            <div key={g.id} className="list-item">
              <span>
                {g.name} {g.isPrimary && <span className="muted small">· primary</span>}
              </span>
              <span className="num muted">{formatShortDate(g.date)}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="small muted">
        Week 1 sets your baseline, and the first two weeks run at about two-thirds of the planned
        sets.
      </p>
      <button className="btn primary block" disabled={busy} onClick={save}>
        Save and continue
      </button>
      <ErrorText error={error} />
    </div>
  );
}

export function SnoozeShortcutGuide() {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const create = async () => {
    try {
      setUrl((await api.post<{ url: string }>('/settings/snooze-token/reset')).url);
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <div className="stack">
      <ol className="stack small" style={{ margin: 0, paddingLeft: 20 }}>
        <li>Open Shortcuts → Automation → New → Alarm → choose your alarm → “Is Snoozed”.</li>
        <li>Add the action “Get Contents of URL”, set Method to POST, and paste your link.</li>
        <li>Turn on “Run Immediately”.</li>
      </ol>
      {url ? (
        <div className="card stack">
          <code className="num small" style={{ wordBreak: 'break-all' }}>
            {url}
          </code>
          <button
            className="btn small"
            onClick={() => {
              void navigator.clipboard?.writeText(url).then(() => setCopied(true));
            }}
          >
            {copied ? 'Copied' : 'Copy link'}
          </button>
          <p className="small muted">
            This link is shown once. Creating a new one disables the old one.
          </p>
        </div>
      ) : (
        <button className="btn block" onClick={create}>
          Create my snooze link
        </button>
      )}
      <ErrorText error={error} />
    </div>
  );
}

function ShortcutStep({ next }: { next: () => void }) {
  return (
    <div className="stack">
      <h1>Snooze alarm hook</h1>
      <p className="muted">
        When you snooze your alarm, an iPhone Shortcut pings Gym Nudge and you get the numbers on
        what you're about to give up.
      </p>
      <SnoozeShortcutGuide />
      <button className="btn primary block" onClick={next}>
        Finish
      </button>
      <button className="link" onClick={next}>
        Skip (set it up later in Settings)
      </button>
    </div>
  );
}

/** Signed out: install guide + welcome. Signed in but not finished: the remaining steps. */
export function Setup({ onDone }: { onDone: () => void }) {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>(() => (user ? savedStep(user.id) : 'notifications'));

  // Blocking on iPhone: Home Screen apps keep their own cookies, so signing in from
  // Safari wouldn't carry over, and notifications only work from the Home Screen.
  if (isIos() && !isStandalone()) return <AddToHomeScreen />;
  if (!user) return <Welcome />;

  const go = (s: Step | 'done') => {
    saveStep(user.id, s);
    if (s === 'done') onDone();
    else setStep(s);
  };
  if (step === 'notifications') return <NotificationsStep next={() => go('profile')} />;
  if (step === 'profile') return <ProfileStep next={() => go('shortcut')} />;
  return <ShortcutStep next={() => go('done')} />;
}
