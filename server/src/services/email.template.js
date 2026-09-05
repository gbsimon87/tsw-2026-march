const { escapeHtml } = require('../utils/escapeHtml');

// The single source of email markup. Every send renders through this so the
// HTML and plain-text bodies cannot drift apart — previously each function
// hand-wrote both and nothing kept them in step.
//
// Constraints that look cosmetic but are not:
//   * Table layout + inline CSS — email clients strip <style> and have no
//     flexbox or grid.
//   * No images of any kind. Four of Resend's deliverability checks depend on
//     it, and the design must survive images being blocked, which is the
//     default in Outlook and much of Gmail.
const BRAND = {
  name: 'The Sporty Way',
  url: 'https://thesportyway.com',
  accent: '#059669', // emerald-600
  text: '#0f172a', // slate-900
  muted: '#64748b', // slate-500
  border: '#e2e8f0', // slate-200
  page: '#f8fafc', // slate-50
};

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function isLoopbackHost(hostname) {
  // Strip brackets from IPv6 addresses (e.g., [::1] becomes ::1)
  const addr =
    hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
  return addr === 'localhost' || addr === '127.0.0.1' || addr === '::1';
}

function renderButton(cta) {
  if (!cta) return '';

  // Validate the CTA url before rendering as a link. Links are allowed only when:
  //   * protocol is https: (on any host)
  //   * protocol is http: AND hostname is loopback (localhost, 127.0.0.1, [::1])
  // Loopback http is permitted because local development uses http://localhost:5173
  // as CLIENT_ORIGIN, and a loopback host is not attacker-reachable. Never emit a
  // link with javascript:, data:, or non-loopback http schemes — an email that
  // renders the url as text is better than one that silently passes XSS through.
  let isValidUrl = false;
  try {
    const parsed = new URL(cta.url);
    if (parsed.protocol === 'https:') {
      isValidUrl = true;
    } else if (parsed.protocol === 'http:' && isLoopbackHost(parsed.hostname)) {
      isValidUrl = true;
    }
  } catch {
    // URL parsing failed; treat as invalid
  }

  if (!isValidUrl) {
    // Render as plain text, not a link
    return `
      <tr>
        <td style="font-family:${FONT};font-size:15px;line-height:1.6;color:${BRAND.text};padding:0 0 16px 0;">
          ${escapeHtml(cta.label)}: ${escapeHtml(cta.url)}
        </td>
      </tr>`;
  }

  return `
      <tr>
        <td style="padding:8px 0 24px 0;">
          <a href="${encodeURI(cta.url)}" style="background-color:${BRAND.accent};border-radius:6px;color:#ffffff;display:inline-block;font-family:${FONT};font-size:15px;font-weight:600;line-height:1;padding:14px 24px;text-decoration:none;">${escapeHtml(cta.label)}</a>
        </td>
      </tr>`;
}

function renderEmail({
  preheader = '',
  greeting = 'Hi there,',
  paragraphs = [],
  cta = null,
  footnote = null,
}) {
  const bodyRows = paragraphs
    .map(
      (paragraph) =>
        `      <tr><td style="font-family:${FONT};font-size:15px;line-height:1.6;color:${BRAND.text};padding:0 0 16px 0;">${escapeHtml(paragraph)}</td></tr>`
    )
    .join('\n');

  const footnoteRow = footnote
    ? `      <tr><td style="font-family:${FONT};font-size:13px;line-height:1.6;color:${BRAND.muted};padding:0 0 8px 0;">${escapeHtml(footnote)}</td></tr>`
    : '';

  const html = `<!doctype html>
<html>
<body style="margin:0;padding:0;background-color:${BRAND.page};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.page};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border:1px solid ${BRAND.border};border-radius:8px;">
          <tr>
            <td style="padding:20px 28px;border-bottom:1px solid ${BRAND.border};font-family:${FONT};font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.accent};">${BRAND.name}</td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="font-family:${FONT};font-size:15px;line-height:1.6;color:${BRAND.text};padding:0 0 16px 0;">${escapeHtml(greeting)}</td></tr>
${bodyRows}
${renderButton(cta)}
${footnoteRow}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;border-top:1px solid ${BRAND.border};font-family:${FONT};font-size:12px;color:${BRAND.muted};">
              <a href="${BRAND.url}" style="color:${BRAND.muted};text-decoration:underline;">thesportyway.com</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  // Plain text is not a courtesy — Resend's advisor checks for it, and a text
  // part is what renders when a client refuses HTML. The CTA becomes a labelled
  // URL so the link stays reachable.
  const textParts = [greeting, '', ...paragraphs];
  if (cta) textParts.push('', `${cta.label}: ${cta.url}`);
  if (footnote) textParts.push('', footnote);
  textParts.push('', `— ${BRAND.name}`, BRAND.url);

  return { html, text: textParts.join('\n') };
}

module.exports = { renderEmail };
