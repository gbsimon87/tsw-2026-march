import { trackEvent } from './trackEvent';

// Where a signup CTA was clicked. `source` is what makes the acquisition funnel
// attributable — without it we know people signed up, but not what prompted
// them. Keep these values stable: renaming one after it has history breaks any
// funnel built on it (docs/analytics-plan.md §4).
export const SIGNUP_SOURCE = {
  NAV: 'nav',
  HOME: 'home',
  PULSE: 'pulse',
  FEED_COMPOSER: 'feed_composer',
  FOLLOW_BUTTON: 'follow_button',
  PRICING: 'pricing',
};

export function trackSignupCtaClicked(source) {
  trackEvent('signup_cta_clicked', { source });
}

export function trackAuthPageViewed({ mode, redirectTo }) {
  // Separates "reached the form" from "completed it", isolating abandonment on
  // the form itself from failure to get there at all.
  trackEvent('auth_page_viewed', { mode, redirect_to: Boolean(redirectTo) });
}
