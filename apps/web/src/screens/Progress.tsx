// Progress, goal first (spec §9.2).
import type { MilestoneProgress } from '@gym-nudge/core';
import { api } from '../api/client';
import type { ProgressResponse } from '../api/types';
import { ErrorText, Loading } from '../components/ui';
import { formatShortDate, kg, pct, signedDays } from '../lib/format';
import { useLoad } from '../lib/useLoad';

function MilestoneCard({ m, first }: { m: MilestoneProgress; first: boolean }) {
  const behind = m.lifts.filter((l) => !l.onTrack);
  return (
    <div className="card stack">
      <div className="row">
        <strong>
          {m.name} · {formatShortDate(m.date)}
        </strong>
        <span className="num muted small">{m.daysLeft}d left</span>
      </div>
      {first && (
        <p className="muted small num" style={{ margin: 0 }}>
          {m.baselineWeek
            ? 'Baseline week: your best lifts this week become the 0% starting point.'
            : `Time elapsed ${pct(m.elapsed)} · white line = where you should be`}
        </p>
      )}
      {m.lifts.map((l) => (
        <div
          key={l.exerciseId}
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 2fr 44px',
            gap: 8,
            alignItems: 'center',
          }}
        >
          <span
            className="small"
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {l.name}
          </span>
          <div
            className="bar"
            role="img"
            aria-label={`${l.name} ${pct(l.pct)} of the way, should be ${pct(m.elapsed)}`}
          >
            <i className={l.onTrack ? '' : 'behind'} style={{ width: pct(l.pct) }} />
            <b style={{ left: pct(m.elapsed) }} />
          </div>
          <span
            className={`num small ${l.onTrack ? 'good' : 'bad'}`}
            style={{ textAlign: 'right' }}
          >
            {pct(l.pct)}
          </span>
        </div>
      ))}
      <p
        className={`num small ${m.baselineWeek ? 'muted' : behind.length ? 'warn' : 'good'}`}
        style={{ margin: 0 }}
      >
        {m.onTrackCount} of {m.lifts.length} on track
        {behind.length > 0 && ` · behind: ${behind.map((b) => b.name).join(', ')}`}
      </p>
    </div>
  );
}

const LEGEND = [
  ['trained', 'var(--good)'],
  ['rescue', 'var(--rescue)'],
  ['rest', 'var(--rest)'],
  ['skip', 'var(--bad)'],
  ['pause', 'var(--pause)'],
] as const;

/** Calendar cells from the Monday of the first week you used the app (max 4 weeks), aligned Mon–Sun. */
function calendarCells(calendar: ProgressResponse['calendar']) {
  const first = calendar.findIndex((d) => d.status != null);
  if (first < 0) return [];
  const firstDate = calendar[first]!.date;
  const mondayOffset = (new Date(`${firstDate}T12:00:00Z`).getUTCDay() + 6) % 7;
  const pad = Array.from({ length: mondayOffset }, (_, i) => ({ date: `pad-${i}`, status: null }));
  const end = calendar[calendar.length - 1]!.date;
  const endPad = (7 - ((new Date(`${end}T12:00:00Z`).getUTCDay() + 6) % 7) - 1) % 7;
  return [
    ...pad,
    ...calendar.slice(first),
    ...Array.from({ length: endPad }, (_, i) => ({ date: `end-${i}`, status: null })),
  ];
}

export function Progress() {
  const { data: p, error, loading } = useLoad(() => api.get<ProgressResponse>('/progress'));
  if (!p) return loading ? <Loading /> : <ErrorText error={error} />;
  const proj = p.projection;
  const late = proj ? proj.daysVsTarget : 0;
  const skips = p.calendar.filter((d) => d.status === 'skip').length;

  return (
    <section className="stack">
      {proj && (
        <div>
          <div className="label">{proj.primaryName} target · projected</div>
          <div className="row">
            <span className="hero">{formatShortDate(proj.onPlan)}</span>
            <span className={`num ${late > 0.05 ? 'bad' : 'good'}`}>
              {signedDays(late)} days vs plan
            </span>
          </div>
          <p className="muted small num" style={{ margin: 0 }}>
            As of {formatShortDate(p.asOf)} · {proj.done} of {Math.round(proj.planned)} sessions ·{' '}
            {proj.paceRate == null
              ? 'no sessions in 28 days'
              : `pace ${proj.paceRate.toFixed(1)}/wk${proj.atPace ? ` → ${formatShortDate(proj.atPace)} at this pace` : ''}`}
          </p>
        </div>
      )}

      {p.milestones.map((m, i) => (
        <MilestoneCard key={m.goalId} m={m} first={i === 0} />
      ))}

      <div className="card stack">
        <div className="row">
          <strong>Consistency</strong>
          <span className="num small muted">
            Streak {p.streak.current} · best {p.streak.best}
          </span>
        </div>
        <div className="cal" aria-hidden="true">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <span
              key={i}
              className="none muted small"
              style={{ aspectRatio: 'auto', textAlign: 'center' }}
            >
              {d}
            </span>
          ))}
        </div>
        <div className="cal" aria-label="Recent days">
          {calendarCells(p.calendar).map((d) => (
            <span
              key={d.date}
              title={`${d.date}: ${d.status ?? 'before start'}`}
              className={[d.status ?? 'none', d.date === p.today ? 'today' : ''].join(' ')}
            />
          ))}
        </div>
        <div className="legend">
          {LEGEND.map(([name, color]) => (
            <span key={name}>
              <i style={{ background: color }} />
              {name}
            </span>
          ))}
        </div>
        <p className="num small muted" style={{ margin: 0 }}>
          Skips in last 28 days: {skips}
        </p>
      </div>

      <div className="card stack">
        <strong>Body</strong>
        <div className="row small">
          <span>Waist</span>
          <span className="num">
            {p.body.waist.latest == null ? (
              <span className="muted">not logged</span>
            ) : (
              <>
                {kg(p.body.waist.latest)} cm
                {p.body.waist.baseline != null && (
                  <span className={p.body.waist.latest <= p.body.waist.baseline ? 'good' : 'bad'}>
                    {' '}
                    {signedDays(p.body.waist.latest - p.body.waist.baseline)}
                  </span>
                )}
                {p.body.waist.targetNow != null && (
                  <span className="muted">
                    {' '}
                    (target path {kg(Math.round(p.body.waist.targetNow * 10) / 10)})
                  </span>
                )}
              </>
            )}
          </span>
        </div>
        <div className="row small">
          <span>Weight</span>
          <span className="num">
            {p.body.weight.latest == null ? (
              <span className="muted">not logged</span>
            ) : (
              `${kg(p.body.weight.latest)} kg`
            )}
            {p.body.target?.weightMin != null && (
              <span className="muted">
                {' '}
                (target {kg(p.body.target.weightMin)}–{kg(p.body.target.weightMax)})
              </span>
            )}
          </span>
        </div>
      </div>

      <div className="card stack">
        <strong>Stack frequency (last {p.frequencyWindowDays} days)</strong>
        {p.stackFrequency.map((s) => (
          <div key={s.stackId} className="row small">
            <span>{s.name}</span>
            <span className={`num ${s.perWeek < 1.5 ? 'warn' : ''}`}>
              {s.perWeek.toFixed(1)}×/wk (plan 2×)
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
