const nodemailer = require('nodemailer');
const { env } = require('../config/env');
const { logger } = require('../config/logger');

function hasSmtpConfiguration() {
  return Boolean(env.SMTP_HOST && env.SMTP_PORT && env.SMTP_FROM_EMAIL && env.SMTP_FROM_NAME);
}

function getTransport() {
  if (!hasSmtpConfiguration()) {
    return null;
  }

  const transportOptions = {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
  };

  if (env.SMTP_USER && env.SMTP_PASS) {
    transportOptions.auth = {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    };
  }

  return nodemailer.createTransport(transportOptions);
}

async function sendTemplateEmail({ to, replyTo, subject, text, html, fallbackLabel }) {
  const transport = getTransport();

  if (!transport) {
    if (env.NODE_ENV === 'production') {
      throw new Error('SMTP configuration is required in production to send auth emails.');
    }

    logger.warn({ to, fallbackLabel, text }, 'SMTP not configured; emitting local email fallback');
    return { delivery: 'fallback' };
  }

  try {
    const mailOptions = {
      from: `${env.SMTP_FROM_NAME} <${env.SMTP_FROM_EMAIL}>`,
      to,
      subject,
      text,
      html,
    };
    if (replyTo) mailOptions.replyTo = replyTo;
    await transport.sendMail(mailOptions);
  } catch (error) {
    if (env.NODE_ENV === 'production') {
      throw error;
    }

    logger.warn(
      { err: error, to, fallbackLabel, text },
      'SMTP delivery failed; emitting local email fallback'
    );
    return { delivery: 'fallback' };
  }

  return { delivery: 'smtp' };
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
  hasSmtpConfiguration,
};
