import { useState } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { TabBar } from './components/TabBar';
import { Loading } from './components/ui';
import { useAuth } from './lib/auth';
import { Progress } from './screens/Progress';
import { Settings } from './screens/Settings';
import { Setup, setupDone } from './screens/Setup';
import { ExerciseForm, StackEdit, StacksList } from './screens/Stacks';
import { Today } from './screens/Today';

export function App() {
  const { user, loading } = useAuth();
  const [finished, setFinished] = useState(false);

  if (loading) {
    return (
      <main className="content no-tabs center-screen">
        <Loading />
      </main>
    );
  }
  if (!user || (!finished && !setupDone(user.id))) {
    return (
      <main className="content no-tabs">
        <Setup onDone={() => setFinished(true)} />
      </main>
    );
  }

  return (
    <div className="app">
      <main className="content">
        <Routes>
          <Route path="/" element={<Navigate to="/today" replace />} />
          <Route path="/today" element={<Today />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/stacks" element={<StacksList />} />
          <Route path="/stacks/:id" element={<StackEdit />} />
          <Route path="/stacks/:id/exercises/:exId" element={<ExerciseForm />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/today" replace />} />
        </Routes>
      </main>
      <TabBar />
    </div>
  );
}
