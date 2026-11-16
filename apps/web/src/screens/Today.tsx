// Today (spec §9.1): before check-in → log → report → tomorrow's commit.
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api, errorMessage } from '../api/client';
import type { SessionReport, TodayResponse } from '../api/types';
import { ErrorText, Loading, OutboxBanner } from '../components/ui';
import { pushState, type PushState } from '../lib/device';
import { clock, formatShortDate, weekdayName } from '../lib/format';
import { useLoad } from '../lib/useLoad';
import { outbox } from '../offline/outbox';
import { LogForm } from '../today/LogForm';
import { Report } from '../today/Report';

type Saved = { status: 'sent'; report: SessionReport } | { status: 'queued' };

function StackChips({
  stacks,
  value,
  suggested,
  onPick,
}: {
  stacks: TodayResponse['stacks'];
  value: string | null;
  suggested: string | null;
  onPick: (id: string) => void;
}) {
  return (
    <div className="chips" role="radiogroup" aria-label="Stack">
      {stacks.map((s) => (
        <button
          key={s.id}
          role="radio"
          aria-checked={s.id === value}
          className={s.id === value ? 'chip on' : 'chip'}
          onClick={() => onPick(s.id)}
        >
          {s.name}
          {s.id === suggested ? ' · suggested' : ''}
        </button>
      ))}
    </div>
  );
}

function CheckIn({ t, onChange }: { t: TodayResponse; onChange: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  if (t.checkedInAt) {
    return (
      <div className="card row">
        <span>Checked in</span>
        <span className="num good">{clock(t.checkedInAt)}</span>
      </div>
    );
  }
  if (queued)
    return (
      <div className="banner warn">Check-in saved on this phone; it will sync when online.</div>
    );
  const checkIn = async () => {
    setError(null);
    try {
      const res = await outbox().send(
        'POST',
        '/checkin',
        { at: new Date().toISOString() },
        'Check-in',
      );
      if (res.status === 'queued') setQueued(true);
      else onChange();
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <div className="card stack">
      <div className="row">
        <span>Check-in window</span>
        <span className="num">
          {t.window.start}–{t.window.end}
        </span>
      </div>
      <button className="btn primary block" onClick={checkIn}>
        I'm here
      </button>
      <ErrorText error={error} />
    </div>
  );
}

function RestCard({ t, onChange }: { t: TodayResponse; onChange: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const act = async (path: string, label: string) => {
    setError(null);
    try {
      await outbox().send('POST', path, {}, label);
      onChange();
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  if (t.restDeclared) {
    return (
      <div className="card stack">
        <div className="row">
          <span>Rest day</span>
          <span className="muted small">this week's one rest</span>
        </div>
        {t.walkLogged ? (
          <p className="good small" style={{ margin: 0 }}>
            Walk logged. Streak kept.
          </p>
        ) : (
          <button className="btn block" onClick={() => act(`/days/${t.date}/walk`, 'Walk')}>
            Log 20-min walk (keeps the streak)
          </button>
        )}
        <ErrorText error={error} />
      </div>
    );
  }
  return (
    <div className="row">
      <button
        className="btn small"
        disabled={!t.restAvailable}
        onClick={() => act(`/days/${t.date}/rest`, 'Rest day')}
      >
        Rest today
      </button>
      {!t.restAvailable && t.restUsedOn && (
        <span className="muted small">Rest used {weekdayName(t.restUsedOn)}</span>
      )}
    </div>
  );
}

function Tomorrow({ t }: { t: TodayResponse }) {
  const initial = t.tomorrow.committedStackId ?? t.tomorrow.suggestedStackId;
  const [pick, setPick] = useState<string | null>(initial);
  const [committed, setCommitted] = useState<string | null>(t.tomorrow.committedStackId);
  const [error, setError] = useState<string | null>(null);
  const commit = async () => {
    if (!pick) return;
    setError(null);
    try {
      await outbox().send('POST', '/commit', { stackId: pick }, 'Commit');
      setCommitted(pick);
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <div className="card stack">
      <h2 style={{ margin: 0 }}>Tomorrow</h2>
      <StackChips
        stacks={t.stacks}
        value={pick}
        suggested={t.tomorrow.suggestedStackId}
        onPick={setPick}
      />
      {committed && committed === pick ? (
        <p className="good small" style={{ margin: 0 }}>
          Committed. Check in by {t.window.end}.
        </p>
      ) : (
        <button className="btn block" onClick={commit} disabled={!pick}>
          Commit
        </button>
      )}
      <ErrorText error={error} />
    </div>
  );
}

export function Today() {
  const [stackId, setStackId] = useState<string | undefined>(undefined);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [logAnother, setLogAnother] = useState(false);
  const [push, setPush] = useState<PushState | null>(null);
  const {
    data: t,
    error,
    loading,
    reload,
  } = useLoad(
    () => api.get<TodayResponse>(`/today${stackId ? `?stackId=${stackId}` : ''}`),
    stackId ?? '',
  );

  useEffect(() => {
    void api.post('/open').catch(() => undefined);
    void pushState().then(setPush);
  }, []);

  if (!t) return loading ? <Loading /> : <ErrorText error={error} />;

  const doneToday = t.sessionsToday.length > 0 || saved?.status === 'queued';
  const stackName = t.stacks.find((s) => s.id === t.stackId)?.name ?? '';

  return (
    <section className="stack">
      <header>
        <div className="row">
          <h1>Today</h1>
          {t.nextMilestone && (
            <span className="num small muted">
              {t.nextMilestone.name}: {t.nextMilestone.daysLeft}d
            </span>
          )}
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          {weekdayName(t.date)} {formatShortDate(t.date)}
          {t.status !== 'pending' && ` · ${t.status}`}
        </p>
      </header>

      <OutboxBanner />
      {push === 'off' && (
        <div className="banner warn">
          Notifications are off. <Link to="/settings">Turn them on</Link>
        </div>
      )}
      {t.paused && (
        <div className="banner">
          Paused: no morning nudges, streak frozen. <Link to="/settings">End pause</Link>
        </div>
      )}

      {saved?.status === 'sent' && <Report report={saved.report} />}
      {saved?.status === 'queued' && (
        <div className="banner warn">
          Session saved on this phone. Your report appears once it syncs.
        </div>
      )}

      {doneToday && !logAnother ? (
        <>
          {!saved &&
            t.sessionsToday.map((s) => (
              <div key={s.id} className="card row">
                <span>{t.stacks.find((x) => x.id === s.stackId)?.name ?? 'Session'} logged</span>
                <span className="num">Intensity {s.intensity ?? '—'}</span>
              </div>
            ))}
          <button className="link small" onClick={() => setLogAnother(true)}>
            Log another session
          </button>
        </>
      ) : (
        <>
          <StackChips
            stacks={t.stacks}
            value={t.stackId}
            suggested={t.suggestedStackId}
            onPick={(id) => setStackId(id)}
          />
          {t.trainedYesterday && (
            <div className="banner warn">
              {stackName} again? You trained it yesterday; those muscles are still recovering.
            </div>
          )}
          <CheckIn t={t} onChange={reload} />
          {!t.checkedInAt && <RestCard t={t} onChange={reload} />}
          {t.stackId && (
            <LogForm
              key={`${t.stackId}-${t.date}`}
              plan={t.plan}
              date={t.date}
              stackId={t.stackId}
              onSaved={(s) => {
                setSaved(s);
                setLogAnother(false);
                if (s.status === 'sent') void reload();
              }}
            />
          )}
        </>
      )}

      <Tomorrow
        key={`${t.date}-${t.tomorrow.suggestedStackId}-${t.tomorrow.committedStackId}`}
        t={t}
      />
    </section>
  );
}
