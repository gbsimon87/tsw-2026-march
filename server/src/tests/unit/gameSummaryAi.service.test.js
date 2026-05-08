const { env } = require('../../config/env');
const { logger } = require('../../config/logger');

jest.mock('../../config/logger', () => ({
  logger: {
    warn: jest.fn(),
  },
}));

const {
  buildFallbackSummary,
  buildPersistedGameSummary,
  buildPromptPayload,
} = require('../../modules/games/gameSummaryAi.service');

describe('game summary AI service', () => {
  const originalApiKey = env.OPENAI_API_KEY;
  const originalModel = env.OPENAI_GAME_SUMMARY_MODEL;
  const originalFetch = global.fetch;

  const game = {
    _id: 'game-1',
    gameContext: 'league',
    title: 'Away Squad at Home Squad',
    status: 'completed',
  };
  const recap = {
    home: { name: 'Home Squad', points: 72 },
    away: { name: 'Away Squad', points: 68 },
    topPerformers: [
      { displayName: 'Alex Carter', points: 24, reb: 8, ast: 4, teamName: 'Home Squad' },
      { displayName: 'Jordan Lee', points: 19, reb: 5, ast: 6, teamName: 'Away Squad' },
    ],
    keyMoments: [{ playerName: 'Alex Carter', statLabel: '3PT Make', statType: 'FG3_MADE' }],
  };

  afterEach(() => {
    env.OPENAI_API_KEY = originalApiKey;
    env.OPENAI_GAME_SUMMARY_MODEL = originalModel;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    logger.warn.mockClear();
  });

  test('builds a deterministic fallback recap from score and top performers', () => {
    const text = buildFallbackSummary(game, recap);

    expect(text).toContain('Home Squad');
    expect(text).toContain('72-68');
    expect(text).toContain('Alex Carter');
  });

  test('formats away wins with winner-first score in fallback recap', () => {
    const text = buildFallbackSummary(game, {
      ...recap,
      home: { name: 'Home Squad', points: 68 },
      away: { name: 'Away Squad', points: 72 },
    });

    expect(text).toContain('Away Squad beat Home Squad, 72-68');
  });

  test('uses OpenAI response text when available', async () => {
    env.OPENAI_API_KEY = 'test-key';
    env.OPENAI_GAME_SUMMARY_MODEL = 'gpt-5.4-mini';
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            output_text:
              'Home Squad held off Away Squad, 72-68, with Alex Carter setting the tone in a composed finish.',
          }),
      })
    );

    const summary = await buildPersistedGameSummary(game, { recap, boxScore: {} });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(summary).toEqual(
      expect.objectContaining({
        source: 'ai',
        provider: 'openai',
        model: 'gpt-5.4-mini',
      })
    );
    expect(summary.text).toContain('Home Squad');
  });

  test('saves fallback when OpenAI key is missing', async () => {
    env.OPENAI_API_KEY = '';
    global.fetch = jest.fn();

    const summary = await buildPersistedGameSummary(game, { recap, boxScore: {} });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(summary.source).toBe('fallback');
    expect(summary.text).toContain('72-68');
  });

  test('saves fallback when OpenAI request fails', async () => {
    env.OPENAI_API_KEY = 'test-key';
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve('bad') })
    );

    const summary = await buildPersistedGameSummary(game, { recap, boxScore: {} });

    expect(summary.source).toBe('fallback');
    expect(summary.text).toContain('72-68');
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  test('prompt payload includes score, performers, and key moments', () => {
    const payload = buildPromptPayload(game, recap, {});

    expect(payload.score.homePoints).toBe(72);
    expect(payload.topPerformers[0].displayName).toBe('Alex Carter');
    expect(payload.keyMoments[0].statLabel).toBe('3PT Make');
  });
});
