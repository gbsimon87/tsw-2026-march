export const gameCardFixture = {
  gameUrl: '/games/g1',
  teamName: 'TSW Blue',
  opponent: 'Falcons',
  teamLogo: { url: 'https://example.com/team-logo.png' },
  teamColors: ['#112233', '#d4af37', '#38bdf8'],
  recap: {
    playedAt: '2026-03-12T00:00:00.000Z',
    statusLabel: 'Final',
    team: { name: 'TSW Blue', points: 70 },
    opponent: { name: 'Falcons', points: 61 },
    teamStats: {
      points: 70,
      reb: 10,
      ast: 12,
      fg2: { percentage: 50 },
      fg3: { percentage: 40 },
      ft: { percentage: 75 },
    },
    topPerformers: [
      {
        playerId: 'p1',
        displayName: 'Jordan Miles',
        points: 24,
        reb: 8,
        ast: 5,
      },
    ],
  },
};

export const playerCardFixture = {
  playerUrl: '/teams/t1/players/p1',
  playerName: 'Jordan Miles',
  teamName: 'TSW Blue',
  playerImage: null,
  teamLogo: { url: 'https://example.com/team-logo.png' },
  teamColors: ['#112233', '#d4af37', '#38bdf8'],
  jerseyNumber: 7,
  summary: {
    pointsPerGame: 12,
    reboundsPerGame: 5,
    assistsPerGame: 4,
  },
};

export const teamCardFixture = {
  teamUrl: '/teams/t1',
  teamName: 'TSW Blue',
  teamLogo: { url: 'https://example.com/team-logo.png' },
  teamColors: ['#112233', '#d4af37', '#38bdf8'],
  summary: {
    gamesCount: 12,
    points: 88,
    fg2: { percentage: 50 },
    fg3: { percentage: 40 },
    ft: { percentage: 75 },
  },
};

export const recapFixture = gameCardFixture.recap;
