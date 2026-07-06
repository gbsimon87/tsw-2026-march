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
