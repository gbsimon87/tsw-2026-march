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

async function sendVerificationEmail({ to, name, verifyUrl }) {
  const safeName = name || 'there';

  await sendTemplateEmail({
    to,
    subject: 'Verify your email',
    text: `Hi ${safeName}, verify your email by visiting: ${verifyUrl}`,
    html: `<p>Hi ${safeName},</p><p>Verify your email by clicking <a href="${verifyUrl}">this link</a>.</p>`,
    fallbackLabel: 'email_verification',
  });
}

async function sendPasswordResetEmail({ to, name, resetUrl }) {
  const safeName = name || 'there';

  await sendTemplateEmail({
    to,
    subject: 'Reset your password',
    text: `Hi ${safeName}, reset your password by visiting: ${resetUrl}`,
    html: `<p>Hi ${safeName},</p><p>Reset your password by clicking <a href="${resetUrl}">this link</a>.</p>`,
    fallbackLabel: 'password_reset',
  });
}

module.exports = {
  sendTemplateEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
};
