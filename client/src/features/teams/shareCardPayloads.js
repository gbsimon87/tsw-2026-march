export function buildTeamCardPreview(data) {
  return {
    teamUrl: `/teams/${data.team.id}`,
    teamName: data.team.name,
    teamLogo: data.team.logo ?? null,
    summary: {
      gamesCount: data.summary.gamesCount,
      points: data.summary.points,
      fg2: data.summary.fg2,
      fg3: data.summary.fg3,
      ft: data.summary.ft,
    },
  };
}

export function buildPlayerCardPreview(data) {
  return {
    playerUrl: `/teams/${data.team.id}/players/${data.player.id}`,
    playerName: data.player.displayName,
    teamName: data.team.name,
    playerImage: data.player.image ?? null,
    teamLogo: data.team.logo ?? null,
    summary: {
      pointsPerGame: data.summary.pointsPerGame,
      reboundsPerGame: data.summary.reboundsPerGame,
      assistsPerGame: data.summary.assistsPerGame,
    },
  };
}
