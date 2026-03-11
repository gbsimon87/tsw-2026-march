import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../app/store/AuthContext';

export function AppLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between p-4">
          <Link to="/" className="text-lg font-semibold">
            {import.meta.env.VITE_APP_NAME || 'tsw-2026-march'}
          </Link>

          <nav className="flex items-center gap-4 text-sm">
            <Link to="/">Home</Link>
            <Link to="/dashboard">Dashboard</Link>
            {!user ? (
              <>
                <Link to="/login">Login</Link>
                <Link to="/register">Register</Link>
              </>
            ) : (
              <button
                type="button"
                className="rounded bg-slate-800 px-3 py-1 text-white"
                onClick={logout}
              >
                Logout
              </button>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-4">
        <Outlet />
      </main>
    </div>
  );
}
