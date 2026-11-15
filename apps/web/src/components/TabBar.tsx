import { NavLink } from 'react-router';

const TABS = [
  { to: '/today', label: 'Today' },
  { to: '/progress', label: 'Progress' },
  { to: '/stacks', label: 'Stacks' },
  { to: '/settings', label: 'Settings' },
] as const;

export function TabBar() {
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          className={({ isActive }) => (isActive ? 'tab active' : 'tab')}
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
