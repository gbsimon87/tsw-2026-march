import { NavLink } from 'react-router-dom';
import { useAuth } from '../../../app/store/AuthContext';

function PulseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h3l3-8 4 16 3-9 2 1h3" />
    </svg>
  );
}

function DiscoverIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <circle cx="11" cy="11" r="8" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35" />
    </svg>
  );
}

function MySportyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <circle cx="12" cy="8" r="4" />
      <path strokeLinecap="round" d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}

function AdminIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

const activeCls = 'text-white';
const inactiveCls = 'text-white/40';

function Tab({ to, label, icon, end = false }) {
  return (
    <NavLink
      to={to}
      end={end}
      aria-label={label}
      className={({ isActive }) =>
        `flex flex-1 flex-col items-center justify-center gap-1 py-2 transition-colors ${isActive ? activeCls : inactiveCls}`
      }
    >
      {icon}
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em]">{label}</span>
    </NavLink>
  );
}

export function FeedTabBar() {
  const { user } = useAuth();

  return (
    <nav
      aria-label="Main navigation"
      className="md:hidden fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch border-t border-white/10 bg-black/80 backdrop-blur-md"
    >
      <Tab to="/pulse" label="Pulse" icon={<PulseIcon />} end />
      <Tab to="/home" label="Discover" icon={<DiscoverIcon />} end />
      {user ? <Tab to="/my-sporty" label="My Sporty" icon={<MySportyIcon />} /> : null}
      {user ? <Tab to="/admin" label="Admin" icon={<AdminIcon />} /> : null}
    </nav>
  );
}
