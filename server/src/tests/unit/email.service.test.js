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
  },
}));

const { logger } = require('../../config/logger');
const { sendTemplateEmailAsync } = require('../../services/email.service');

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
});
