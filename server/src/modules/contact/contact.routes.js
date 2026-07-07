const { Router } = require('express');
const { z } = require('zod');
const { asyncHandler } = require('../../utils/asyncHandler');
const { sendTemplateEmailAsync } = require('../../services/email.service');
const { env } = require('../../config/env');
const { ApiError } = require('../../utils/apiError');
const { escapeHtml } = require('../../utils/escapeHtml');

const contactRouter = Router();

const contactSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  email: z.string().email().max(200).trim(),
  role: z.enum(['coach', 'manager', 'stat-keeper', 'club-director', 'other']),
  clubName: z.string().min(1).max(200).trim(),
  interest: z.enum(['league-setup', 'team-tracking', 'general', 'other']),
  message: z.string().max(2000).trim().optional(),
});

const ROLE_LABELS = {
  coach: 'Coach',
  manager: 'Team Manager',
  'stat-keeper': 'Stat-keeper',
  'club-director': 'Club Director',
  other: 'Other',
};

const INTEREST_LABELS = {
  'league-setup': 'Setting up a league',
  'team-tracking': 'Team stat tracking',
  general: 'General question',
  other: 'Other',
};

contactRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = contactSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, 'Please check your details and try again.');
    }

    const { name, email, role, clubName, interest, message } = parsed.data;
    const roleLabel = ROLE_LABELS[role];
    const interestLabel = INTEREST_LABELS[interest];
    const bodyLines = [
      `Name: ${name}`,
      `Email: ${email}`,
      `Role: ${roleLabel}`,
      `Club / Team: ${clubName}`,
      `Interest: ${interestLabel}`,
      message ? `\nMessage:\n${message}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    // OPT-024: the HTML body embeds free-text fields (name, clubName, message)
    // directly — escape them so a submission like `<img onerror=...>` can't
    // execute in whatever renders this email as HTML. `bodyLines`/`text` stay
    // unescaped since plaintext has no markup to inject into.
    const htmlBodyLines = [
      `Name: ${escapeHtml(name)}`,
      `Email: ${escapeHtml(email)}`,
      `Role: ${escapeHtml(roleLabel)}`,
      `Club / Team: ${escapeHtml(clubName)}`,
      `Interest: ${escapeHtml(interestLabel)}`,
      message ? `\nMessage:\n${escapeHtml(message)}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    // OPT-020: dispatch off the request path — a slow/failing Resend call must
    // not hold the contact form open; failures are logged server-side.
    sendTemplateEmailAsync({
      to: env.CONTACT_EMAIL,
      replyTo: email,
      subject: `Contact form: ${name} (${clubName})`,
      text: bodyLines,
      html: `<pre style="font-family:sans-serif;font-size:14px;line-height:1.6">${htmlBodyLines}</pre>`,
      fallbackLabel: 'contact_form',
    });

    res.status(200).json({ ok: true });
  })
);

module.exports = { contactRouter };
