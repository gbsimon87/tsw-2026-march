const { Resend } = require('resend');
const { env } = require('../config/env');
const { logger } = require('../config/logger');

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

    logger.warn(
      { to, fallbackLabel, text },
      'Resend not configured; emitting local email fallback'
    );
    return { delivery: 'fallback' };
  }

  const { error } = await client.emails.send({
    from: `${env.RESEND_FROM_NAME} <${env.RESEND_FROM_EMAIL}>`,
    to,
    replyTo,
    subject,
    text,
    html,
  });

  if (error) {
    if (env.NODE_ENV === 'production') {
      throw new Error(error.message);
    }

    logger.warn(
      { err: error, to, fallbackLabel, text },
      'Resend delivery failed; emitting local email fallback'
    );
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

// OPT-020: transactional emails are dispatched fire-and-forget so a slow/failing
// Resend call never delays or fails the auth request that triggered it.
function sendVerificationEmail({ to, name, verifyUrl }) {
  const safeName = name || 'there';

  sendTemplateEmailAsync({
    to,
    subject: 'Verify your email',
    text: `Hi ${safeName}, verify your email by visiting: ${verifyUrl}`,
    html: `<p>Hi ${safeName},</p><p>Verify your email by clicking <a href="${verifyUrl}">this link</a>.</p>`,
    fallbackLabel: 'email_verification',
  });
}

function sendPasswordResetEmail({ to, name, resetUrl }) {
  const safeName = name || 'there';

  sendTemplateEmailAsync({
    to,
    subject: 'Reset your password',
    text: `Hi ${safeName}, reset your password by visiting: ${resetUrl}`,
    html: `<p>Hi ${safeName},</p><p>Reset your password by clicking <a href="${resetUrl}">this link</a>.</p>`,
    fallbackLabel: 'password_reset',
  });
}

module.exports = {
  sendTemplateEmail,
  sendTemplateEmailAsync,
  sendVerificationEmail,
  sendPasswordResetEmail,
};
