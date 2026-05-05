import playerPlaceholder from '../../assets/placeholders/player-placeholder.svg';
import teamPlaceholder from '../../assets/placeholders/team-logo-placeholder.svg';
import leaguePlaceholder from '../../assets/placeholders/league-logo-placeholder.svg';

export function getPlayerCardImage(playerCard) {
  return playerCard?.playerImage?.url || playerCard?.teamLogo?.url || playerPlaceholder;
}

export function getPlayerHeaderImage(data) {
  return data?.player?.image?.url || data?.team?.logo?.url || playerPlaceholder;
}

export function getTeamCardImage(teamCard) {
  return teamCard?.teamLogo?.url || teamPlaceholder;
}

export function getGameCardLogo(gameCard) {
  return gameCard?.teamLogo?.url || null;
}

export function getTeamHeaderImage(team) {
  return team?.logo?.url || teamPlaceholder;
}

export function getGameHeaderImage(team) {
  return team?.logo?.url || teamPlaceholder;
}

export function getLeagueHeaderImage(league) {
  return league?.logo?.url || leaguePlaceholder;
}
