function identityId(series, playerId) {
  const id = String(playerId);
  return String(
    (series.playerMerges || []).find((merge) => String(merge.fromPlayerId) === id)?.toPlayerId || id
  );
}
function identityIds(series, playerId) {
  const canonical = identityId(series, playerId);
  return [
    canonical,
    ...(series.playerMerges || [])
      .filter((merge) => String(merge.toPlayerId) === canonical)
      .map((merge) => String(merge.fromPlayerId)),
  ];
}
function identityGames(games, series, players = []) {
  if (!series.playerMerges?.length) return games;
  const names = new Map(players.map((player) => [String(player._id), player.displayName]));
  return games.map((document) => {
    const game = document.toObject?.() || document;
    return {
      ...game,
      events: (game.events || []).map((event) => ({
        ...event,
        playerId: event.playerId ? identityId(series, event.playerId) : event.playerId,
      })),
      ...Object.fromEntries(
        ['home', 'away'].flatMap((side) => [
          [
            `${side}RosterSnapshot`,
            (game[`${side}RosterSnapshot`] || []).map((player) => {
              const id = identityId(series, player._id || player.id);
              return { ...player, _id: id, displayName: names.get(id) || player.displayName };
            }),
          ],
          [
            `${side}StartingLineupPlayerIds`,
            (game[`${side}StartingLineupPlayerIds`] || []).map((id) => identityId(series, id)),
          ],
        ])
      ),
    };
  });
}
module.exports = { identityId, identityIds, identityGames };
