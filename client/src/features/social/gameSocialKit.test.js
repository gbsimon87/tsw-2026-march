import { describe, expect, it } from 'vitest';

import { buildGameSocialKit, buildKitReadme } from './gameSocialKit';

const ORIGIN = 'https://thesportyway.com';

function row(overrides = {}) {
  return {
    playerId: 'p1',
    displayName: 'Jordan Blake',
    points: 28,
    reb: 9,
    ast: 6,
    stl: 1,
    blk: 0,
    fg2m: 5,
    fg2a: 9,
    fg3m: 4,
    fg3a: 7,
    ...overrides,
  };
}

function oneSidedGame(overrides = {}) {
  return {
    game: {
      id: 'g1',
      status: 'completed',
      trackingMode: 'one_sided',
      opponent: 'Falcons',
      completedAt: '2026-09-12T20:45:00.000Z',
      ...overrides.game,
    },
    team: {
      id: 't1',
      name: 'TSW Blue',
      colors: ['#123456'],
      players: [{ id: 'p1', jerseyNumber: 7, avatarUrl: 'https://cdn.example/p1.png' }],
    },
    boxScore: { players: [row()], teamTotals: { points: 70 } },
    gameSummary: { teamPoints: 70, opponentPoints: 61, hasOpponentScore: true },
    recap: {
      statusLabel: 'Final',
      playedAt: '2026-09-12T20:45:00.000Z',
      team: { name: 'TSW Blue', points: 70 },
      opponent: { name: 'Falcons', points: 61 },
      teamStats: {
        points: 70,
        fg2: { percentage: 48 },
        fg3: { percentage: 31 },
        ft: { percentage: 71 },
        reb: 34,
        ast: 18,
      },
      topPerformers: [{ playerId: 'p1', displayName: 'Jordan Blake', points: 28, reb: 9, ast: 6 }],
    },
    ...overrides,
  };
}

describe('buildGameSocialKit', () => {
  it('builds nothing for a game that has not finished', () => {
    // A mid-game score is not a result, and the kit exists to make finished
    // games postable.
    expect(buildGameSocialKit(oneSidedGame({ game: { status: 'in_progress' } }))).toBeNull();
    expect(buildGameSocialKit(oneSidedGame({ game: { status: 'scheduled' } }))).toBeNull();
    expect(buildGameSocialKit(null)).toBeNull();
  });

  it('numbers the templated slides and leaves everything else outside the run', () => {
    const kit = buildGameSocialKit(oneSidedGame(), { origin: ORIGIN });

    expect(kit.title).toBe('TSW Blue vs Falcons');
    expect(kit.assets.map((asset) => asset.fileName)).toEqual([
      '01-tsw-blue-vs-falcons-2026-09-12-slide-result.png',
      '02-tsw-blue-vs-falcons-2026-09-12-slide-comparison.png',
      '03-tsw-blue-vs-falcons-2026-09-12-slide-performers.png',
      '04-tsw-blue-vs-falcons-2026-09-12-slide-cta.png',
      'tsw-blue-vs-falcons-2026-09-12-jordan-blake.png',
      'tsw-blue-vs-falcons-2026-09-12-story.png',
    ]);
    // The carousel is the templated slides only. A player's own card is what
    // gets sent to the player, not slide five of a feed post.
    expect(kit.carousel.map((asset) => asset.position)).toEqual([1, 2, 3, 4]);
    expect(kit.assets.at(-1).format).toBe('story');
  });

  it('reorders and removes slides without touching a slide-specific path', () => {
    const kit = buildGameSocialKit(oneSidedGame(), {
      origin: ORIGIN,
      slideKinds: ['performers', 'result'],
    });

    expect(kit.carousel.map((asset) => asset.id)).toEqual(['slide-performers', 'slide-result']);
    expect(kit.carousel[0].fileName).toMatch(/^01-.*slide-performers\.png$/);
    expect(kit.assets.some((asset) => asset.id === 'slide-cta')).toBe(false);
  });

  it('drops a slide the game cannot honestly support', () => {
    const data = oneSidedGame();
    delete data.recap.teamStats;
    delete data.recap.topPerformers;

    const kit = buildGameSocialKit(data, { origin: ORIGIN });
    expect(kit.carousel.map((asset) => asset.id)).toEqual(['slide-result', 'slide-cta']);
  });

  it('tags the link for the platform it is going to', () => {
    expect(buildGameSocialKit(oneSidedGame(), { origin: ORIGIN }).attributionUrl).toBe(
      `${ORIGIN}/games/g1?utm_source=instagram&utm_medium=organic_social&utm_campaign=launch_2026q3`
    );
    expect(
      buildGameSocialKit(oneSidedGame(), { origin: ORIGIN, destination: 'tiktok' }).attributionUrl
    ).toContain('utm_source=tiktok');
  });

  it('carries the caption and per-asset alt text', () => {
    const kit = buildGameSocialKit(oneSidedGame(), { origin: ORIGIN });

    expect(kit.caption).toContain('FINAL: TSW Blue 70–61 Falcons');
    expect(kit.caption).toContain(kit.attributionUrl);
    // A slide describes itself; a single card is described by the rank 4
    // assistant from its own snapshot.
    expect(kit.assets[0].altText).toBe('Final score slide: TSW Blue 70, Falcons 61.');
    expect(kit.assets[1].altText).toContain('Team totals slide: TSW Blue 70 points');
    expect(kit.assets.find((asset) => asset.type === 'player_game_card').altText).toContain(
      'Game stat card for Jordan Blake #7'
    );
  });

  it('builds the performer card from the full box-score row, not the recap summary', () => {
    // recap.topPerformers is trimmed to points/reb/ast; pickContextStat needs
    // the shooting splits, which only the real row carries.
    const kit = buildGameSocialKit(oneSidedGame(), { origin: ORIGIN });
    const card = kit.assets.find((asset) => asset.type === 'player_game_card').card;

    expect(card.stats.fg3m).toBe(4);
    expect(card.jerseyNumber).toBe(7);
    expect(card.playerImage).toEqual({ url: 'https://cdn.example/p1.png' });
    expect(card.resultLabel).toBe('W 70–61');
  });

  it('skips a top performer with nothing recorded', () => {
    const data = oneSidedGame();
    // The recap's topPerformers is derived from the box score on the server, so
    // a game where nobody scored is empty on both.
    data.boxScore.players = [row({ points: 0, reb: 0, ast: 0, stl: 0, blk: 0 })];
    data.recap.topPerformers = [
      { playerId: 'p1', displayName: 'Jordan Blake', points: 0, reb: 0, ast: 0 },
    ];

    const kit = buildGameSocialKit(data, { origin: ORIGIN });
    expect(kit.assets.some((asset) => asset.type === 'player_game_card')).toBe(false);
    // The carousel and the story still stand on their own.
    expect(kit.assets.map((asset) => asset.id)).toEqual([
      'slide-result',
      'slide-comparison',
      'slide-cta',
      'story',
    ]);
  });

  it('caps the performer cards so the carousel stays a carousel', () => {
    const data = oneSidedGame();
    const names = ['A Player', 'B Player', 'C Player', 'D Player'];
    data.boxScore.players = names.map((displayName, index) =>
      row({ playerId: `p${index}`, displayName, points: 20 - index })
    );
    data.recap.topPerformers = names.map((displayName, index) => ({
      playerId: `p${index}`,
      displayName,
      points: 20 - index,
      reb: 1,
      ast: 1,
    }));

    const kit = buildGameSocialKit(data, { origin: ORIGIN, maxPerformers: 2 });
    expect(kit.assets.filter((asset) => asset.type === 'player_game_card')).toHaveLength(2);
  });

  it('finds a dual-team performer on whichever side they played', () => {
    const away = row({ playerId: 'p9', displayName: 'Sam Reed', points: 31 });
    const data = {
      game: {
        id: 'g2',
        status: 'completed',
        trackingMode: 'dual_team',
        completedAt: '2026-09-13T20:00:00.000Z',
      },
      participants: {
        home: { displayName: 'Demo Lions', players: [{ id: 'p1', jerseyNumber: 4 }] },
        away: { displayName: 'Demo Bears', players: [{ id: 'p9', jerseyNumber: 11 }] },
      },
      boxScore: {
        home: { players: [row()], totals: { points: 70 } },
        away: { players: [away], totals: { points: 74 } },
      },
      gameSummary: { homePoints: 70, awayPoints: 74 },
      recap: {
        statusLabel: 'Final',
        playedAt: '2026-09-13T20:00:00.000Z',
        home: { name: 'Demo Lions', points: 70 },
        away: { name: 'Demo Bears', points: 74 },
        topPerformers: [{ playerId: 'p9', displayName: 'Sam Reed', points: 31, reb: 4, ast: 2 }],
      },
    };

    const kit = buildGameSocialKit(data, { origin: ORIGIN });
    const card = kit.assets.find((asset) => asset.type === 'player_game_card').card;

    expect(kit.title).toBe('Demo Lions vs Demo Bears');
    expect(card.teamName).toBe('Demo Bears');
    expect(card.opponentName).toBe('Demo Lions');
    // Their team lost by four; the card must say so rather than pick the home
    // side's result.
    expect(card.resultLabel).toBe('W 74–70');
  });

  it('contributes no link from a local http origin', () => {
    // The same rule the Instagram hand-off follows: a non-HTTPS attribution URL
    // is rejected by the server, so a dev kit ships without one.
    const kit = buildGameSocialKit(oneSidedGame(), { origin: 'http://localhost:5173' });
    expect(kit.attributionUrl).toBe('');
    expect(kit.caption).not.toContain('Full box score');
  });
});

describe('buildKitReadme', () => {
  it('carries the caption, every image’s alt text, the order and the link', () => {
    const kit = buildGameSocialKit(oneSidedGame(), { origin: ORIGIN });
    const readme = buildKitReadme(kit);

    expect(readme).toContain('TSW social kit — TSW Blue vs Falcons, 2026-09-12');
    expect(readme).toContain(kit.caption);
    expect(readme).toContain(kit.attributionUrl);
    for (const asset of kit.assets) {
      expect(readme).toContain(`${asset.fileName} — ${asset.altText}`);
    }
    expect(readme).toContain('1. 01-tsw-blue-vs-falcons-2026-09-12-slide-result.png');
    // The consent reminder is the point of shipping a text file at all.
    expect(readme).toMatch(/Check consent/);
  });

  it('says so plainly when a game has no shareable link', () => {
    const kit = buildGameSocialKit(oneSidedGame(), { origin: 'http://localhost:5173' });
    expect(buildKitReadme(kit)).toContain('(no HTTPS link available for this game)');
  });
});
