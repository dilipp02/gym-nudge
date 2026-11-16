import { useEffect, useState, type ReactNode } from 'react';
import { outbox, type FailedWrite, type QueuedWrite } from '../offline/outbox';

export function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={on ? 'toggle on' : 'toggle'}
      onClick={() => onChange(!on)}
    />
  );
}

export function Stepper({
  value,
  step,
  min = 0,
  onChange,
  label,
}: {
  value: number | null;
  step: number;
  min?: number;
  onChange: (v: number | null) => void;
  label: string;
}) {
  const round = (n: number) => Math.round(n * 100) / 100;
  return (
    <div className="stepper">
      <button
        type="button"
        aria-label={`Less ${label}`}
        onClick={() => onChange(Math.max(min, round((value ?? 0) - step)))}
      >
        −
      </button>
      <input
        className="input num"
        inputMode="decimal"
        aria-label={label}
        value={value ?? ''}
        onChange={(e) => {
          const v = e.target.value.trim();
          const n = Number(v);
          onChange(v === '' || Number.isNaN(n) ? null : n);
        }}
      />
      <button
        type="button"
        aria-label={`More ${label}`}
        onClick={() => onChange(round((value ?? 0) + step))}
      >
        +
      </button>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export function ErrorText({ error }: { error: string | null }) {
  return error ? (
    <p className="bad small" role="alert">
      {error}
    </p>
  ) : null;
}

export function Loading() {
  return <p className="muted">Loading…</p>;
}

/** Shows writes waiting to sync and any the server rejected. */
export function OutboxBanner() {
  const [pending, setPending] = useState<QueuedWrite[]>([]);
  const [failed, setFailed] = useState<FailedWrite[]>([]);
  useEffect(() => {
    const box = outbox();
    const load = async () => {
      setPending(await box.pending());
      setFailed(await box.failed());
    };
    void load();
    return box.subscribe(() => void load());
  }, []);
  return (
    <>
      {pending.length > 0 && (
        <div className="banner warn">
          Saved on this phone, will sync when online: {pending.map((p) => p.label).join(', ')}.
        </div>
      )}
      {failed.map((f) => (
        <div key={f.key} className="banner bad row">
          <span>
            Not saved: {f.label} ({f.error}).
          </span>
          <button className="link" onClick={() => void outbox().dismissFailed(f.key)}>
            Dismiss
          </button>
        </div>
      ))}
    </>
  );
}
