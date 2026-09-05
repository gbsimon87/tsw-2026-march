const { Resend } = require('resend');
const { env } = require('../config/env');
const { logger } = require('../config/logger');
const { renderEmail } = require('./email.template');

function getClient() {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL || !env.RESEND_FROM_NAME) return null;
  return new Resend(env.RESEND_API_KEY);
}

async function sendTemplateEmail({ to, replyTo, subject, text, html, fallbackLabel }) {
  const client = getClient();

  if (!client) {
    if (env.NODE_ENV === 'production') {
      throw new Error('RESEND_API_KEY is required in production to send emails.');
    }

    logger.warn({ to, fallbackLabel }, 'Resend not configured; email not sent');
    return { delivery: 'fallback' };
  }

  const { error } = await client.emails.send({
    from: `${env.RESEND_FROM_NAME} <${env.RESEND_FROM_EMAIL}>`,
    to,
    // Default replies to the monitored inbox rather than the sending address.
    // Someone answering a password-reset email is trying to reach a person, and
    // without this they reach a mailbox nobody owns. It also means the sending
    // address never has to be a real mailbox, and never has to say "no-reply" —
    // which Resend flags, because an unreplyable sender reads as one-way and
    // costs engagement reputation.
    //
    // The contact form passes its own replyTo (the person who submitted it), so
    // this only fills the gap where a caller has no better answer.
    replyTo: replyTo || env.CONTACT_EMAIL,
    subject,
    text,
    html,
  });

  if (error) {
    if (env.NODE_ENV === 'production') {
      throw new Error(error.message);
    }

    logger.warn({ err: error, to, fallbackLabel }, 'Resend delivery failed; email not sent');
    return { delivery: 'fallback' };
  }

  return { delivery: 'resend' };
}

// OPT-020: fire-and-forget send. Email delivery (Resend) is a third-party call
// that must not block or fail the request that triggered it — a slow or failing
// provider should degrade to "email didn't arrive", not "the whole request
// errored". Scheduled with setImmediate so it runs after the response is on its
// way; failures are logged, never thrown into the request path.
function sendTemplateEmailAsync(payload) {
  setImmediate(() => {
    sendTemplateEmail(payload).catch((error) => {
      logger.error(
        { err: error, to: payload.to, fallbackLabel: payload.fallbackLabel },
        'Async email delivery failed'
      );
    });
  });
}

function sendVerificationEmail({ to, name, verifyUrl }) {
  const { html, text } = renderEmail({
    preheader: 'Confirm your email address',
    greeting: `Hi ${name || 'there'},`,
    paragraphs: ['Confirm this email address to finish setting up your account.'],
    cta: { label: 'Confirm email', url: verifyUrl },
    footnote: 'If you did not create an account, you can ignore this email.',
  });

  sendTemplateEmailAsync({
    to,
    subject: 'Confirm your email',
    text,
    html,
    fallbackLabel: 'email_verification',
  });
}

function sendPasswordResetEmail({ to, name, resetUrl }) {
  const { html, text } = renderEmail({
    preheader: 'Reset your password',
    greeting: `Hi ${name || 'there'},`,
    paragraphs: ['Someone asked to reset the password for this account.'],
    cta: { label: 'Reset password', url: resetUrl },
    footnote: 'If you did not ask for this, you can ignore this email — nothing has changed.',
  });

  sendTemplateEmailAsync({
    to,
    subject: 'Reset your password',
    text,
    html,
    fallbackLabel: 'password_reset',
  });
}

// Welcome (local signup carries a verify link; Google signup goes straight to
// onboarding because Google has already confirmed the address).
function sendWelcomeEmail({ to, name, ctaUrl, needsVerification }) {
  const { html, text } = renderEmail({
    preheader: 'Welcome to The Sporty Way',
    greeting: `Hi ${name || 'there'},`,
    paragraphs: [
      'Welcome to The Sporty Way. Your account is ready and you are already signed in.',
      needsVerification
        ? 'Confirm your email address and we will take you straight to setting up your first team or league.'
        : 'Set up your first team or league and start tracking games.',
    ],
    cta: {
      label: needsVerification ? 'Confirm and get started' : 'Get started',
      url: ctaUrl,
    },
    footnote: needsVerification ? 'This link expires in 60 minutes.' : null,
  });

  sendTemplateEmailAsync({
    to,
    subject: 'Welcome to The Sporty Way',
    text,
    html,
    fallbackLabel: 'welcome',
  });
}

// Sent when someone asks to reset a password on an account that signs in with
// Google. Without it that request is a silent dead end: there is no password to
// reset, so nothing was ever sent. The on-screen response is unchanged, so this
// tells only the true mailbox owner anything.
function sendGoogleAccountEmail({ to, name, loginUrl }) {
  const { html, text } = renderEmail({
    preheader: 'This account signs in with Google',
    greeting: `Hi ${name || 'there'},`,
    paragraphs: [
      'Someone asked to reset the password for this address.',
      'This account signs in with Google, so there is no password to reset. Use "Continue with Google" on the sign-in page.',
    ],
    cta: { label: 'Go to sign in', url: loginUrl },
    footnote: 'If you did not ask for this, you can ignore this email — nothing has changed.',
  });

  sendTemplateEmailAsync({
    to,
    subject: 'Signing in to The Sporty Way',
    text,
    html,
    fallbackLabel: 'google_account_notice',
  });
}

function sendPaymentFailedEmail({ to, name, resourceLabel, manageUrl }) {
  if (!to) return;
  const what = resourceLabel || 'your subscription';
  const { html, text } = renderEmail({
    preheader: 'Your payment failed',
    greeting: `Hi ${name || 'there'},`,
    paragraphs: [
      `The latest payment for ${what} failed.`,
      'Update your payment method to keep the subscription active.',
    ],
    cta: manageUrl ? { label: 'Update payment method', url: manageUrl } : null,
  });

  sendTemplateEmailAsync({
    to,
    subject: 'Your payment failed',
    text,
    html,
    fallbackLabel: 'billing_payment_failed',
  });
}

function sendTrialEndingEmail({ to, name, resourceLabel, trialEndsAt, manageUrl }) {
  if (!to) return;
  const what = resourceLabel || 'your subscription';
  const when = trialEndsAt ? `on ${new Date(trialEndsAt).toDateString()}` : 'soon';
  const { html, text } = renderEmail({
    preheader: 'Your free trial is ending soon',
    greeting: `Hi ${name || 'there'},`,
    paragraphs: [
      `Your free trial for ${what} ends ${when}.`,
      'Add a payment method to keep managing your league.',
    ],
    cta: manageUrl ? { label: 'Manage subscription', url: manageUrl } : null,
  });

  sendTemplateEmailAsync({
    to,
    subject: 'Your free trial is ending soon',
    text,
    html,
    fallbackLabel: 'billing_trial_ending',
  });
}

module.exports = {
  sendTemplateEmail,
  sendTemplateEmailAsync,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendGoogleAccountEmail,
  sendPaymentFailedEmail,
  sendTrialEndingEmail,
};
