import type { SessionReport } from '../api/types';
import { formatShortDate, kg, pct, signedDays } from '../lib/format';

export function Report({ report }: { report: SessionReport }) {
  const { intensity: i, prs, milestone, projection } = report;
  return (
    <div className="card stack">
      <div className="row">
        <div>
          <div className="label">Intensity</div>
          <div className="hero">{i.score}</div>
        </div>
        <div className="num small muted" style={{ textAlign: 'right' }}>
          completion {Math.round(i.completion)}/50
          <br />
          volume {Math.round(i.volume)}/30
          <br />
          progression {Math.round(i.progression)}/20
        </div>
      </div>
      {prs.length > 0 && (
        <div>
          <div className="label">Personal records</div>
          {prs.map((p) => (
            <div key={p.exerciseId} className="row small">
              <span>{p.name}</span>
              <span className="num good">
                {kg(p.previous)} → {kg(p.value)}
              </span>
            </div>
          ))}
        </div>
      )}
      {milestone && (
        <div>
          <div className="label">
            {milestone.name} · {milestone.daysLeft}d left
            {milestone.baselineWeek && ' · baseline week'}
          </div>
          {milestone.lifts.map((l) => (
            <div key={l.name} className="row small">
              <span>{l.name}</span>
              <span
                className={`num ${milestone.baselineWeek ? 'muted' : l.onTrack ? 'good' : 'bad'}`}
              >
                {pct(l.before)} → {pct(l.after)}
              </span>
            </div>
          ))}
        </div>
      )}
      {projection && (
        <p className="num small" style={{ margin: 0 }}>
          {projection.primaryName} target: {formatShortDate(projection.onPlan)} (
          {signedDays(projection.daysVsTarget)} days vs plan)
        </p>
      )}
    </div>
  );
}
