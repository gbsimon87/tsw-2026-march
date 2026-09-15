// The game card's display shape, built from a public game payload.
//
// This mirrors the server's buildGameCardSnapshot (feed.service.js) field for
// field, so a card rendered straight off a loaded game and one rendered from a
// persisted feed post are the same object. It was previously inlined in
// GameDetailPage; the social kit needs the same shape, and two copies of a
// snapshot contract is how a shared image and a feed post drift apart.
export function buildGameCardFromPayload(data) {
  const game = data?.game;
  if (!game?.id) return null;

  const isDualTeam = game.trackingMode === 'dual_team';
  const participantName = (side) => data?.participants?.[side]?.displayName || side;

  return {
    gameId: game.id,
    gameUrl: `/games/${game.id}`,
    teamId: data?.team?.id ?? null,
    teamName: isDualTeam
      ? `${participantName('home')} vs ${participantName('away')}`
      : (data?.team?.name ?? null),
    teamLogo: isDualTeam ? (data?.participants?.home?.logo ?? null) : (data?.team?.logo ?? null),
    teamColors: data?.team?.colors ?? [],
    opponent: isDualTeam ? null : data?.recap?.opponent?.name || game.opponent || null,
    participants: isDualTeam ? data.participants : null,
    recap: data?.recap,
  };
}
