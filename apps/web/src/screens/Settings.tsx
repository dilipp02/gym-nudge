// Settings (spec §9.4).
import { useEffect, useState, type ReactNode } from 'react';
import { api, errorMessage } from '../api/client';
import type { Goal, Pause, RuleId, Settings as SettingsT, Stack, User } from '../api/types';
import { ErrorText, Field, Loading, Toggle } from '../components/ui';
import { useAuth } from '../lib/auth';
import { disablePush, enablePush, pushState, type PushState } from '../lib/device';
import { formatShortDate } from '../lib/format';
import { useLoad } from '../lib/useLoad';
import { SnoozeShortcutGuide } from './Setup';

const RULES: Array<{ id: RuleId; label: string }> = [
  { id: 'R1', label: 'Evening verdict + commit (Sun: scorecard)' },
  { id: 'R2', label: 'Sleep reminder' },
  { id: 'R3', label: 'Wake-up' },
  { id: 'R4', label: 'Snooze response' },
  { id: 'R5', label: 'Leave-in-10-min' },
  { id: 'R6', label: 'Last call' },
  { id: 'R7', label: 'Window closed' },
  { id: 'R8', label: 'Evening rescue' },
];

const TIMES: Array<{ key: keyof SettingsT; label: string }> = [
  { key: 'wakeTime', label: 'Wake-up' },
  { key: 'checkinStart', label: 'Check-in opens' },
  { key: 'checkinEnd', label: 'Check-in closes' },
  { key: 'rescueReminderTime', label: 'Rescue reminder' },
  { key: 'rescueCutoff', label: 'Rescue deadline' },
  { key: 'verdictTime', label: 'Verdict + commit' },
  { key: 'sleepNudgeTime', label: 'Sleep reminder' },
  { key: 'quietStart', label: 'Quiet hours start' },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card stack">
      <h2 style={{ margin: 0 }}>{title}</h2>
      {children}
    </div>
  );
}

function NotificationsSection({
  settings,
  save,
}: {
  settings: SettingsT;
  save: (s: Partial<SettingsT>) => void;
}) {
  const [state, setState] = useState<PushState | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    void pushState().then(setState);
  }, []);
  const act = async (fn: () => Promise<unknown>) => {
    setMsg(null);
    try {
      await fn();
      setState(await pushState());
    } catch (err) {
      setMsg(errorMessage(err));
    }
  };
  return (
    <Section title="Notifications">
      <div className="row">
        <span>
          Status:{' '}
          <span className={state === 'on' ? 'good' : 'warn'}>
            {state === 'on'
              ? 'on'
              : state === 'denied'
                ? 'blocked in system settings'
                : state === 'unsupported'
                  ? 'not supported here'
                  : 'off'}
          </span>
        </span>
        {state === 'on' ? (
          <button className="btn small" onClick={() => act(disablePush)}>
            Turn off
          </button>
        ) : (
          <button
            className="btn small"
            disabled={state === 'unsupported' || state === 'denied'}
            onClick={() => act(enablePush)}
          >
            Turn on
          </button>
        )}
      </div>
      <button
        className="btn small"
        style={{ alignSelf: 'flex-start' }}
        onClick={() =>
          act(async () => {
            const r = await api.post<{ delivered: number }>('/push/test');
            setMsg(r.delivered > 0 ? 'Test sent.' : 'Not delivered: no working subscription.');
          })
        }
      >
        Send test
      </button>
      {msg && <p className="small muted">{msg}</p>}
      <div className="list">
        {RULES.map((r) => (
          <div key={r.id} className="list-item">
            <span className="small">
              <span className="num muted">{r.id}</span> {r.label}
            </span>
            <Toggle
              label={r.label}
              on={settings.rulesEnabled[r.id]}
              onChange={(v) => save({ rulesEnabled: { ...settings.rulesEnabled, [r.id]: v } })}
            />
          </div>
        ))}
      </div>
    </Section>
  );
}

function GoalEditor({
  goal,
  keyLifts,
  onDone,
}: {
  goal: Goal | null;
  keyLifts: Array<{ id: string; name: string; type: string }>;
  onDone: () => void;
}) {
  const [g, setG] = useState<Goal>(
    goal ?? {
      id: '',
      name: '',
      date: '',
      isPrimary: false,
      waistTargetDeltaCm: null,
      weightMin: null,
      weightMax: null,
      liftTargets: [],
    },
  );
  const [error, setError] = useState<string | null>(null);
  const target = (exerciseId: string) => g.liftTargets.find((t) => t.exerciseId === exerciseId);
  const setTarget = (
    exerciseId: string,
    patch: { targetWeight?: number | null; targetReps?: number | null },
  ) => {
    const current = target(exerciseId) ?? { exerciseId, targetWeight: null, targetReps: 0 };
    const next = { ...current, ...patch };
    const others = g.liftTargets.filter((t) => t.exerciseId !== exerciseId);
    setG({
      ...g,
      liftTargets: next.targetReps ? [...others, { ...next, targetReps: next.targetReps }] : others,
    });
  };
  const n = (v: string) => (v.trim() === '' ? null : Number(v));
  const save = async () => {
    setError(null);
    try {
      const body = { ...g, id: undefined };
      if (goal) await api.put(`/goals/${goal.id}`, body);
      else await api.post('/goals', body);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  const remove = async () => {
    if (!goal) return;
    try {
      await api.del(`/goals/${goal.id}`);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <div className="stack" style={{ padding: '8px 0' }}>
      <div className="grid-2">
        <Field label="Name">
          <input
            className="input"
            value={g.name}
            onChange={(e) => setG({ ...g, name: e.target.value })}
          />
        </Field>
        <Field label="Date">
          <input
            className="input"
            type="date"
            value={g.date}
            onChange={(e) => setG({ ...g, date: e.target.value })}
          />
        </Field>
        <Field label="Weight min (kg)">
          <input
            className="input num"
            inputMode="decimal"
            value={g.weightMin ?? ''}
            onChange={(e) => setG({ ...g, weightMin: n(e.target.value) })}
          />
        </Field>
        <Field label="Weight max (kg)">
          <input
            className="input num"
            inputMode="decimal"
            value={g.weightMax ?? ''}
            onChange={(e) => setG({ ...g, weightMax: n(e.target.value) })}
          />
        </Field>
        <Field label="Waist change (cm)">
          <input
            className="input num"
            inputMode="decimal"
            value={g.waistTargetDeltaCm ?? ''}
            onChange={(e) => setG({ ...g, waistTargetDeltaCm: n(e.target.value) })}
          />
        </Field>
        <div className="row" style={{ alignSelf: 'end' }}>
          <span className="small">Primary</span>
          <Toggle
            label="Primary goal"
            on={g.isPrimary}
            onChange={(v) => setG({ ...g, isPrimary: v })}
          />
        </div>
      </div>
      <div className="label">Lift targets</div>
      {keyLifts.map((l) => (
        <div key={l.id} className="row small">
          <span style={{ flex: 1 }}>{l.name}</span>
          {l.type === 'weighted' && (
            <input
              className="input num"
              style={{ width: 70 }}
              inputMode="decimal"
              aria-label={`${l.name} target kg`}
              placeholder="kg"
              value={target(l.id)?.targetWeight ?? ''}
              onChange={(e) => setTarget(l.id, { targetWeight: n(e.target.value) })}
            />
          )}
          <span className="muted">×</span>
          <input
            className="input num"
            style={{ width: 60 }}
            inputMode="numeric"
            aria-label={`${l.name} target reps`}
            placeholder="reps"
            value={target(l.id)?.targetReps || ''}
            onChange={(e) => setTarget(l.id, { targetReps: n(e.target.value) })}
          />
        </div>
      ))}
      <div className="grid-2">
        <button className="btn" onClick={onDone}>
          Cancel
        </button>
        <button className="btn primary" disabled={!g.name.trim() || !g.date} onClick={save}>
          Save
        </button>
      </div>
      {goal && !goal.isPrimary && (
        <button className="btn block danger" onClick={remove}>
          Delete goal
        </button>
      )}
      <ErrorText error={error} />
    </div>
  );
}

function GoalsSection() {
  const { data: goals, reload } = useLoad(() => api.get<Goal[]>('/goals'));
  const { data: stacks } = useLoad(() => api.get<Stack[]>('/stacks'));
  const [editing, setEditing] = useState<string | null>(null);
  const keyLifts = (stacks ?? []).flatMap((s) =>
    s.exercises.filter((e) => e.isKeyLift).map((e) => ({ id: e.id, name: e.name, type: e.type })),
  );
  const done = () => {
    setEditing(null);
    void reload();
  };
  return (
    <Section title="Goals">
      {!goals ? (
        <Loading />
      ) : (
        <div className="list">
          {goals.map((g) =>
            editing === g.id ? (
              <GoalEditor key={g.id} goal={g} keyLifts={keyLifts} onDone={done} />
            ) : (
              <div key={g.id} className="list-item clickable" onClick={() => setEditing(g.id)}>
                <span>
                  {g.name}
                  {g.isPrimary && <span className="muted small"> · primary</span>}
                </span>
                <span className="num muted">{formatShortDate(g.date)}</span>
              </div>
            ),
          )}
          {editing === 'new' && <GoalEditor goal={null} keyLifts={keyLifts} onDone={done} />}
        </div>
      )}
      {editing !== 'new' && (
        <button
          className="btn small"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => setEditing('new')}
        >
          + Add goal
        </button>
      )}
    </Section>
  );
}

function BodySection() {
  const [weight, setWeight] = useState('');
  const [waist, setWaist] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const save = async () => {
    try {
      await api.post('/body-metrics', {
        weightKg: weight ? Number(weight) : null,
        waistCm: waist ? Number(waist) : null,
      });
      setMsg('Saved for today.');
      setWeight('');
      setWaist('');
    } catch (err) {
      setMsg(errorMessage(err));
    }
  };
  return (
    <Section title="Body measurements">
      <div className="grid-2">
        <Field label="Weight (kg)">
          <input
            className="input num"
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
          />
        </Field>
        <Field label="Waist at navel (cm)">
          <input
            className="input num"
            inputMode="decimal"
            value={waist}
            onChange={(e) => setWaist(e.target.value)}
          />
        </Field>
      </div>
      <button
        className="btn small"
        style={{ alignSelf: 'flex-start' }}
        disabled={!weight && !waist}
        onClick={save}
      >
        Save
      </button>
      {msg && <p className="small muted">{msg}</p>}
    </Section>
  );
}

function PauseSection() {
  const { data: pauses, reload } = useLoad(() => api.get<Pause[]>('/pauses'));
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const open = pauses?.find((p) => p.endDate == null);
  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      void reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <Section title="Sick / travel pause">
      <p className="small muted" style={{ margin: 0 }}>
        Stops nudges and freezes your streak. The projected date still moves, and paused days show
        in the weekly scorecard.
      </p>
      {open ? (
        <div className="row">
          <span className="small">Paused since {formatShortDate(open.startDate)}</span>
          <button className="btn small" onClick={() => act(() => api.patch(`/pauses/${open.id}`))}>
            End pause
          </button>
        </div>
      ) : (
        <div className="row">
          <input
            className="input"
            placeholder="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <button
            className="btn small"
            onClick={() => act(() => api.post('/pauses', { reason: reason || null }))}
          >
            Start
          </button>
        </div>
      )}
      <ErrorText error={error} />
    </Section>
  );
}

function ProfileSection({ profile, onSaved }: { profile: User; onSaved: () => void }) {
  const [p, setP] = useState(profile);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setError(null);
    try {
      await api.put('/settings', {
        profile: { timezone: p.timezone, age: p.age, heightCm: p.heightCm },
      });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  const n = (v: string) => (v.trim() === '' ? null : Number(v));
  return (
    <Section title="Profile">
      <div className="grid-2">
        <Field label="Age">
          <input
            className="input num"
            inputMode="numeric"
            value={p.age ?? ''}
            onChange={(e) => setP({ ...p, age: n(e.target.value) })}
          />
        </Field>
        <Field label="Height (cm)">
          <input
            className="input num"
            inputMode="decimal"
            value={p.heightCm ?? ''}
            onChange={(e) => setP({ ...p, heightCm: n(e.target.value) })}
          />
        </Field>
      </div>
      <Field label="Time zone">
        <input
          className="input"
          value={p.timezone}
          onChange={(e) => setP({ ...p, timezone: e.target.value })}
        />
      </Field>
      <button
        className="link small"
        style={{ alignSelf: 'flex-start' }}
        onClick={() => setP({ ...p, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })}
      >
        Use this phone's time zone
      </button>
      <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={save}>
        Save profile
      </button>
      <ErrorText error={error} />
    </Section>
  );
}

function AccountSection() {
  const { addPasskey, logout } = useAuth();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <Section title="Account">
      <button
        className="btn small"
        style={{ alignSelf: 'flex-start' }}
        onClick={() =>
          addPasskey().then(
            () => setMsg('Passkey added.'),
            (err) => setMsg(errorMessage(err)),
          )
        }
      >
        Add another passkey
      </button>
      <div className="row" style={{ justifyContent: 'flex-start' }}>
        <a className="btn small" href="/api/export" download>
          Export JSON
        </a>
        <a className="btn small" href="/api/export/sessions.csv" download>
          Sessions CSV
        </a>
      </div>
      <button
        className="btn small danger"
        style={{ alignSelf: 'flex-start' }}
        onClick={() => void logout()}
      >
        Sign out
      </button>
      {msg && <p className="small muted">{msg}</p>}
    </Section>
  );
}

export function Settings() {
  const { data, error, reload, setData } = useLoad(() =>
    api.get<{ profile: User; settings: SettingsT }>('/settings'),
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  if (!data) return error ? <ErrorText error={error} /> : <Loading />;

  const save = async (patch: Partial<SettingsT>) => {
    setSaveError(null);
    setData({ ...data, settings: { ...data.settings, ...patch } });
    try {
      await api.put('/settings', { settings: patch });
    } catch (err) {
      setSaveError(errorMessage(err));
      void reload();
    }
  };

  return (
    <section className="stack">
      <h1>Settings</h1>
      <ErrorText error={saveError} />
      <NotificationsSection settings={data.settings} save={save} />
      <Section title="Schedule">
        {TIMES.map((t) => (
          <div key={t.key} className="row">
            <span className="small">{t.label}</span>
            <input
              className="input num"
              style={{ width: 110 }}
              type="time"
              aria-label={t.label}
              value={data.settings[t.key] as string}
              onChange={(e) => e.target.value && void save({ [t.key]: e.target.value })}
            />
          </div>
        ))}
      </Section>
      <GoalsSection />
      <BodySection />
      <PauseSection />
      <Section title="Snooze alarm hook">
        <SnoozeShortcutGuide />
      </Section>
      <ProfileSection profile={data.profile} onSaved={reload} />
      <AccountSection />
    </section>
  );
}
