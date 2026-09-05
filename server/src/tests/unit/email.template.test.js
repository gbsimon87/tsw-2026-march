const { renderEmail } = require('../../services/email.template');

describe('renderEmail', () => {
  test('renders the CTA url in both the html and text bodies', () => {
    const { html, text } = renderEmail({
      preheader: 'Reset your password',
      greeting: 'Hi Simon,',
      paragraphs: ['Someone asked to reset your password.'],
      cta: { label: 'Reset password', url: 'https://thesportyway.com/reset-password?token=abc' },
      footnote: 'This link expires in 30 minutes.',
    });

    expect(html).toContain('https://thesportyway.com/reset-password?token=abc');
    expect(text).toContain('https://thesportyway.com/reset-password?token=abc');
    expect(text).toContain('Reset password:');
  });

  test('never emits an image, which would fail Resend deliverability checks', () => {
    const { html } = renderEmail({
      greeting: 'Hi there,',
      paragraphs: ['Body copy.'],
      cta: { label: 'Go', url: 'https://thesportyway.com' },
    });

    expect(html).not.toMatch(/<img/i);
    expect(html).not.toMatch(/\.svg/i);
  });

  test('escapes user values in html but leaves text raw', () => {
    const { html, text } = renderEmail({
      greeting: 'Hi <img src=x onerror=alert(1)>,',
      paragraphs: ['Club & <b>Bold</b>'],
      cta: null,
    });

    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
    expect(html).toContain('Club &amp; &lt;b&gt;Bold&lt;/b&gt;');
    expect(text).toContain('Club & <b>Bold</b>');
  });

  test('omits the button entirely when cta is null', () => {
    const withCta = renderEmail({
      greeting: 'Hi there,',
      paragraphs: ['Body.'],
      cta: { label: 'Reset password', url: 'https://thesportyway.com/reset' },
    });
    const withoutCta = renderEmail({
      greeting: 'Hi there,',
      paragraphs: ['Body.'],
      cta: null,
    });

    expect(withCta.html).toContain('Reset password');
    expect(withCta.text).toContain('Reset password: https://thesportyway.com/reset');

    // The footer always links to the site, so this asserts the CTA specifically
    // is gone rather than that the email contains no links at all.
    expect(withoutCta.html).not.toContain('Reset password');
    expect(withoutCta.text).not.toContain('Reset password');
    expect(withoutCta.html).not.toContain('/reset');
  });

  test('includes the brand footer in both bodies', () => {
    const { html, text } = renderEmail({
      greeting: 'Hi there,',
      paragraphs: ['Body.'],
      cta: null,
    });

    expect(html).toContain('thesportyway.com');
    expect(text).toContain('The Sporty Way');
  });

  test('escapes cta.label markup in html', () => {
    const { html } = renderEmail({
      greeting: 'Hi there,',
      paragraphs: ['Body.'],
      cta: { label: 'Click <b>here</b>', url: 'https://thesportyway.com/verify' },
    });

    expect(html).not.toContain('Click <b>here</b>');
    expect(html).toContain('Click &lt;b&gt;here&lt;/b&gt;');
  });

  test('rejects javascript: scheme and renders cta as plain text', () => {
    const { html } = renderEmail({
      greeting: 'Hi there,',
      paragraphs: ['Body.'],
      cta: { label: 'Go', url: 'javascript:alert(1)' },
    });

    expect(html).not.toContain('href="javascript:');
    expect(html).not.toMatch(/<a href="javascript:/i);
    expect(html).toContain('Go:');
    expect(html).toContain('javascript:alert(1)');
  });

  test('renders valid https url as a link', () => {
    const { html } = renderEmail({
      greeting: 'Hi there,',
      paragraphs: ['Body.'],
      cta: { label: 'Verify', url: 'https://thesportyway.com/verify' },
    });

    expect(html).toContain('<a href="https://thesportyway.com/verify"');
    expect(html).toContain('Verify</a>');
  });

  test('allows http links on loopback host localhost', () => {
    const { html } = renderEmail({
      greeting: 'Hi there,',
      paragraphs: ['Body.'],
      cta: { label: 'Reset', url: 'http://localhost:5173/reset-password?token=abc' },
    });

    expect(html).toContain('<a href="http://localhost:5173/reset-password?token=abc"');
    expect(html).toContain('Reset</a>');
  });

  test('allows http links on loopback host 127.0.0.1', () => {
    const { html } = renderEmail({
      greeting: 'Hi there,',
      paragraphs: ['Body.'],
      cta: { label: 'Go', url: 'http://127.0.0.1:4000/x' },
    });

    expect(html).toContain('<a href="http://127.0.0.1:4000/x"');
    expect(html).toContain('Go</a>');
  });

  test('rejects http links on non-loopback hosts', () => {
    const { html } = renderEmail({
      greeting: 'Hi there,',
      paragraphs: ['Body.'],
      cta: { label: 'Click', url: 'http://evil.example.com/x' },
    });

    expect(html).not.toContain('<a href="http://evil.example.com/x"');
    expect(html).toContain('Click:');
    expect(html).toContain('http://evil.example.com/x');
  });

  test('javascript: scheme is still always rejected', () => {
    const { html } = renderEmail({
      greeting: 'Hi there,',
      paragraphs: ['Body.'],
      cta: { label: 'Hack', url: 'javascript:alert(1)' },
    });

    expect(html).not.toMatch(/<a href="javascript:/i);
    expect(html).toContain('Hack:');
    expect(html).toContain('javascript:alert(1)');
  });

  test('rejects http://localhost.evil.com (substring match regression lock)', () => {
    const { html } = renderEmail({
      greeting: 'Hi there,',
      paragraphs: ['Body.'],
      cta: { label: 'Visit', url: 'http://localhost.evil.com/x' },
    });

    expect(html).not.toContain('<a href="http://localhost.evil.com');
    expect(html).toContain('Visit:');
    expect(html).toContain('http://localhost.evil.com/x');
  });

  test('rejects http://127.0.0.1.evil.com (substring match regression lock)', () => {
    const { html } = renderEmail({
      greeting: 'Hi there,',
      paragraphs: ['Body.'],
      cta: { label: 'Visit', url: 'http://127.0.0.1.evil.com/x' },
    });

    expect(html).not.toContain('<a href="http://127.0.0.1.evil.com');
    expect(html).toContain('Visit:');
    expect(html).toContain('http://127.0.0.1.evil.com/x');
  });

  test('rejects http://evil-localhost.com (substring match regression lock)', () => {
    const { html } = renderEmail({
      greeting: 'Hi there,',
      paragraphs: ['Body.'],
      cta: { label: 'Visit', url: 'http://evil-localhost.com/x' },
    });

    expect(html).not.toContain('<a href="http://evil-localhost.com');
    expect(html).toContain('Visit:');
    expect(html).toContain('http://evil-localhost.com/x');
  });

  test('rejects http://localhost@evil.com (hostname is evil.com, not localhost)', () => {
    const { html } = renderEmail({
      greeting: 'Hi there,',
      paragraphs: ['Body.'],
      cta: { label: 'Visit', url: 'http://localhost@evil.com/x' },
    });

    // The userinfo segment before @ is not the hostname; hostname is evil.com
    expect(html).not.toContain('<a href="http://localhost@evil.com');
    expect(html).toContain('Visit:');
    expect(html).toContain('http://localhost@evil.com/x');
  });

  test('allows http://evil.com@localhost:5173 (hostname is localhost)', () => {
    const { html } = renderEmail({
      greeting: 'Hi there,',
      paragraphs: ['Body.'],
      cta: { label: 'Visit', url: 'http://evil.com@localhost:5173/x' },
    });

    // Userinfo (evil.com) is before @ so hostname is localhost; link is valid
    expect(html).toContain('<a href="http://evil.com@localhost:5173/x"');
    expect(html).toContain('Visit</a>');
  });
});
