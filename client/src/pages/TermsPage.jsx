import { Link } from 'react-router-dom';
import { DarkPageHeader } from '../components/DarkPageHeader';
import { env } from '../lib/env';

// Meta App Review requires a Live app to publish a terms-of-service URL
// separate from its privacy policy, which is why this is its own route rather
// than a section of /privacy. Reachable from the footer on every page.
//
// DRAFT: written to be accurate about what the product actually does, not to be
// a substitute for legal advice. Have it reviewed before relying on it.
const LAST_UPDATED = '5 September 2026';

const sectionClass = 'rounded-2xl border border-slate-200 bg-white p-6 md:p-8';
const headingClass = 'text-xl text-slate-900';
const headingStyle = { fontFamily: "'Archivo Black', sans-serif" };
const bodyClass = 'mt-3 space-y-3 text-sm leading-relaxed text-slate-600';

export function TermsPage() {
  const appName = env.appName;

  return (
    <main className="space-y-6">
      <DarkPageHeader
        size="hero"
        titleAriaLabel="Terms"
        eyebrow="Terms"
        title="The deal between us."
        description={`The terms you agree to when you use ${appName}. Last updated ${LAST_UPDATED}.`}
      />

      <section className={sectionClass} aria-labelledby="agreement-heading">
        <h2 id="agreement-heading" className={headingClass} style={headingStyle}>
          The short version
        </h2>
        <div className={bodyClass}>
          <p>
            {appName} is a basketball stat-tracking and league-management platform. By creating an
            account or using the site, you agree to these terms. If you do not agree with them,
            please do not use {appName}.
          </p>
          <p>
            We may update these terms. If a change materially affects you we will say so on this
            page and update the date above. Continuing to use {appName} after that means you accept
            the change.
          </p>
        </div>
      </section>

      <section className={sectionClass} aria-labelledby="account-heading">
        <h2 id="account-heading" className={headingClass} style={headingStyle}>
          Your account
        </h2>
        <div className={bodyClass}>
          <p>
            You need an account for most of what {appName} does. Give accurate details, keep your
            password to yourself, and tell us if you think someone else has got into your account.
            You are responsible for what happens under it.
          </p>
          <p>
            You must be 13 or older to hold an account. Where a player is under 18, the adult
            running their team or league is responsible for having the right permissions before
            entering that player&apos;s details.
          </p>
        </div>
      </section>

      <section className={sectionClass} aria-labelledby="use-heading">
        <h2 id="use-heading" className={headingClass} style={headingStyle}>
          Using it fairly
        </h2>
        <div className={bodyClass}>
          <p>Please do not:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>upload anything unlawful, abusive, or that you have no right to share;</li>
            <li>upload someone else&apos;s photo or likeness without their permission;</li>
            <li>try to break, overload, or get around the security of the service;</li>
            <li>scrape or bulk-extract data, or resell access to it; or</li>
            <li>impersonate anyone, or misrepresent a team or league you do not run.</li>
          </ul>
          <p>
            We can suspend or remove an account that does these things, and remove content that
            breaks these terms.
          </p>
        </div>
      </section>

      <section className={sectionClass} aria-labelledby="content-heading">
        <h2 id="content-heading" className={headingClass} style={headingStyle}>
          Your content, and what we may do with it
        </h2>
        <div className={bodyClass}>
          <p>
            What you upload stays yours. We do not claim ownership of your photos, videos, team
            badges, or the game data you record.
          </p>
          <p>
            To run the service, you give us permission to host, store, reproduce, and display that
            content — that is what makes it appear on your team pages, in league standings, and in
            The Pulse.
          </p>
          <p>
            That permission extends to promoting {appName} itself, including publishing scorelines,
            statistics, and game-recap cards drawn from public league content to {appName}&apos;s
            own social accounts. A person reviews and approves every such post before it goes out,
            and we explain exactly what this involves in our{' '}
            <Link to="/privacy#social-publishing" className="underline">
              privacy policy
            </Link>
            . If you would rather your content was not used this way, tell us through the{' '}
            <Link to="/contact" className="underline">
              contact form
            </Link>{' '}
            and we will honour that.
          </p>
          <p>
            You keep the right to have your content deleted. See{' '}
            <Link to="/privacy#data-deletion" className="underline">
              deleting your data
            </Link>
            .
          </p>
        </div>
      </section>

      <section className={sectionClass} aria-labelledby="ours-heading">
        <h2 id="ours-heading" className={headingClass} style={headingStyle}>
          Our content
        </h2>
        <div className={bodyClass}>
          <p>
            The {appName} name, design, and software are ours. You may use the service as intended,
            but not copy, resell, or rebrand it.
          </p>
        </div>
      </section>

      <section className={sectionClass} aria-labelledby="billing-heading">
        <h2 id="billing-heading" className={headingClass} style={headingStyle}>
          Paid plans
        </h2>
        <div className={bodyClass}>
          <p>
            Some features are paid. Prices and what each plan includes are shown on the{' '}
            <Link to="/pricing" className="underline">
              pricing page
            </Link>{' '}
            before you subscribe. Subscriptions renew automatically until cancelled, and you can
            cancel at any time — access continues to the end of the period you have paid for.
          </p>
          <p>
            Payments are handled by Stripe. We never see or store your card details. If we change a
            price, we will tell you before it applies to your renewal.
          </p>
        </div>
      </section>

      <section className={sectionClass} aria-labelledby="availability-heading">
        <h2 id="availability-heading" className={headingClass} style={headingStyle}>
          Availability and liability
        </h2>
        <div className={bodyClass}>
          <p>
            We work to keep {appName} running and accurate, but we provide it as it is. We do not
            promise uninterrupted service, and statistics depend on what is recorded during a game —
            check anything that matters before relying on it.
          </p>
          <p>
            We are not liable for indirect or consequential loss, or for lost data or profits, to
            the extent the law allows. Nothing here limits liability for death or personal injury
            caused by negligence, for fraud, or for anything else that cannot lawfully be limited.
          </p>
        </div>
      </section>

      <section className={sectionClass} aria-labelledby="ending-heading">
        <h2 id="ending-heading" className={headingClass} style={headingStyle}>
          Ending it
        </h2>
        <div className={bodyClass}>
          <p>
            You can stop using {appName} and ask us to delete your account at any time. We may
            suspend or close an account that breaks these terms, or where we have to for legal
            reasons. Some league records may remain as league history, in a form no longer linked to
            you.
          </p>
        </div>
      </section>

      <section className={sectionClass} aria-labelledby="law-heading">
        <h2 id="law-heading" className={headingClass} style={headingStyle}>
          Law, and getting in touch
        </h2>
        <div className={bodyClass}>
          <p>
            These terms are governed by the law of England and Wales, and the courts of England and
            Wales have jurisdiction.
          </p>
          <p>
            Questions about any of this go through the{' '}
            <Link to="/contact" className="underline">
              contact form
            </Link>
            .
          </p>
        </div>
      </section>
    </main>
  );
}
