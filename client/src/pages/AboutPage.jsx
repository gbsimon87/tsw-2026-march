import { Link } from 'react-router-dom';
import CloudinaryImage from '../features/media/CloudinaryImage';
import basketballImage1 from '../assets/home/basketball_image_1.png';
import basketballImage2 from '../assets/home/basketball_image_2.png';
import basketballImage3 from '../assets/home/basketball_image_3.png';

const audienceSections = [
  {
    id: 'players',
    headingId: 'players-heading',
    tag: 'Players',
    title: 'Know your game. Keep improving.',
    body: 'Track your performance across games, spot strengths and weaknesses faster, and build confidence with clear evidence of your development over time.',
    imageSrc: basketballImage1,
    imageAlt: 'Players reviewing basketball progress and development',
  },
  {
    id: 'managers',
    headingId: 'managers-heading',
    tag: 'Coaches',
    title: 'See what matters, fast.',
    body: 'Understand team and player performance at a glance, review meaningful insights without extra noise, and make better game-time and training decisions with clearer data.',
    imageSrc: basketballImage2,
    imageAlt: 'Coaches and managers using basketball performance insights',
  },
  {
    id: 'family',
    headingId: 'family-heading',
    tag: 'Family',
    title: 'Stay close to every milestone.',
    body: 'Follow games, keep up with player progress, and celebrate key achievements as the team grows together throughout the season.',
    imageSrc: basketballImage3,
    imageAlt: 'Friends and family following basketball team highlights',
  },
];

const proofBoxScore = {
  matchup: 'Riverside 76 – Eastview 71',
  status: 'Final',
  rows: [
    { name: 'J. Carter', pts: 24, ast: 6, reb: 8, stl: 2, blk: 1, tov: 3 },
    { name: 'M. Reyes', pts: 18, ast: 4, reb: 5, stl: 1, blk: 0, tov: 2 },
    { name: 'A. Whitfield', pts: 14, ast: 9, reb: 3, stl: 3, blk: 0, tov: 4 },
    { name: 'D. Osei', pts: 11, ast: 2, reb: 10, stl: 0, blk: 2, tov: 1 },
  ],
};

function BoxScoreProof() {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0d0d0d] p-4 md:p-5">
      <div className="flex items-baseline justify-between gap-3 border-b border-white/10 pb-3">
        <span
          className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#F4A300]"
          style={{ fontFamily: "'IBM Plex Mono', monospace" }}
        >
          {proofBoxScore.status}
        </span>
        <span className="truncate text-sm text-white/70">{proofBoxScore.matchup}</span>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table
          className="w-full min-w-[420px] text-left text-xs text-white/80"
          style={{ fontFamily: "'IBM Plex Mono', monospace" }}
        >
          <thead>
            <tr className="text-white/40">
              <th scope="col" className="py-1.5 pr-3 font-medium">
                Player
              </th>
              {['PTS', 'AST', 'REB', 'STL', 'BLK', 'TOV'].map((label) => (
                <th key={label} scope="col" className="py-1.5 pr-3 text-right font-medium">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {proofBoxScore.rows.map((row, index) => (
              <tr
                key={row.name}
                className="motion-safe:animate-row-in border-t border-white/5"
                style={{ animationDelay: `${index * 90}ms` }}
              >
                <td className="py-1.5 pr-3 text-white">{row.name}</td>
                <td className="py-1.5 pr-3 text-right text-[#F4A300]">{row.pts}</td>
                <td className="py-1.5 pr-3 text-right">{row.ast}</td>
                <td className="py-1.5 pr-3 text-right">{row.reb}</td>
                <td className="py-1.5 pr-3 text-right">{row.stl}</td>
                <td className="py-1.5 pr-3 text-right">{row.blk}</td>
                <td className="py-1.5 pr-3 text-right">{row.tov}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-white/40">
        Every game, you get a credible box score, highlights, and insights. Yes, every single game.
      </p>
    </div>
  );
}

export function AboutPage() {
  const appName = import.meta.env.VITE_APP_NAME;

  return (
    <main className="space-y-6 bg-[#F7F5F0] -m-4 p-4 md:-m-6 md:p-6">
      {/* Hero: manifesto + proof */}
      <section className="relative overflow-hidden rounded-2xl bg-[#141414] p-5 md:p-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg, #fff 0, #fff 1px, transparent 1px, transparent 64px)',
          }}
        />
        <div className="relative grid grid-cols-1 gap-8 md:grid-cols-[1.1fr_1fr] md:items-center">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#F4A300]">
              About {appName}
            </p>
            <h1
              className="mt-2 text-4xl leading-[1.05] text-white md:text-5xl"
              style={{ fontFamily: "'Archivo Black', sans-serif" }}
            >
              Built for the people running actual games.
            </h1>
            <p className="mt-4 max-w-xl text-sm text-white/60 md:text-base">
              Basketball stat tracking for coaches and team managers who need a credible box score
              the moment the final buzzer sounds.
            </p>
          </div>
          <div className="min-w-0">
            <BoxScoreProof />
          </div>
        </div>
      </section>

      {/* Pitch */}
      <section className="rounded-2xl bg-white border border-slate-200 p-6 md:p-8">
        <header className="border-b border-slate-100 pb-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1B4332]">
            The problem
          </p>
          <h2
            className="mt-1 text-3xl text-slate-900 md:text-4xl"
            style={{ fontFamily: "'Archivo Black', sans-serif" }}
          >
            For the people running the game
          </h2>
        </header>
        <div className="mt-4 space-y-4 text-slate-700 md:text-base">
          <p>
            Most amateur basketball stats live in a notebook someone left at home, a spreadsheet
            updated at midnight, or a player&apos;s memory. Getting a usable box score after a game
            usually means hours of cleanup, if it happens at all.
          </p>
          <blockquote
            className="border-l-4 border-[#F4A300] pl-4 text-2xl leading-snug text-slate-900 md:text-3xl"
            style={{ fontFamily: "'Archivo Black', sans-serif" }}
          >
            No spreadsheets. No manual entry after the fact.
          </blockquote>
          <p>
            {appName} is built for coaches and team managers who want to capture what&apos;s
            happening during a real game and have something credible to show for it the moment the
            final buzzer sounds.
          </p>
        </div>
      </section>

      {/* What you walk away with */}
      <section className="rounded-2xl bg-[#1B4332] p-6 md:p-8">
        <header className="border-b border-white/10 pb-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#F4A300]">
            The output
          </p>
          <h2
            className="mt-1 text-3xl text-white md:text-4xl"
            style={{ fontFamily: "'Archivo Black', sans-serif" }}
          >
            What you walk away with
          </h2>
        </header>
        <div className="mt-4 space-y-4 text-white/80 md:text-base">
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

      {/* Who it's for */}
      <section className="rounded-2xl bg-white border border-slate-200 p-6 md:p-8">
        <header className="border-b border-slate-100 pb-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1B4332]">
            On the roster
          </p>
          <h2
            className="mt-1 text-3xl text-slate-900 md:text-4xl"
            style={{ fontFamily: "'Archivo Black', sans-serif" }}
          >
            Who it&apos;s for
          </h2>
        </header>
        <p className="mt-4 max-w-2xl text-slate-600">
          Amateur and youth basketball programs — the teams that play real games but don&apos;t have
          a dedicated stats crew. Everyone connected to the team gets something out of it.
        </p>

        <div className="mt-6 space-y-6">
          {audienceSections.map((section, sectionIndex) => (
            <div
              key={section.id}
              className={`grid items-center gap-5 md:grid-cols-2 md:gap-8 ${
                sectionIndex > 0 ? 'border-t border-slate-100 pt-6' : ''
              }`}
            >
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {section.tag}
                </p>
                <h3
                  id={section.headingId}
                  className="mt-1.5 text-lg text-slate-900 md:text-xl"
                  style={{ fontFamily: "'Archivo Black', sans-serif" }}
                >
                  {section.title}
                </h3>
                <p className="mt-2 text-sm text-slate-700">{section.body}</p>
              </div>
              <div className="h-48 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 md:h-56">
                <CloudinaryImage
                  src={section.imageSrc}
                  alt={section.imageAlt}
                  width={600}
                  height={288}
                  className="h-full w-full object-cover"
                  loading={sectionIndex === 0 ? 'eager' : 'lazy'}
                  decoding="async"
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Contact */}
      <section className="rounded-2xl bg-white border border-slate-200 p-6 md:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2
              className="text-2xl text-slate-900"
              style={{ fontFamily: "'Archivo Black', sans-serif" }}
            >
              Want to talk?
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              We&apos;re a company based in the United Kingdom. If you&apos;re interested in using{' '}
              {appName} for your league or team, contact us and we&apos;ll follow up directly.
            </p>
          </div>
          <Link
            to="/contact"
            className="inline-flex shrink-0 items-center justify-center rounded-xl bg-[#141414] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1B4332]"
          >
            Contact us
          </Link>
        </div>
      </section>
    </main>
  );
}
