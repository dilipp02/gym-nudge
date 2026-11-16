// After-workout log: one tap when it went to plan, tap an exercise to fix differences.
import { useMemo, useState } from 'react';
import { errorMessage } from '../api/client';
import type { PlannedExercise, SessionReport } from '../api/types';
import { ErrorText, Stepper, Toggle } from '../components/ui';
import { outbox } from '../offline/outbox';
import { initLog, isEdited, summary, toPayload, type EditExercise, type EditSet } from './log';

type Saved = { status: 'sent'; report: SessionReport } | { status: 'queued' };

function SetEditor({
  ex,
  index,
  onChange,
}: {
  ex: EditExercise;
  index: number;
  onChange: (s: EditSet) => void;
}) {
  const s = ex.sets[index]!;
  const two = ex.type === 'weighted';
  return (
    <div className={two ? 'set-row' : 'set-row single'}>
      <span className="muted small num">Set {index + 1}</span>
      {ex.type === 'timed' ? (
        <Stepper
          label="seconds"
          value={s.seconds}
          step={5}
          onChange={(v) => onChange({ ...s, seconds: v })}
        />
      ) : (
        <>
          {two && (
            <Stepper
              label="kg"
              value={s.weight}
              step={2.5}
              onChange={(v) => onChange({ ...s, weight: v })}
            />
          )}
          <Stepper
            label="reps"
            value={s.reps}
            step={1}
            onChange={(v) => onChange({ ...s, reps: v })}
          />
        </>
      )}
    </div>
  );
}

export function LogForm({
  plan,
  date,
  stackId,
  onSaved,
}: {
  plan: PlannedExercise[];
  date: string;
  stackId: string;
  onSaved: (s: Saved) => void;
}) {
  const [log, setLog] = useState(() => initLog(plan));
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One id per form, so a retry or offline replay updates the same session.
  const sessionId = useMemo(() => crypto.randomUUID(), []);
  const edited = log.some(isEdited);

  const update = (i: number, fn: (e: EditExercise) => EditExercise) =>
    setLog((prev) => prev.map((e, j) => (j === i ? fn(e) : e)));

  const save = async (exercises: EditExercise[]) => {
    setBusy(true);
    setError(null);
    try {
      const payload = toPayload(sessionId, date, stackId, exercises, new Date());
      const res = await outbox().send<{ report: SessionReport }>(
        'POST',
        '/sessions',
        payload,
        'Session',
      );
      onSaved(
        res.status === 'sent' ? { status: 'sent', report: res.data.report } : { status: 'queued' },
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card stack">
      <div className="row">
        <h2 style={{ margin: 0 }}>Log</h2>
        <span className="muted small">after the workout</span>
      </div>
      {!edited && (
        <button className="btn primary block" disabled={busy} onClick={() => save(initLog(plan))}>
          ✓ Done as planned
        </button>
      )}
      <p className="muted small" style={{ margin: 0 }}>
        {edited ? 'Changes are marked. Save when ready.' : 'Or tap an exercise to change it.'}
      </p>
      <div className="list">
        {log.map((ex, i) => (
          <div key={ex.exerciseId}>
            <div
              className="list-item clickable"
              role="button"
              tabIndex={0}
              aria-expanded={open === ex.exerciseId}
              onClick={() => setOpen(open === ex.exerciseId ? null : ex.exerciseId)}
              onKeyDown={(e) =>
                e.key === 'Enter' && setOpen(open === ex.exerciseId ? null : ex.exerciseId)
              }
            >
              <span className={ex.skipped ? 'bad' : undefined}>
                {ex.isKeyLift ? '★ ' : ''}
                {ex.name}
              </span>
              <span className="num small summary">
                {isEdited(ex) && !ex.skipped && <span className="warn">edited · </span>}
                <span className={ex.skipped ? 'bad' : 'muted'}>{summary(ex)}</span>
                {ex.progressed && !isEdited(ex) && ex.type === 'weighted' && (
                  <span className="good"> ↑</span>
                )}
              </span>
            </div>
            {open === ex.exerciseId && (
              <div style={{ padding: '4px 0 12px' }}>
                <div className="row">
                  <span className="small">Skipped</span>
                  <Toggle
                    label={`Skip ${ex.name}`}
                    on={ex.skipped}
                    onChange={(v) => update(i, (e) => ({ ...e, skipped: v }))}
                  />
                </div>
                {!ex.skipped && (
                  <>
                    {ex.sets.map((_, si) => (
                      <SetEditor
                        key={si}
                        ex={ex}
                        index={si}
                        onChange={(s) =>
                          update(i, (e) => ({
                            ...e,
                            sets: e.sets.map((x, k) => (k === si ? s : x)),
                          }))
                        }
                      />
                    ))}
                    <div className="row" style={{ justifyContent: 'flex-start' }}>
                      <button
                        className="btn small"
                        onClick={() =>
                          update(i, (e) => ({
                            ...e,
                            sets: [...e.sets, { ...e.sets[e.sets.length - 1]! }],
                          }))
                        }
                        disabled={ex.sets.length === 0}
                      >
                        + Set
                      </button>
                      <button
                        className="btn small"
                        onClick={() => update(i, (e) => ({ ...e, sets: e.sets.slice(0, -1) }))}
                        disabled={ex.sets.length <= 1}
                      >
                        − Set
                      </button>
                      <button
                        className="link small"
                        onClick={() =>
                          update(i, (e) => ({
                            ...e,
                            sets: e.planned.map((s) => ({ ...s })),
                            skipped: false,
                          }))
                        }
                      >
                        Reset
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {edited && (
        <button className="btn primary block" disabled={busy} onClick={() => save(log)}>
          Save session
        </button>
      )}
      <ErrorText error={error} />
    </div>
  );
}
