// Stacks (spec §9.3): list with drag-to-reorder rotation, edit stack, exercise form.
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, errorMessage } from '../api/client';
import type { Exercise, ExerciseType, Stack } from '../api/types';
import { SortableList } from '../components/SortableList';
import { ErrorText, Field, Loading, Toggle } from '../components/ui';
import { useLoad } from '../lib/useLoad';

function useAction() {
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    }
  };
  return { error, run };
}

export function StacksList() {
  const {
    data: stacks,
    error: loadError,
    reload,
    setData,
  } = useLoad(() => api.get<Stack[]>('/stacks'));
  const { error, run } = useAction();
  const [menu, setMenu] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Stack | null>(null);
  const navigate = useNavigate();

  if (!stacks) return loadError ? <ErrorText error={loadError} /> : <Loading />;
  const lastNames = (s: Stack) =>
    s.isAddon
      ? `Added to: ${
          stacks
            .filter((x) => x.addonIds.includes(s.id))
            .map((x) => x.name)
            .join(', ') || 'none'
        }`
      : `${s.exercises.length} exercises`;

  const reorder = (items: Stack[]) => {
    setData(items);
    void run(() => api.patch('/stacks/order', { ids: items.map((s) => s.id) })).then((ok) => {
      if (!ok) void reload();
    });
  };

  return (
    <section className="stack">
      <h1>Stacks</h1>
      <p className="muted small" style={{ margin: 0 }}>
        Rotation order, top to bottom. Drag ⋮⋮ to reorder.
      </p>
      <SortableList
        items={stacks}
        onReorder={reorder}
        render={(s, handle) => (
          <div className="card" style={{ marginBottom: 8 }}>
            <div className="row">
              <div className="row" style={{ gap: 4, justifyContent: 'flex-start', minWidth: 0 }}>
                {handle}
                <Link to={`/stacks/${s.id}`} style={{ textDecoration: 'none', fontWeight: 600 }}>
                  {s.name}
                </Link>
                {s.isAddon && (
                  <span className="chip" style={{ padding: '2px 8px' }}>
                    add-on
                  </span>
                )}
              </div>
              <div className="row" style={{ gap: 8 }}>
                {!s.isAddon && (
                  <Toggle
                    label={`${s.name} in rotation`}
                    on={s.inRotation}
                    onChange={(v) =>
                      void run(() => api.patch(`/stacks/${s.id}`, { inRotation: v })).then(reload)
                    }
                  />
                )}
                <button
                  className="btn small"
                  aria-label={`${s.name} options`}
                  onClick={() => setMenu(menu === s.id ? null : s.id)}
                >
                  ⋯
                </button>
              </div>
            </div>
            <div className="muted small" style={{ marginLeft: 36 }}>
              {lastNames(s)}
            </div>
            {menu === s.id && (
              <div className="row" style={{ marginTop: 10, justifyContent: 'flex-start' }}>
                <button className="btn small" onClick={() => navigate(`/stacks/${s.id}`)}>
                  Edit
                </button>
                <button
                  className="btn small"
                  onClick={() =>
                    void run(() => api.post(`/stacks/${s.id}/duplicate`)).then(
                      () => (setMenu(null), reload()),
                    )
                  }
                >
                  Duplicate
                </button>
                <button className="btn small danger" onClick={() => setConfirmDelete(s)}>
                  Delete
                </button>
              </div>
            )}
          </div>
        )}
      />
      {confirmDelete && (
        <div className="card warn-border stack">
          <strong className="bad">Delete “{confirmDelete.name}”?</strong>
          <p className="small muted" style={{ margin: 0 }}>
            Past sessions stay in your history and progress. The stack leaves the rotation.
          </p>
          <div className="grid-2">
            <button className="btn" onClick={() => setConfirmDelete(null)}>
              Cancel
            </button>
            <button
              className="btn danger"
              onClick={() =>
                void run(() => api.del(`/stacks/${confirmDelete.id}`)).then(() => {
                  setConfirmDelete(null);
                  setMenu(null);
                  void reload();
                })
              }
            >
              Delete
            </button>
          </div>
        </div>
      )}
      <button
        className="btn block"
        onClick={() =>
          void run(async () => {
            const s = await api.post<Stack>('/stacks', { name: 'New stack' });
            navigate(`/stacks/${s.id}`);
          })
        }
      >
        + New stack
      </button>
      <ErrorText error={error} />
    </section>
  );
}

export function StackEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: stacks, reload, setData } = useLoad(() => api.get<Stack[]>('/stacks'));
  const { error, run } = useAction();
  const [name, setName] = useState<string | null>(null);
  const stack = stacks?.find((s) => s.id === id);
  if (!stacks) return <Loading />;
  if (!stack)
    return (
      <p className="muted">
        Stack not found. <Link to="/stacks">Back</Link>
      </p>
    );
  const addons = stacks.filter((s) => s.isAddon && s.id !== stack.id);

  const reorder = (items: Exercise[]) => {
    setData(stacks.map((s) => (s.id === stack.id ? { ...s, exercises: items } : s)));
    void run(() =>
      api.patch(`/stacks/${stack.id}/exercises/order`, { ids: items.map((e) => e.id) }),
    ).then((ok) => {
      if (!ok) void reload();
    });
  };

  return (
    <section className="stack">
      <div className="row">
        <Link to="/stacks" className="muted">
          ‹ Stacks
        </Link>
      </div>
      <Field label="Name">
        <input
          className="input"
          value={name ?? stack.name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name != null && name.trim() && name !== stack.name) {
              void run(() => api.patch(`/stacks/${stack.id}`, { name: name.trim() })).then(reload);
            }
          }}
        />
      </Field>
      <div className="row">
        <span className="small">Add-on stack (appended to others, never suggested alone)</span>
        <Toggle
          label="Add-on stack"
          on={stack.isAddon}
          onChange={(v) =>
            void run(() => api.patch(`/stacks/${stack.id}`, { isAddon: v, inRotation: !v })).then(
              reload,
            )
          }
        />
      </div>
      <div>
        <div className="label">Exercises · ★ = key lift for milestones</div>
        <SortableList
          items={stack.exercises}
          onReorder={reorder}
          render={(e, handle) => (
            <div className="list-item">
              <div className="row" style={{ gap: 4, justifyContent: 'flex-start' }}>
                {handle}
                <Link
                  to={`/stacks/${stack.id}/exercises/${e.id}`}
                  style={{ textDecoration: 'none' }}
                >
                  {e.isKeyLift ? '★ ' : ''}
                  {e.name}
                </Link>
              </div>
              <span className="num small muted">
                {e.sets} × {e.repMin === e.repMax ? e.repMin : `${e.repMin}–${e.repMax}`}
                {e.type === 'timed' ? 's' : ''}
              </span>
            </div>
          )}
        />
      </div>
      <button className="btn block" onClick={() => navigate(`/stacks/${stack.id}/exercises/new`)}>
        + Add exercise
      </button>
      {!stack.isAddon && addons.length > 0 && (
        <div className="card">
          <div className="label">Add-ons at the end</div>
          {addons.map((a) => (
            <div key={a.id} className="list-item">
              <span>{a.name}</span>
              <Toggle
                label={`Add ${a.name}`}
                on={stack.addonIds.includes(a.id)}
                onChange={(v) =>
                  void run(() =>
                    api.patch(`/stacks/${stack.id}`, {
                      addonIds: v
                        ? [...stack.addonIds, a.id]
                        : stack.addonIds.filter((x) => x !== a.id),
                    }),
                  ).then(reload)
                }
              />
            </div>
          ))}
        </div>
      )}
      <ErrorText error={error} />
    </section>
  );
}

const TYPES: Array<{ value: ExerciseType; label: string }> = [
  { value: 'weighted', label: 'Weighted' },
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'timed', label: 'Timed' },
];

export function ExerciseForm() {
  const { id: stackId, exId } = useParams();
  const navigate = useNavigate();
  const isNew = exId === 'new';
  const { data: stacks } = useLoad(() => api.get<Stack[]>('/stacks'));
  const existing = stacks?.find((s) => s.id === stackId)?.exercises.find((e) => e.id === exId);
  const [form, setForm] = useState<Partial<Exercise> | null>(null);
  const { error, run } = useAction();
  const [confirm, setConfirm] = useState(false);

  if (!stacks) return <Loading />;
  if (!isNew && !existing) return <p className="muted">Exercise not found.</p>;
  const f: Omit<Exercise, 'id' | 'stackId' | 'position'> = {
    name: '',
    type: 'weighted',
    sets: 3,
    repMin: 8,
    repMax: 10,
    weightStep: 2.5,
    startWeight: null,
    isKeyLift: false,
    ...existing,
    ...form,
  };
  const set = (patch: Partial<Exercise>) => setForm((prev) => ({ ...prev, ...patch }));
  const num = (v: string) => (v.trim() === '' ? null : Number(v));
  const back = () => navigate(`/stacks/${stackId}`);

  const save = () =>
    void run(async () => {
      const body = {
        name: f.name.trim(),
        type: f.type,
        sets: f.sets,
        repMin: f.repMin,
        repMax: f.repMax,
        weightStep: f.type === 'bodyweight' ? 0 : f.weightStep,
        startWeight: f.type === 'bodyweight' ? null : f.startWeight,
        isKeyLift: f.isKeyLift,
      };
      if (isNew) await api.post(`/stacks/${stackId}/exercises`, body);
      else await api.patch(`/stacks/${stackId}/exercises/${exId}`, body);
    }).then((ok) => ok && back());

  const unit = f.type === 'timed' ? 'seconds' : 'reps';
  return (
    <section className="stack">
      <button className="link" style={{ alignSelf: 'flex-start' }} onClick={back}>
        ‹ Back
      </button>
      <h1>{isNew ? 'Add exercise' : 'Edit exercise'}</h1>
      <Field label="Name">
        <input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} />
      </Field>
      <div className="field">
        <span className="label">Type</span>
        <div className="seg">
          {TYPES.map((t) => (
            <button
              key={t.value}
              className={f.type === t.value ? 'on' : ''}
              onClick={() => set({ type: t.value })}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid-2">
        <Field label="Sets">
          <input
            className="input num"
            inputMode="numeric"
            value={f.sets}
            onChange={(e) => set({ sets: Number(e.target.value) || 0 })}
          />
        </Field>
        <div />
        <Field label={`Min ${unit}`}>
          <input
            className="input num"
            inputMode="numeric"
            value={f.repMin}
            onChange={(e) => set({ repMin: Number(e.target.value) || 0 })}
          />
        </Field>
        <Field label={`Max ${unit}`}>
          <input
            className="input num"
            inputMode="numeric"
            value={f.repMax}
            onChange={(e) => set({ repMax: Number(e.target.value) || 0 })}
          />
        </Field>
      </div>
      {f.type !== 'bodyweight' && (
        <>
          <div className="field">
            <span className="label">
              {f.type === 'timed' ? 'Add per session (seconds)' : 'Weight step (kg)'}
            </span>
            <div className="seg">
              {(f.type === 'timed' ? [5, 10, 15] : [1, 2.5, 5]).map((v) => (
                <button
                  key={v}
                  className={f.weightStep === v ? 'on' : ''}
                  onClick={() => set({ weightStep: v })}
                >
                  +{v}
                </button>
              ))}
            </div>
            <input
              className="input num"
              inputMode="decimal"
              aria-label="Custom step"
              value={f.weightStep}
              onChange={(e) => set({ weightStep: Number(e.target.value) || 0 })}
            />
          </div>
          <Field
            label={
              f.type === 'timed'
                ? 'Starting seconds (first time only)'
                : 'Starting weight, kg (first time only)'
            }
          >
            <input
              className="input num"
              inputMode="decimal"
              value={f.startWeight ?? ''}
              onChange={(e) => set({ startWeight: num(e.target.value) })}
            />
          </Field>
        </>
      )}
      <div className="row">
        <span>★ Key lift (milestones)</span>
        <Toggle label="Key lift" on={f.isKeyLift} onChange={(v) => set({ isKeyLift: v })} />
      </div>
      <button className="btn primary block" disabled={!f.name.trim()} onClick={save}>
        Save
      </button>
      {!isNew &&
        (confirm ? (
          <div className="grid-2">
            <button className="btn" onClick={() => setConfirm(false)}>
              Cancel
            </button>
            <button
              className="btn danger"
              onClick={() =>
                void run(() => api.del(`/stacks/${stackId}/exercises/${exId}`)).then(
                  (ok) => ok && back(),
                )
              }
            >
              Delete exercise
            </button>
          </div>
        ) : (
          <button className="btn block danger" onClick={() => setConfirm(true)}>
            Delete exercise
          </button>
        ))}
      <ErrorText error={error} />
    </section>
  );
}
