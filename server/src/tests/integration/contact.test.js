const request = require('supertest');
const { createApp } = require('../../app');
const { sendTemplateEmailAsync } = require('../../services/email.service');

jest.mock('../../services/email.service', () => ({
  sendTemplateEmailAsync: jest.fn(),
}));

describe('contact routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('sends a contact form email', async () => {
    const app = createApp();

    const response = await request(app)
      .post('/api/v1/contact')
      .set('Origin', 'http://localhost:5173')
      .send({
        name: 'Local Test',
        email: 'local.test@example.com',
        role: 'coach',
        clubName: 'Eastside Hoops',
        interest: 'league-setup',
        message: 'Local contact form test.',
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    // OPT-020: dispatched off the request path via the fire-and-forget variant.
    expect(sendTemplateEmailAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        replyTo: 'local.test@example.com',
        fallbackLabel: 'contact_form',
        subject: 'Contact form: Local Test (Eastside Hoops)',
        text: expect.stringContaining('Email: local.test@example.com'),
      })
    );
  });

  test('escapes HTML in free-text fields for the html email body (OPT-024)', async () => {
    const app = createApp();

    const response = await request(app)
      .post('/api/v1/contact')
      .set('Origin', 'http://localhost:5173')
      .send({
        name: '<img src=x onerror=alert(1)>',
        email: 'attacker@example.com',
        role: 'coach',
        clubName: 'Club & <b>Bold</b>',
        interest: 'league-setup',
        message: '<script>alert("xss")</script>',
      });

    expect(response.status).toBe(200);
    const call = sendTemplateEmailAsync.mock.calls[0][0];

    // The html body must not contain the raw markup...
    expect(call.html).not.toContain('<img src=x onerror=alert(1)>');
    expect(call.html).not.toContain('<script>alert("xss")</script>');
    expect(call.html).not.toContain('<b>Bold</b>');
    // ...it must contain the escaped form instead.
    expect(call.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(call.html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    expect(call.html).toContain('Club &amp; &lt;b&gt;Bold&lt;/b&gt;');

    // The plaintext body is untouched (no markup risk there).
    expect(call.text).toContain('Name: <img src=x onerror=alert(1)>');
  });

  test('rejects invalid contact form payloads', async () => {
    const app = createApp();

    const response = await request(app)
      .post('/api/v1/contact')
      .set('Origin', 'http://localhost:5173')
      .send({
        name: '',
        email: 'not-an-email',
        role: 'coach',
        clubName: 'Eastside Hoops',
        interest: 'league-setup',
      });

    expect(response.status).toBe(400);
    expect(sendTemplateEmailAsync).not.toHaveBeenCalled();
  });
});
