import { Link } from 'react-router-dom';
import { useAuth } from '../app/store/AuthContext';

export function HomePage() {
  const { user } = useAuth();

  return (
    <main className="space-y-16">
      <section className="rounded-3xl bg-gradient-to-r from-amber-50 via-white to-sky-50 p-8 md:p-12">
        <p className="text-sm font-semibold uppercase tracking-wide text-sky-700">TSW Basketball</p>
        <h1 className="mt-3 max-w-3xl text-3xl font-bold leading-tight text-slate-900 md:text-5xl">
          Turn every game into progress your team can see and feel.
        </h1>
        <p className="mt-4 max-w-2xl text-base text-slate-700 md:text-lg">
          TSW helps teams capture game stats quickly, understand what is working, and stay connected
          to growth all season long.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {user ? (
            <Link
              to="/dashboard"
              className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Go to Dashboard
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                Login
              </Link>
              <Link
                to="/register"
                className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
              >
                Register
              </Link>
            </>
          )}
        </div>
      </section>

      <section
        aria-labelledby="players-heading"
        className="grid items-center gap-8 rounded-2xl border border-slate-200 p-6 md:grid-cols-2 md:p-8"
      >
        <div
          aria-hidden="true"
          className="flex h-56 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-100 text-sm font-medium text-slate-500 md:h-72"
        >
          Player progress image
        </div>
        <div>
          <h2 id="players-heading" className="text-2xl font-semibold text-slate-900">
            For Players: Know your game and keep improving
          </h2>
          <p className="mt-3 text-slate-700">
            Track your performance across games, spot strengths and weaknesses faster, and build
            confidence with clear evidence of your development over time.
          </p>
        </div>
      </section>

      <section
        aria-labelledby="managers-heading"
        className="grid items-center gap-8 rounded-2xl border border-slate-200 p-6 md:grid-cols-2 md:p-8"
      >
        <div className="order-2 md:order-1">
          <h2 id="managers-heading" className="text-2xl font-semibold text-slate-900">
            For Managers and Coaches: See what matters quickly
          </h2>
          <p className="mt-3 text-slate-700">
            Understand team and player performance at a glance, review meaningful insights without
            extra noise, and make better game-time and training decisions with clearer data.
          </p>
        </div>
        <div
          aria-hidden="true"
          className="order-1 flex h-56 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-100 text-sm font-medium text-slate-500 md:order-2 md:h-72"
        >
          Team insights image
        </div>
      </section>

      <section
        aria-labelledby="family-heading"
        className="grid items-center gap-8 rounded-2xl border border-slate-200 p-6 md:grid-cols-2 md:p-8"
      >
        <div
          aria-hidden="true"
          className="flex h-56 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-100 text-sm font-medium text-slate-500 md:h-72"
        >
          Community highlights image
        </div>
        <div>
          <h2 id="family-heading" className="text-2xl font-semibold text-slate-900">
            For Friends and Family: Stay close to every milestone
          </h2>
          <p className="mt-3 text-slate-700">
            Follow games, keep up with player progress, and celebrate key achievements as the team
            grows together throughout the season.
          </p>
        </div>
      </section>
    </main>
  );
}
