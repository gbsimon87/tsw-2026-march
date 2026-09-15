import { describe, expect, it } from 'vitest';

import {
  TSW_HANDLE,
  buildCaptionKit,
  buildCardAttributionUrl,
  resolveCaptionSource,
} from './captionAssistant';

const ORIGIN = 'https://dev.thesportyway.com';

const gameCardPost = {
  type: 'game_card',
  gameCard: {
    gameUrl: '/games/g1',
    teamName: 'TSW Blue',
    opponent: 'Falcons',
    recap: {
      statusLabel: 'Final',
      team: { name: 'TSW Blue', points: 70 },
      opponent: { name: 'Falcons', points: 61 },
      topPerformers: [{ displayName: 'Jordan Blake', points: 28, reb: 9, ast: 6 }],
    },
  },
};

const playerGameCardPost = {
  type: 'player_game_card',
  playerGameCard: {
    gameUrl: '/games/g1',
    playerName: 'Jordan Blake',
    jerseyNumber: 7,
    teamName: 'TSW Blue',
    opponentName: 'Falcons',
    resultLabel: 'W 70–61',
    playedOn: '2026-09-12T19:30:00.000Z',
    imageFallback: 'player',
    stats: { points: 28, reb: 9, ast: 6, stl: 1, blk: 0, fg2m: 5, fg2a: 9, fg3m: 4, fg3a: 7 },
  },
};

const milestonePost = {
  type: 'milestone',
  milestoneCard: {
    gameUrl: '/games/g9',
    family: 'single_game_feat',
    label: 'Triple-double',
    playerName: 'Jordan Blake',
    jerseyNumber: 7,
    playerAvatarUrl: 'https://cdn.example/avatar.png',
    teamName: 'TSW Blue',
    gameTitle: 'TSW Blue vs Falcons',
    achievedAt: '2026-09-12T19:30:00.000Z',
  },
};

describe('buildCardAttributionUrl', () => {
  it('resolves whichever provenance page the card names', () => {
    expect(buildCardAttributionUrl(gameCardPost.gameCard, ORIGIN)).toBe(`${ORIGIN}/games/g1`);
    expect(buildCardAttributionUrl({ playerUrl: '/teams/t1/players/p1' }, ORIGIN)).toBe(
      `${ORIGIN}/teams/t1/players/p1`
    );
    expect(buildCardAttributionUrl({ teamUrl: '/teams/t1' }, ORIGIN)).toBe(`${ORIGIN}/teams/t1`);
  });

  it('contributes nothing from a local http origin or a card with no page', () => {
    expect(buildCardAttributionUrl(gameCardPost.gameCard, 'http://localhost:5173')).toBe('');
    // League player and league team snapshots carry no URL at all.
    expect(buildCardAttributionUrl({ playerUrl: null, teamUrl: null }, ORIGIN)).toBe('');
    expect(buildCardAttributionUrl(null, ORIGIN)).toBe('');
  });
});

describe('resolveCaptionSource', () => {
  it('sniffs the card field when the post carries no type', () => {
    expect(resolveCaptionSource({ milestoneCard: { label: 'First career three' } })).toMatchObject({
      type: 'milestone',
    });
  });

  it('returns null for a post that is not an exportable card', () => {
    expect(resolveCaptionSource({ type: 'image', image: { url: 'x' } })).toBeNull();
    expect(resolveCaptionSource({ type: 'game_card', gameCard: null })).toBeNull();
    expect(resolveCaptionSource(null)).toBeNull();
  });
});

describe('buildCaptionKit — game card', () => {
  const kit = buildCaptionKit(gameCardPost, { attributionUrl: `${ORIGIN}/games/g1` });

  it('leads with the result and proves it with the recorded top performer', () => {
    expect(kit.hook).toBe('FINAL: TSW Blue 70–61 Falcons');
    expect(kit.context).toBe('Jordan Blake led the box score with 28 PTS, 9 REB, 6 AST.');
  });

  it('assembles hook, proof, conversation, link and tags in that order', () => {
    expect(kit.caption).toBe(
      [
        'FINAL: TSW Blue 70–61 Falcons',
        'Jordan Blake led the box score with 28 PTS, 9 REB, 6 AST.',
        'Which run decided this one? Save the box score.',
        '',
        `Full box score → ${ORIGIN}/games/g1`,
        '',
        TSW_HANDLE,
        '#TSWBlue #Falcons #Basketball #TheSportyWay',
      ].join('\n')
    );
  });

  it('claims no stat it was not given', () => {
    const noRecap = buildCaptionKit({
      type: 'game_card',
      gameCard: { ...gameCardPost.gameCard, recap: { statusLabel: 'Final' } },
    });
    expect(noRecap.context).toBe('Every number came from a live-tracked box score.');
    expect(noRecap.caption).not.toMatch(/PTS/);
  });

  it('describes the card for a screen reader', () => {
    expect(kit.altText).toBe(
      'Final score card: TSW Blue 70, Falcons 61. Top performer Jordan Blake with 28 PTS, 9 REB, 6 AST.'
    );
  });
});

describe('buildCaptionKit — player game card', () => {
  const kit = buildCaptionKit(playerGameCardPost);

  it('puts the stat line in the hook and the game around it', () => {
    expect(kit.hook).toBe('Jordan Blake: 28 PTS, 9 REB, 6 AST');
    // pickContextStat picks the four threes; value-first so it reads as English.
    expect(kit.context).toBe('4 3-pointers in TSW Blue vs Falcons on Sep 12 (W 70–61).');
  });

  it('drops the clauses a one-sided or undated game never recorded', () => {
    const bare = buildCaptionKit({
      type: 'player_game_card',
      playerGameCard: {
        ...playerGameCardPost.playerGameCard,
        opponentName: null,
        resultLabel: null,
        playedOn: null,
      },
    });
    expect(bare.context).toBe('4 3-pointers in TSW Blue.');
    expect(bare.altText).not.toMatch(/result|Date unavailable/);
  });

  it('says in alt text when a crest stands in for a player photo', () => {
    const crest = buildCaptionKit({
      type: 'player_game_card',
      playerGameCard: { ...playerGameCardPost.playerGameCard, imageFallback: 'team_logo' },
    });
    expect(crest.altText).toMatch(/team crest, not a photo of the player/);
    expect(kit.altText).not.toMatch(/crest/);
  });
});

describe('buildCaptionKit — season cards', () => {
  it('labels a player card as season averages', () => {
    const kit = buildCaptionKit({
      type: 'player_card',
      playerCard: {
        playerName: 'Jordan Blake',
        teamName: 'TSW Blue',
        playerUrl: '/teams/t1/players/p1',
        imageFallback: 'player',
        summary: {
          gamesCount: 6,
          pointsPerGame: 18.24,
          reboundsPerGame: 7.5,
          assistsPerGame: 4,
        },
      },
    });
    expect(kit.hook).toBe('Jordan Blake: 18.2 PPG, 7.5 RPG, 4.0 APG');
    expect(kit.context).toBe('Season averages across 6 tracked games for TSW Blue.');
  });

  it('reports only the shooting splits a team card actually carries', () => {
    const kit = buildCaptionKit({
      type: 'team_card',
      teamCard: {
        teamName: 'TSW Blue',
        teamUrl: '/teams/t1',
        summary: {
          gamesCount: 1,
          points: 70,
          fg2: { percentage: 48 },
          fg3: { percentage: null },
          ft: { percentage: 71 },
        },
      },
    });
    expect(kit.hook).toBe('TSW Blue: 70 points in 1 tracked game');
    expect(kit.context).toBe('Shooting 48% from two, 71% at the line.');
    expect(kit.context).not.toMatch(/--|from three/);
  });
});

describe('buildCaptionKit — milestone', () => {
  const kit = buildCaptionKit(milestonePost);

  it('leads with the achievement, as the card does', () => {
    expect(kit.hook).toBe('Triple-double — Jordan Blake #7');
    expect(kit.context).toBe('Recorded for TSW Blue in TSW Blue vs Falcons on Sep 12.');
    expect(kit.question).toBe('Seen a better line this season?');
  });

  it('adds no portrait note when a real avatar was snapshotted', () => {
    expect(kit.altText).toBe(
      'Milestone card: Triple-double for Jordan Blake #7 of TSW Blue, recorded in TSW Blue vs Falcons on Sep 12.'
    );
  });
});

describe('hashtags and handles', () => {
  it('keeps 3-5 tags, two of them specific to the card', () => {
    const kit = buildCaptionKit(playerGameCardPost);
    expect(kit.hashtags).toEqual(['#JordanBlake', '#TSWBlue', '#Basketball', '#TheSportyWay']);
  });

  it('drops a name that cannot make a usable tag rather than emitting a broken one', () => {
    const kit = buildCaptionKit({
      type: 'team_card',
      teamCard: { teamName: '76', summary: { gamesCount: 0, points: 0 } },
    });
    // An all-digit tag is invalid on Instagram, so only the standing tags remain.
    expect(kit.hashtags).toEqual(['#Basketball', '#TheSportyWay']);
    expect(kit.hashtags.length).toBeGreaterThanOrEqual(3);
  });

  it('strips accents rather than emitting a tag Instagram will split', () => {
    const kit = buildCaptionKit({
      type: 'team_card',
      teamCard: { teamName: 'Málaga Unicaja', summary: { gamesCount: 1, points: 80 } },
    });
    expect(kit.hashtags[0]).toBe('#MalagaUnicaja');
  });

  it('tags only TSW, because no card records a player or team handle yet', () => {
    expect(buildCaptionKit(gameCardPost).handles).toEqual([TSW_HANDLE]);
  });

  it('uses a recorded handle when one finally exists, and never invents one', () => {
    const kit = buildCaptionKit({
      type: 'team_card',
      teamCard: {
        teamName: 'TSW Blue',
        teamInstagramHandle: '@tswblue',
        summary: { gamesCount: 1, points: 70 },
      },
    });
    expect(kit.handles).toEqual([TSW_HANDLE, '@tswblue']);

    const invalid = buildCaptionKit({
      type: 'team_card',
      teamCard: {
        teamName: 'TSW Blue',
        teamInstagramHandle: 'not a handle',
        summary: { gamesCount: 1, points: 70 },
      },
    });
    expect(invalid.handles).toEqual([TSW_HANDLE]);
  });
});

describe('operator copy', () => {
  it('lets a written caption lead and keeps the rest of the formula', () => {
    const kit = buildCaptionKit(gameCardPost, { lead: 'What a finish.' });
    expect(kit.hook).toBe('What a finish.');
    expect(kit.caption.startsWith('What a finish.\nJordan Blake led')).toBe(true);
    expect(kit.caption).not.toMatch(/FINAL:/);
  });

  it('drops trailing blocks rather than cutting a caption mid-word', () => {
    const kit = buildCaptionKit(gameCardPost, {
      lead: 'x'.repeat(2190),
      attributionUrl: `${ORIGIN}/games/g1`,
    });
    expect(kit.caption.length).toBeLessThanOrEqual(2200);
    expect(kit.caption).not.toMatch(/#Basketball/);
    expect(kit.caption.startsWith('x'.repeat(2190))).toBe(true);
  });
});
