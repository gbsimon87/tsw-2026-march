import { Link } from 'react-router-dom';
import { DarkPageHeader } from '../components/DarkPageHeader';
import { env } from '../lib/env';

// Last substantive review of this policy's content. Update whenever the data
// collected, the purposes, or the processors below change — and bump
// CONSENT_VERSION in lib/consent.js at the same time so visitors are re-asked.
const LAST_UPDATED = '5 September 2026';

const processors = [
  {
    name: 'PostHog',
    purpose: 'Product analytics',
    location: 'European Union',
    detail: 'Pages viewed and a small number of actions, only with your consent.',
  },
  {
    name: 'MongoDB Atlas',
    purpose: 'Database hosting',
    location: 'European Union',
    detail: 'Stores your account, teams, games, and league records.',
  },
  {
    name: 'Cloudinary',
    purpose: 'Image and video hosting',
    location: 'European Union / United States',
    detail: 'Avatars, team logos, and media you upload to the feed.',
  },
  {
    name: 'Resend',
    purpose: 'Transactional email',
    location: 'European Union (Ireland)',
    detail:
      'Password resets, verification, and replies to contact messages. Email is processed in the EU; Resend is a US-based company.',
  },
  {
    name: 'Stripe',
    purpose: 'Payments',
    location: 'United States',
    detail: 'Subscription billing. Card details go to Stripe, never to us.',
  },
  {
    name: 'Render',
    purpose: 'Application hosting',
    location: 'European Union',
    detail: 'Runs the site and its API.',
  },
  {
    name: 'Meta (Instagram)',
    purpose: 'Social publishing',
    location: 'United States',
    detail: 'Only the image and caption of a post we choose to publish to our own account.',
  },
];

const cookies = [
  {
    name: 'accessToken / refreshToken',
    purpose: 'Keeps you signed in',
    lifetime: '15 minutes / 7 days',
    consent: 'Strictly necessary',
  },
  {
    name: 'XSRF-TOKEN / _csrfSecret',
    purpose: 'Protects against cross-site request forgery',
    lifetime: 'Session',
    consent: 'Strictly necessary',
  },
  {
    name: 'tsw_consent',
    purpose: 'Remembers your cookie choice',
    lifetime: '12 months',
    consent: 'Strictly necessary',
  },
  {
    name: 'ph_* (PostHog)',
    purpose: 'Distinguishes one visitor from another for analytics',
    lifetime: '12 months',
    consent: 'Only set if you accept',
  },
];

const sectionClass = 'rounded-2xl border border-slate-200 bg-white p-6 md:p-8';
const headingClass = 'text-xl text-slate-900';
const headingStyle = { fontFamily: "'Archivo Black', sans-serif" };
const bodyClass = 'mt-3 space-y-3 text-sm leading-relaxed text-slate-600';

export function PrivacyPage() {
  const appName = env.appName;

  return (
    <main className="space-y-6">
      <DarkPageHeader
        size="hero"
        titleAriaLabel="Privacy"
        eyebrow="Privacy"
        title="What we collect, and why."
        description={`How ${appName} handles your data, in plain terms. Last updated ${LAST_UPDATED}.`}
      />

      <section className={sectionClass} aria-labelledby="summary-heading">
        <h2 id="summary-heading" className={headingClass} style={headingStyle}>
          The short version
        </h2>
        <div className={bodyClass}>
          <p>
            We collect what we need to run your teams, leagues, and games — and, if you agree to it,
            a basic count of which pages people visit so we can improve the site.
          </p>
          <p>
            We do not record your screen, we do not capture what you type into forms, and we do not
            sell your data or use it for advertising.
          </p>
        </div>
      </section>

      <section className={sectionClass} aria-labelledby="collect-heading">
        <h2 id="collect-heading" className={headingClass} style={headingStyle}>
          What we collect
        </h2>
        <div className={bodyClass}>
          <h3 className="font-semibold text-slate-900">Your account</h3>
          <p>
            Your name, email address, and password (stored only as a secure hash we cannot reverse).
            If you sign in with Google we receive your name, email, and Google account ID — never
            your Google password.
          </p>

          <h3 className="pt-2 font-semibold text-slate-900">What you create</h3>
          <p>
            Teams, leagues, seasons, rosters, games, statistics, posts, follows, and any images or
            video you upload. Some of this is public by design: league pages, team pages, player
            profiles, game results, and the public feed can be seen by anyone, including people
            without an account.
          </p>

          <h3 className="pt-2 font-semibold text-slate-900">Analytics — only with your consent</h3>
          <p>
            If you accept analytics cookies, we record which pages you visit, roughly how far down
            you scroll, and a small number of actions such as choosing to create an account. Signed
            in, these are linked to your internal account ID — never to your name or email.
          </p>
          <p>
            If you decline, we still count the visit so we know roughly how busy the site is, but
            nothing is stored on your device and nothing is linked to you between visits.
          </p>

          <h3 className="pt-2 font-semibold text-slate-900">Technical data</h3>
          <p>
            Our servers keep short-lived logs including IP address and browser type, used to keep
            the service secure and diagnose faults. Your IP address and browser are also recorded
            against active sign-in sessions so you can see and end them.
          </p>
        </div>
      </section>

      <section className={sectionClass} aria-labelledby="why-heading">
        <h2 id="why-heading" className={headingClass} style={headingStyle}>
          Why we collect it, and our legal basis
        </h2>
        <div className={bodyClass}>
          <p>
            <strong className="text-slate-900">To provide the service</strong> — running your
            account, teams, leagues, and games. Legal basis: performance of a contract.
          </p>
          <p>
            <strong className="text-slate-900">To keep it secure</strong> — preventing abuse,
            investigating faults, and protecting accounts. Legal basis: legitimate interests.
          </p>
          <p>
            <strong className="text-slate-900">To improve the site</strong> — understanding which
            pages are useful and where people get stuck. Legal basis: your consent, which you can
            withdraw at any time.
          </p>
          <p>
            <strong className="text-slate-900">To take payment</strong> — where you subscribe to a
            paid plan. Legal basis: performance of a contract.
          </p>
        </div>
      </section>

      <section className={sectionClass} aria-labelledby="cookies-heading">
        <h2 id="cookies-heading" className={headingClass} style={headingStyle}>
          Cookies
        </h2>
        <div className={bodyClass}>
          <p>
            Strictly necessary cookies keep you signed in and protect the site; these do not require
            consent. Analytics cookies are set only if you accept them.
          </p>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Cookie
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Purpose
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Lifetime
                </th>
                <th scope="col" className="py-2 font-medium">
                  Consent
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-600">
              {cookies.map((cookie) => (
                <tr key={cookie.name}>
                  <th scope="row" className="py-2.5 pr-4 font-mono text-xs font-normal">
                    {cookie.name}
                  </th>
                  <td className="py-2.5 pr-4">{cookie.purpose}</td>
                  <td className="py-2.5 pr-4 whitespace-nowrap">{cookie.lifetime}</td>
                  <td className="py-2.5">{cookie.consent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm text-slate-600">
          You can change your choice at any time using the{' '}
          <strong className="text-slate-900">Cookie settings</strong> link in the footer.
        </p>
      </section>

      <section className={sectionClass} aria-labelledby="processors-heading">
        <h2 id="processors-heading" className={headingClass} style={headingStyle}>
          Who we share it with
        </h2>
        <div className={bodyClass}>
          <p>
            We do not sell your data. We use the following providers to run the service, each
            handling only what their role requires:
          </p>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Provider
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Purpose
                </th>
                <th scope="col" className="py-2 font-medium">
                  Data location
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-600">
              {processors.map((processor) => (
                <tr key={processor.name}>
                  <th scope="row" className="py-2.5 pr-4 font-normal text-slate-900">
                    {processor.name}
                    <span className="mt-0.5 block text-xs font-normal text-slate-500">
                      {processor.detail}
                    </span>
                  </th>
                  <td className="py-2.5 pr-4 align-top">{processor.purpose}</td>
                  <td className="py-2.5 align-top">{processor.location}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={sectionClass} aria-labelledby="retention-heading">
        <h2 id="retention-heading" className={headingClass} style={headingStyle}>
          How long we keep it
        </h2>
        <div className={bodyClass}>
          <p>
            Account and content data is kept while your account is active. If you ask us to delete
            your account we remove your personal data, though records that belong to a league — game
            results and statistics, for example — may remain as part of that league&apos;s history
            in a form no longer linked to you.
          </p>
          <p>Analytics data is retained by PostHog under our project retention settings.</p>
          <p>Server logs are short-lived and kept only for security and fault diagnosis.</p>
        </div>
      </section>

      {/* Meta App Review requires a reachable data-deletion instructions URL.
          This section's id is that URL's anchor — /privacy#data-deletion —
          so renaming it breaks the Meta app configuration. */}
      <section
        id="data-deletion"
        className={sectionClass}
        aria-labelledby="data-deletion-heading"
        style={{ scrollMarginTop: '5rem' }}
      >
        <h2 id="data-deletion-heading" className={headingClass} style={headingStyle}>
          Deleting your data
        </h2>
        <div className={bodyClass}>
          <p>
            You can ask us to delete your data at any time, and you do not need an account to ask.
            Send the request through the{' '}
            <Link to="/contact" className="underline">
              contact form
            </Link>
            , from the email address on the account where possible, and say that you want your data
            deleted.
          </p>
          <p>We will confirm within 7 days and complete the deletion within 30 days. We remove:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>your account, profile, and sign-in details;</li>
            <li>media you uploaded, including avatars and anything you posted to the feed;</li>
            <li>
              any image we published to our own social accounts that features you, together with the
              stored copy of that image; and
            </li>
            <li>your analytics records, if you had accepted analytics.</li>
          </ul>
          <p>
            Game results and statistics that belong to a league may remain as part of that
            league&apos;s history, in a form no longer linked to you. We keep a minimal record that
            a deletion request was made and honoured, because we have to be able to show that we
            acted on it.
          </p>
        </div>
      </section>

      <section
        id="social-publishing"
        className={sectionClass}
        aria-labelledby="social-heading"
        style={{ scrollMarginTop: '5rem' }}
      >
        <h2 id="social-heading" className={headingClass} style={headingStyle}>
          Publishing to social media
        </h2>
        <div className={bodyClass}>
          <p>
            We sometimes publish game content — a scoreline card and a short caption — to {appName}
            &apos;s own Instagram account. A person at {appName} reviews and approves every post
            before it is published. Nothing is posted automatically.
          </p>
          <p>
            A card can show team names, a score, the date, a team badge, and the name of a top
            scorer. It never includes contact details, and we do not publish content featuring an
            identifiable participant without a basis for doing so.
          </p>
          <p>
            This works in one direction only. We connect {appName}&apos;s own Instagram account, and
            we store the access token for that company account in encrypted form. We never ask for,
            access, read, or post to your Instagram account, and connecting Instagram is not
            something an ordinary {appName} account can do.
          </p>
          <p>
            If a post features you and you would rather it did not, ask us through the{' '}
            <Link to="/contact" className="underline">
              contact form
            </Link>{' '}
            and we will remove it — see{' '}
            <a className="underline" href="#data-deletion">
              deleting your data
            </a>{' '}
            above.
          </p>
        </div>
      </section>

      <section className={sectionClass} aria-labelledby="rights-heading">
        <h2 id="rights-heading" className={headingClass} style={headingStyle}>
          Your rights
        </h2>
        <div className={bodyClass}>
          <p>Under UK data protection law you can ask us to:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>give you a copy of the personal data we hold about you;</li>
            <li>correct anything inaccurate;</li>
            <li>delete your data, where we have no overriding reason to keep it;</li>
            <li>restrict or object to how we use it;</li>
            <li>transfer it to another service;</li>
            <li>withdraw your consent to analytics, at any time.</li>
          </ul>
          <p>
            To exercise any of these, use the{' '}
            <Link to="/contact" className="underline">
              contact form
            </Link>
            . You can also complain to the{' '}
            <a
              className="underline"
              href="https://ico.org.uk/make-a-complaint/"
              target="_blank"
              rel="noreferrer"
            >
              Information Commissioner&apos;s Office
            </a>
            , the UK&apos;s data protection regulator.
          </p>
        </div>
      </section>

      <section className={sectionClass} aria-labelledby="changes-heading">
        <h2 id="changes-heading" className={headingClass} style={headingStyle}>
          Changes to this policy
        </h2>
        <div className={bodyClass}>
          <p>
            If we change what we collect, why, or who we share it with, we will update this page and
            its date. Where the change affects analytics, we will ask for your consent again rather
            than assume the previous answer still stands.
          </p>
        </div>
      </section>
    </main>
  );
}
