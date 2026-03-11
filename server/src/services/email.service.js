const nodemailer = require('nodemailer');
const { env } = require('../config/env');
const { logger } = require('../config/logger');

function hasSmtpConfiguration() {
  return Boolean(
    env.SMTP_HOST &&
    env.SMTP_PORT &&
    env.SMTP_USER &&
    env.SMTP_PASS &&
    env.SMTP_FROM_EMAIL &&
    env.SMTP_FROM_NAME
  );
}

function getTransport() {
  if (!hasSmtpConfiguration()) {
    return null;
  }

  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });
}

async function sendTemplateEmail({ to, subject, text, html, fallbackLabel }) {
  const transport = getTransport();

  if (!transport) {
    if (env.NODE_ENV === 'production') {
      throw new Error('SMTP configuration is required in production to send auth emails.');
    }

    logger.warn({ to, fallbackLabel, text }, 'SMTP not configured; emitting local email fallback');
    return;
  }

  await transport.sendMail({
    from: `${env.SMTP_FROM_NAME} <${env.SMTP_FROM_EMAIL}>`,
    to,
    subject,
    text,
    html,
  });
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
  sendVerificationEmail,
  sendPasswordResetEmail,
  hasSmtpConfiguration,
};
