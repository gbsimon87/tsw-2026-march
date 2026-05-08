import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../app/store/AuthContext';

const desktopNavLinkClass = ({ isActive }) =>
  `text-sm transition-colors ${
    isActive ? 'font-semibold text-slate-900' : 'text-slate-600 hover:text-slate-900'
  }`;

const mobileNavLinkClass = ({ isActive }) =>
  `text-base transition-colors ${
    isActive ? 'font-semibold text-slate-900' : 'text-slate-600 hover:text-slate-900'
  }`;

export function AppLayout() {
  const { user, logout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const homeHref = user ? '/home' : '/';
  const brandHref = user ? '/feed' : '/';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-4 p-4">
          <Link to={brandHref} className="text-lg font-semibold">
            {import.meta.env.VITE_APP_NAME}
          </Link>

          <nav className="ml-auto hidden items-center gap-4 md:flex">
            <NavLink to="/feed" className={desktopNavLinkClass}>
              The Pulse
            </NavLink>
            {user ? (
              <NavLink to="/my-sporty" className={desktopNavLinkClass}>
                My Sporty
              </NavLink>
            ) : null}
            <NavLink to={homeHref} end className={desktopNavLinkClass}>
              Discover
            </NavLink>
            {user ? (
              <NavLink to="/admin" className={desktopNavLinkClass}>
                Admin
              </NavLink>
            ) : null}
            <NavLink to="/about" className={desktopNavLinkClass}>
              About
            </NavLink>
            {!user ? (
              <NavLink to="/login" className={desktopNavLinkClass}>
                Sign in
              </NavLink>
            ) : (
              <button type="button" className="rounded py-1 text-sm text-dark" onClick={logout}>
                Logout
              </button>
            )}
          </nav>

          <button
            type="button"
            className="ml-auto inline-flex items-center justify-center rounded border border-slate-300 p-2 text-slate-700 md:hidden"
            aria-label="Toggle navigation menu"
            aria-expanded={isMobileMenuOpen}
            onClick={() => setIsMobileMenuOpen((previousValue) => !previousValue)}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              {isMobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </header>

      <div className="md:hidden">
        <button
          type="button"
          aria-label="Close navigation menu"
          className={`fixed inset-0 z-40 bg-slate-900/40 transition-opacity duration-300 ${
            isMobileMenuOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          onClick={() => setIsMobileMenuOpen(false)}
        />

        <nav
          className={`fixed inset-y-0 right-0 z-50 w-4/5 max-w-sm bg-white p-6 shadow-xl transition-transform duration-300 ${
            isMobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
          aria-hidden={!isMobileMenuOpen}
          inert={!isMobileMenuOpen ? '' : undefined}
        >
          <div className="mb-6 flex justify-end">
            <button
              type="button"
              className="rounded border border-slate-300 p-2 text-slate-700"
              aria-label="Close navigation menu"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex flex-col gap-4">
            <NavLink
              to="/feed"
              className={mobileNavLinkClass}
              onClick={() => setIsMobileMenuOpen(false)}
            >
              The Pulse
            </NavLink>
            {user ? (
              <NavLink
                to="/my-sporty"
                className={mobileNavLinkClass}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                My Sporty
              </NavLink>
            ) : null}
            <NavLink
              to={homeHref}
              end
              className={mobileNavLinkClass}
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Discover
            </NavLink>
            {user ? (
              <NavLink
                to="/admin"
                className={mobileNavLinkClass}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Admin
              </NavLink>
            ) : null}
            <NavLink
              to="/about"
              className={mobileNavLinkClass}
              onClick={() => setIsMobileMenuOpen(false)}
            >
              About
            </NavLink>
            {!user ? (
              <NavLink
                to="/login"
                className={mobileNavLinkClass}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Sign in
              </NavLink>
            ) : (
              <button
                type="button"
                className="w-fit rounded py-1 text-sm text-dark"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  logout();
                }}
              >
                Logout
              </button>
            )}
          </div>
        </nav>
      </div>

      <main className="mx-auto max-w-5xl p-4">
        <Outlet />
      </main>
    </div>
  );
}
