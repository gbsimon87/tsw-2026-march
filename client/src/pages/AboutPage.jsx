import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';

export function AboutPage() {
  const appName = import.meta.env.VITE_APP_NAME;

  return (
    <main className="space-y-8">
      <PageHeader
        eyebrow="About"
        title={appName}
        description="Basketball stat tracking built for the people running actual games."
      />

      <section className="rounded-2xl border border-slate-200 bg-white p-5 md:p-8">
        <h2 className="text-xl font-semibold text-slate-900">For the people running the game</h2>
        <div className="mt-4 space-y-4 text-slate-700 md:text-base">
          <p>
            Most amateur basketball stats live in a notebook someone left at home, a spreadsheet
            updated at midnight, or a player&apos;s memory. Getting a usable box score after a game
            usually means hours of cleanup, if it happens at all.
          </p>
          <p>
            {appName} is built for coaches and team managers who want to capture what&apos;s
            happening during a real game and have something credible to show for it the moment the
            final buzzer sounds. No spreadsheets. No manual entry after the fact.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 md:p-8">
        <h2 className="text-xl font-semibold text-slate-900">What you walk away with</h2>
        <div className="mt-4 space-y-4 text-slate-700 md:text-base">
          <p>
            The work happens during the game. You record events as they happen on a full-court
            interface, and the outputs are ready the moment you finish. A complete box score. A game
            recap. A record of every shot, assist, and turnover that actually happened.
          </p>
          <p>
            Player and team pages are public-facing by design. Players can see their own stats.
            Families can follow along. Clubs can point to something real instead of sending a text
            with a final score.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 md:p-8">
        <h2 className="text-xl font-semibold text-slate-900">Who it&apos;s for</h2>
        <p className="mt-2 text-slate-600">
          Amateur and youth basketball programs — the teams that play real games but don&apos;t have
          a dedicated stats crew. Everyone connected to the team gets something out of it.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
            <p className="font-semibold text-slate-900">Players</p>
            <p className="mt-2 text-sm text-slate-600">
              Track your performance across games, spot strengths and weaknesses faster, and build
              confidence with clear evidence of your development over time.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
            <p className="font-semibold text-slate-900">Managers and Coaches</p>
            <p className="mt-2 text-sm text-slate-600">
              Understand team and player performance at a glance, review meaningful insights without
              extra noise, and make better game-time and training decisions with clearer data.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
            <p className="font-semibold text-slate-900">Friends and Family</p>
            <p className="mt-2 text-sm text-slate-600">
              Follow games, keep up with player progress, and celebrate key achievements as the team
              grows together throughout the season.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 md:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Want to talk?</h2>
            <p className="mt-2 text-sm text-slate-600">
              We&apos;re a company based in the United Kingdom. If you&apos;re interested in using{' '}
              {appName} for your league or team, contact us and we&apos;ll follow up directly.
            </p>
          </div>
          <Link
            to="/contact"
            className="inline-flex shrink-0 items-center justify-center rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            Contact us
          </Link>
        </div>
      </section>
    </main>
  );
}
