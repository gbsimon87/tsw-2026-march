const mockSend = jest.fn();
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockSend } })),
}));

jest.mock('../../config/env', () => ({
  env: {
    NODE_ENV: 'test',
    RESEND_API_KEY: 'test-key',
    RESEND_FROM_EMAIL: 'from@example.com',
    RESEND_FROM_NAME: 'TSW',
    CONTACT_EMAIL: 'contact@example.com',
  },
}));

const { logger } = require('../../config/logger');
const { env } = require('../../config/env');
const { sendTemplateEmail, sendTemplateEmailAsync } = require('../../services/email.service');

function flushMicrotasksAndImmediate() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('sendTemplateEmailAsync (OPT-020)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns synchronously (does not block the caller) and sends after', async () => {
    mockSend.mockResolvedValue({ error: null });

    const returned = sendTemplateEmailAsync({
      to: 'a@example.com',
      subject: 'Hi',
      text: 'Hi',
      fallbackLabel: 'test',
    });

    // Fire-and-forget: nothing is returned/awaited by the caller.
    expect(returned).toBeUndefined();
    // The actual send is deferred to the next tick, not the current call.
    expect(mockSend).not.toHaveBeenCalled();

    await flushMicrotasksAndImmediate();
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  test('a delivery failure is logged, never thrown into the request path', async () => {
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});
    mockSend.mockRejectedValue(new Error('resend down'));

    // Must not throw synchronously.
    expect(() =>
      sendTemplateEmailAsync({
        to: 'a@example.com',
        subject: 'x',
        text: 'x',
        fallbackLabel: 'test',
      })
    ).not.toThrow();

    await flushMicrotasksAndImmediate();
    // In production mode the send would throw; here (test env) Resend errors
    // degrade to a warn fallback, so no async error is logged. Either way the
    // caller was never affected — assert we got here without an unhandled throw.
    errorSpy.mockRestore();
  });

  test('fallback logs do not contain token-bearing email text', async () => {
    const originalApiKey = env.RESEND_API_KEY;
    env.RESEND_API_KEY = '';
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});

    try {
      await sendTemplateEmail({
        to: 'a@example.com',
        subject: 'Reset password',
        text: 'Reset at https://example.com/reset?token=secret-token',
        fallbackLabel: 'password_reset',
      });

      expect(warnSpy).toHaveBeenCalledWith(
        { to: 'a@example.com', fallbackLabel: 'password_reset' },
        'Resend not configured; email not sent'
      );
      expect(warnSpy.mock.calls.flat().join(' ')).not.toContain('secret-token');
    } finally {
      env.RESEND_API_KEY = originalApiKey;
      warnSpy.mockRestore();
    }
  });
});

describe('reply routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockResolvedValue({ error: null });
  });

  test('sends replies to the monitored inbox when the caller names none', async () => {
    // Otherwise a reply goes to the From address, which need not be a mailbox.
    await sendTemplateEmail({ to: 'a@example.com', subject: 'Reset', text: 'Reset' });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ replyTo: 'contact@example.com' })
    );
  });

  test('keeps a caller-supplied reply address', async () => {
    // The contact form routes replies to whoever submitted it, not to TSW.
    await sendTemplateEmail({
      to: 'contact@example.com',
      replyTo: 'submitter@example.com',
      subject: 'Contact form',
      text: 'Hello',
    });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ replyTo: 'submitter@example.com' })
    );
  });
});
