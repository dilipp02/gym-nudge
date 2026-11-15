import { Navigate, Route, Routes } from 'react-router';
import { TabBar } from './components/TabBar';

function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <section className="screen">
      <h1>{title}</h1>
      <p className="muted">{note}</p>
    </section>
  );
}

export function App() {
  return (
    <div className="app">
      <main className="content">
        <Routes>
          <Route path="/" element={<Navigate to="/today" replace />} />
          <Route
            path="/today"
            element={<Placeholder title="Today" note="Check-in, log, report (plan 4.5–4.6)." />}
          />
          <Route
            path="/progress"
            element={<Placeholder title="Progress" note="Goal-first dashboard (plan 4.8)." />}
          />
          <Route
            path="/stacks"
            element={<Placeholder title="Stacks" note="Stack and exercise editor (plan 4.7)." />}
          />
          <Route
            path="/settings"
            element={<Placeholder title="Settings" note="Profile, goals, schedule (plan 4.9)." />}
          />
          <Route path="*" element={<Navigate to="/today" replace />} />
        </Routes>
      </main>
      <TabBar />
    </div>
  );
}
