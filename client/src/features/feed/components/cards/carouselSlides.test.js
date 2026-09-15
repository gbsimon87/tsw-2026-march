import { describe, expect, it } from 'vitest';

import { SLIDE_KINDS, buildCarouselSlides } from './carouselSlides';

const ORIGIN = 'https://thesportyway.com';

function dualTeamGame(overrides = {}) {
  return {
    game: {
      id: 'g1',
      status: 'completed',
      trackingMode: 'dual_team',
      completedAt: '2026-09-12T20:45:00.000Z',
    },
    team: { colors: ['#1B4332'] },
    recap: {
      statusLabel: 'Final',
      playedAt: '2026-09-12T20:45:00.000Z',
      home: { name: 'Demo Lions', points: 74 },
      away: { name: 'Demo Bears', points: 70 },
      homeStats: {
        points: 74,
        fg2: { percentage: 52.4 },
        fg3: { percentage: 31 },
        ft: { percentage: 71 },
        reb: 34,
        ast: 18,
      },
      awayStats: {
        points: 70,
        fg2: { percentage: 48 },
        fg3: { percentage: 36 },
        ft: { percentage: 64 },
        reb: 30,
        ast: 21,
      },
      topPerformers: [
        { displayName: 'Jordan Blake', points: 28, reb: 9, ast: 6, teamName: 'Demo Lions' },
        { displayName: 'Sam Reed', points: 21, reb: 4, ast: 2, teamName: 'Demo Bears' },
      ],
      ...overrides.recap,
    },
    ...overrides,
  };
}

function oneSidedGame() {
  return {
    game: {
      id: 'g2',
      status: 'completed',
      trackingMode: 'one_sided',
      opponent: 'Falcons',
      completedAt: '2026-09-12T20:45:00.000Z',
    },
    team: { name: 'TSW Blue', colors: [] },
    recap: {
      statusLabel: 'Final',
      playedAt: '2026-09-12T20:45:00.000Z',
      team: { name: 'TSW Blue', points: 70 },
      opponent: { name: 'Falcons', points: 61 },
      teamStats: {
        points: 70,
        fg2: { percentage: 48 },
        fg3: { percentage: null },
        ft: { percentage: 71 },
        reb: 34,
        ast: 18,
      },
      topPerformers: [{ displayName: 'Jordan Blake', points: 28, reb: 9, ast: 6 }],
    },
  };
}

describe('buildCarouselSlides', () => {
  it('builds nothing for a game that has not finished', () => {
    expect(buildCarouselSlides({ game: { status: 'in_progress' } })).toEqual([]);
    expect(buildCarouselSlides(null)).toEqual([]);
  });

  it('returns the four slides in order by default', () => {
    expect(buildCarouselSlides(dualTeamGame()).map((slide) => slide.kind)).toEqual(SLIDE_KINDS);
  });

  it('honours a caller-supplied order and selection', () => {
    expect(
      buildCarouselSlides(dualTeamGame(), { only: ['cta', 'result'] }).map((slide) => slide.kind)
    ).toEqual(['cta', 'result']);
  });

  describe('result', () => {
    it('names both sides with their scores', () => {
      const [result] = buildCarouselSlides(dualTeamGame(), { only: ['result'] });

      expect(result.home).toEqual({ name: 'Demo Lions', points: 74 });
      expect(result.away).toEqual({ name: 'Demo Bears', points: 70 });
      expect(result.kicker).toBe('FINAL');
      expect(result.altText).toBe('Final score slide: Demo Lions 74, Demo Bears 70.');
    });

    it('reads a one-sided game as team versus opponent', () => {
      const [result] = buildCarouselSlides(oneSidedGame(), { only: ['result'] });
      expect(result.home.name).toBe('TSW Blue');
      expect(result.away).toEqual({ name: 'Falcons', points: 61 });
    });
  });

  describe('comparison', () => {
    it('puts both sides side by side, rounding the percentages', () => {
      const [comparison] = buildCarouselSlides(dualTeamGame(), { only: ['comparison'] });

      expect(comparison.columns).toHaveLength(2);
      expect(comparison.label).toBe('Team comparison');
      expect(comparison.columns[0].rows).toEqual([
        { label: '2PT', value: '52%' },
        { label: '3PT', value: '31%' },
        { label: 'FT', value: '71%' },
        { label: 'REB', value: 34 },
        { label: 'AST', value: 18 },
      ]);
    });

    it('shows one column, and says so, for a game that tracked one roster', () => {
      // Standalone games intentionally track one roster (docs/ideas.md
      // Constraints), so there is no opponent breakdown to compare against.
      const [comparison] = buildCarouselSlides(oneSidedGame(), { only: ['comparison'] });

      expect(comparison.columns).toHaveLength(1);
      expect(comparison.label).toBe('Team totals');
      expect(comparison.kicker).toBe('TEAM TOTALS');
      // The untracked 3PT split is dropped, not shown as a dash.
      expect(comparison.columns[0].rows.map((row) => row.label)).toEqual([
        '2PT',
        'FT',
        'REB',
        'AST',
      ]);
    });

    it('is dropped entirely when no team stats were recorded', () => {
      const data = dualTeamGame();
      delete data.recap.homeStats;
      delete data.recap.awayStats;

      expect(buildCarouselSlides(data, { only: ['comparison'] })).toEqual([]);
    });
  });

  describe('performers', () => {
    it('takes the top three and writes each line once', () => {
      const [performers] = buildCarouselSlides(dualTeamGame(), { only: ['performers'] });

      expect(performers.rows.map((row) => row.line)).toEqual([
        '28 PTS, 9 REB, 6 AST',
        '21 PTS, 4 REB, 2 AST',
      ]);
      expect(performers.altText).toContain('Jordan Blake 28 PTS, 9 REB, 6 AST');
    });

    it('drops a line of zeroes rather than calling it a top performance', () => {
      const data = dualTeamGame();
      data.recap.topPerformers = [{ displayName: 'Nobody', points: 0, reb: 0, ast: 0 }];

      expect(buildCarouselSlides(data, { only: ['performers'] })).toEqual([]);
    });

    it('is dropped when the recap names nobody', () => {
      const data = dualTeamGame();
      data.recap.topPerformers = [];

      expect(buildCarouselSlides(data, { only: ['performers'] })).toEqual([]);
    });
  });

  describe('cta', () => {
    it('shows the link without its scheme, because it is read and typed', () => {
      const [cta] = buildCarouselSlides(dualTeamGame(), {
        only: ['cta'],
        attributionUrl: `${ORIGIN}/games/g1?utm_source=instagram`,
      });

      expect(cta.link).toBe('thesportyway.com/games/g1?utm_source=instagram');
      expect(cta.altText).toContain('thesportyway.com/games/g1');
    });

    it('still stands up with no link at all', () => {
      const [cta] = buildCarouselSlides(dualTeamGame(), { only: ['cta'] });

      expect(cta.link).toBeNull();
      expect(cta.headline).toBeTruthy();
      expect(cta.altText).not.toContain('Link:');
    });
  });
});
