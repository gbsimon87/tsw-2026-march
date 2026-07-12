const leaguesService = require('../leagues/leagues.service');
const { toCsvSection, joinSections } = require('../../utils/csv');

// --- formatting helpers -----------------------------------------------------

function slugify(value, fallback = 'export') {
  const slug = String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// One-decimal average, always a string so empty/NaN never leak into a cell.
function avg(value) {
  return Number.isFinite(value) ? value.toFixed(1) : '0.0';
}

function pct(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '';
}

// --- column definitions -----------------------------------------------------

const STANDINGS_COLUMNS = [
  { key: 'rank', header: 'Rank' },
  { key: 'teamName', header: 'Team' },
  { key: 'gamesPlayed', header: 'GP' },
  { key: 'wins', header: 'W' },
  { key: 'losses', header: 'L' },
  { key: 'record', header: 'Record' },
  { key: 'winPct', header: 'Win %' },
  { key: 'pointsFor', header: 'PF' },
  { key: 'pointsAgainst', header: 'PA' },
  { key: 'pointDiff', header: 'Diff' },
];

const PLAYER_COLUMNS = [
  { key: 'player', header: 'Player' },
  { key: 'team', header: 'Team' },
  { key: 'games', header: 'GP' },
  { key: 'points', header: 'PTS' },
  { key: 'ppg', header: 'PPG' },
  { key: 'reb', header: 'REB' },
  { key: 'rpg', header: 'RPG' },
  { key: 'ast', header: 'AST' },
  { key: 'apg', header: 'APG' },
  { key: 'stl', header: 'STL' },
  { key: 'blk', header: 'BLK' },
  { key: 'tov', header: 'TOV' },
  { key: 'foul', header: 'PF' },
  { key: 'fgMade', header: 'FGM' },
  { key: 'fgAttempted', header: 'FGA' },
  { key: 'fgPct', header: 'FG%' },
  { key: 'fantasyScore', header: 'Fantasy' },
];

const LEADER_COLUMNS = [
  { key: 'rank', header: 'Rank' },
  { key: 'player', header: 'Player' },
  { key: 'team', header: 'Team' },
  { key: 'games', header: 'GP' },
  { key: 'ppg', header: 'PPG' },
  { key: 'rpg', header: 'RPG' },
  { key: 'apg', header: 'APG' },
  { key: 'fantasyScore', header: 'Fantasy' },
];

const GAME_COLUMNS = [
  { key: 'date', header: 'Date' },
  { key: 'status', header: 'Status' },
  { key: 'homeTeam', header: 'Home' },
  { key: 'homePoints', header: 'Home Pts' },
  { key: 'awayTeam', header: 'Away' },
  { key: 'awayPoints', header: 'Away Pts' },
  { key: 'title', header: 'Title' },
];

// Per-game per-player box-score line (one row per player per completed game).
const GAMELOG_COLUMNS = [
  { key: 'date', header: 'Date' },
  { key: 'team', header: 'Team' },
  { key: 'opponent', header: 'Opponent' },
  { key: 'player', header: 'Player' },
  { key: 'points', header: 'PTS' },
  { key: 'reb', header: 'REB' },
  { key: 'ast', header: 'AST' },
  { key: 'stl', header: 'STL' },
  { key: 'blk', header: 'BLK' },
  { key: 'tov', header: 'TOV' },
  { key: 'foul', header: 'PF' },
  { key: 'ftm', header: 'FTM' },
  { key: 'fta', header: 'FTA' },
  { key: 'fg2m', header: '2PM' },
  { key: 'fg2a', header: '2PA' },
  { key: 'fg3m', header: '3PM' },
  { key: 'fg3a', header: '3PA' },
];

const MY_PROFILE_COLUMNS = [
  { key: 'league', header: 'League' },
  { key: 'team', header: 'Team' },
  { key: 'role', header: 'Role' },
  { key: 'jersey', header: 'Jersey' },
  { key: 'position', header: 'Position' },
  { key: 'games', header: 'GP' },
  { key: 'ppg', header: 'PPG' },
  { key: 'rpg', header: 'RPG' },
  { key: 'apg', header: 'APG' },
];

// --- row builders -----------------------------------------------------------

function standingsRows(rows) {
  return rows.map((row, index) => ({
    rank: index + 1,
    teamName: row.teamName,
    gamesPlayed: row.gamesPlayed,
    wins: row.wins,
    losses: row.losses,
    record: row.record,
    winPct: avg((row.winPct ?? 0) * 100),
    pointsFor: row.pointsFor,
    pointsAgainst: row.pointsAgainst,
    pointDiff: row.pointDiff,
  }));
}

function playerRows(statRows, teamNameById) {
  return statRows
    .map((row) => {
      const scores = leaguesService.deriveLeaguePlayerScores(row);
      return {
        player: row.displayName,
        team: teamNameById.get(String(row.leagueTeamId)) ?? '',
        games: row.gamesCount,
        points: row.points,
        ppg: avg(scores.ppg),
        reb: row.reb,
        rpg: avg(scores.rpg),
        ast: row.ast,
        apg: avg(scores.apg),
        stl: row.stl,
        blk: row.blk ?? 0,
        tov: row.tov,
        foul: row.foul,
        fgMade: scores.fgMade,
        fgAttempted: scores.fgAttempted,
        fgPct: pct(scores.fgPercentage),
        fantasyScore: avg(scores.fantasyScore),
        _ppgNum: scores.ppg,
      };
    })
    .sort((a, b) => a.player.localeCompare(b.player));
}

function leaderRows(playerRowsList) {
  return [...playerRowsList]
    .sort((a, b) => b._ppgNum - a._ppgNum)
    .map((row, index) => ({
      rank: index + 1,
      player: row.player,
      team: row.team,
      games: row.games,
      ppg: row.ppg,
      rpg: row.rpg,
      apg: row.apg,
      fantasyScore: row.fantasyScore,
    }));
}

function gameRows(rows) {
  return rows.map((row) => ({
    date: row.completedAt ?? row.scheduledAt ?? '',
    status: row.status,
    homeTeam: row.homeTeamName ?? '',
    homePoints: row.homePoints ?? '',
    awayTeam: row.awayTeamName ?? '',
    awayPoints: row.awayPoints ?? '',
    title: row.title ?? '',
  }));
}

function boxScorePlayerRow(line, { date, team, opponent, teamId }) {
  return {
    date,
    team,
    opponent,
    player: line.displayName,
    points: line.points ?? 0,
    reb: line.reb ?? 0,
    ast: line.ast ?? 0,
    stl: line.stl ?? 0,
    blk: line.blk ?? 0,
    tov: line.tov ?? 0,
    foul: line.foul ?? 0,
    ftm: line.ftm ?? 0,
    fta: line.fta ?? 0,
    fg2m: line.fg2m ?? 0,
    fg2a: line.fg2a ?? 0,
    fg3m: line.fg3m ?? 0,
    fg3a: line.fg3a ?? 0,
    _teamId: teamId,
  };
}

// Replay each completed game's frozen boxScore into per-player rows. Handles both
// one-sided ({ players, teamTotals }) and dual-team ({ home, away }) shapes. When
// `onlyTeamId` is set, keeps only that team's lines (team-scoped export).
function gameLogRows(games, teamsById, { onlyTeamId = null } = {}) {
  const rows = [];

  for (const game of games) {
    if (game.status !== 'completed' || !game.boxScore) {
      continue;
    }
    const date = game.completedAt ?? game.scheduledAt ?? '';
    const homeId = game.homeLeagueTeamId ? String(game.homeLeagueTeamId) : null;
    const awayId = game.awayLeagueTeamId ? String(game.awayLeagueTeamId) : null;
    const nameOf = (id) => teamsById.get(String(id)) ?? '';

    if (game.trackingMode === 'dual_team') {
      for (const [sideId, otherId, players] of [
        [homeId, awayId, game.boxScore.home?.players],
        [awayId, homeId, game.boxScore.away?.players],
      ]) {
        for (const line of players || []) {
          rows.push(
            boxScorePlayerRow(line, {
              date,
              team: nameOf(sideId),
              opponent: nameOf(otherId),
              teamId: sideId,
            })
          );
        }
      }
    } else {
      const trackedId = game.trackedLeagueTeamId ? String(game.trackedLeagueTeamId) : homeId;
      const opponentId = trackedId === homeId ? awayId : homeId;
      for (const line of game.boxScore.players || []) {
        rows.push(
          boxScorePlayerRow(line, {
            date,
            team: nameOf(trackedId),
            opponent: nameOf(opponentId),
            teamId: trackedId,
          })
        );
      }
    }
  }

  // `_teamId` is only a join key; toCsv emits GAMELOG_COLUMNS keys only, so it is
  // never serialized and needs no stripping.
  return onlyTeamId ? rows.filter((row) => String(row._teamId) === String(onlyTeamId)) : rows;
}

// --- exports ----------------------------------------------------------------

// MySporty: one section listing every claimed profile with its season averages.
// A user may hold many LeaguePlayer profiles; assembleLeagueProfilesForUser
// returns one entry each. Empty profiles still yield a header row (200, not 404).
async function buildMySportyCsv(userId) {
  const profiles = await leaguesService.assembleLeagueProfilesForUser(userId);
  const rows = profiles.map((profile) => ({
    league: profile.league?.name ?? '',
    team: profile.team?.name ?? '',
    role: profile.memberRoleLabel ?? '',
    jersey: profile.jerseyNumber ?? '',
    position: profile.position ?? '',
    games: profile.summary?.gamesCount ?? 0,
    ppg: avg(profile.summary?.pointsPerGame),
    rpg: avg(profile.summary?.reboundsPerGame),
    apg: avg(profile.summary?.assistsPerGame),
  }));

  const csv = toCsvSection('My Player Profiles', rows, MY_PROFILE_COLUMNS);
  return { filename: `mysporty-stats-${today()}.csv`, csv };
}

async function buildLeagueCsv(userId, leagueId, seasonId, dataset) {
  const { league } = await leaguesService.assertLeagueManagerOrOwner(userId, leagueId);

  const [standings, statRows, seasonGames] = await Promise.all([
    leaguesService.getLeagueStandings(leagueId, seasonId),
    leaguesService.getLeaguePlayerStats(leagueId, seasonId),
    leaguesService.getLeagueSeasonGames(leagueId, seasonId),
  ]);

  const teamNameById = new Map(seasonGames.teams.map((team) => [String(team._id), team.name]));
  const players = playerRows(statRows, teamNameById);

  const want = (name) => dataset === 'all' || dataset === name;
  const csv = joinSections([
    want('standings') && toCsvSection('Standings', standingsRows(standings), STANDINGS_COLUMNS),
    want('leaders') && toCsvSection('Statistical Leaders', leaderRows(players), LEADER_COLUMNS),
    want('players') && toCsvSection('Player Stats', players, PLAYER_COLUMNS),
    want('games') && toCsvSection('Games', gameRows(seasonGames.rows), GAME_COLUMNS),
    want('gamelogs') &&
      toCsvSection('Game Logs', gameLogRows(seasonGames.games, teamNameById), GAMELOG_COLUMNS),
  ]);

  const filename = `${slugify(league.name, 'league')}-${dataset}-${today()}.csv`;
  return { filename, csv };
}

async function buildTeamCsv(userId, leagueId, leagueTeamId, seasonId) {
  const { league } = await leaguesService.assertTeamManagerOrOwner(userId, leagueId, leagueTeamId);

  const [statRows, seasonGames] = await Promise.all([
    leaguesService.getLeaguePlayerStats(leagueId, seasonId),
    leaguesService.getLeagueSeasonGames(leagueId, seasonId),
  ]);

  const teamNameById = new Map(seasonGames.teams.map((team) => [String(team._id), team.name]));
  const teamName = teamNameById.get(String(leagueTeamId)) ?? 'team';

  const teamStatRows = statRows.filter((row) => String(row.leagueTeamId) === String(leagueTeamId));
  const players = playerRows(teamStatRows, teamNameById);
  const teamGames = seasonGames.rows.filter(
    (row) =>
      String(row.homeLeagueTeamId) === String(leagueTeamId) ||
      String(row.awayLeagueTeamId) === String(leagueTeamId)
  );

  const csv = joinSections([
    toCsvSection(`${teamName} — Player Stats`, players, PLAYER_COLUMNS),
    toCsvSection(`${teamName} — Games`, gameRows(teamGames), GAME_COLUMNS),
    toCsvSection(
      `${teamName} — Game Logs`,
      gameLogRows(seasonGames.games, teamNameById, { onlyTeamId: leagueTeamId }),
      GAMELOG_COLUMNS
    ),
  ]);

  const filename = `${slugify(league.name, 'league')}-${slugify(teamName, 'team')}-${today()}.csv`;
  return { filename, csv };
}

module.exports = {
  buildMySportyCsv,
  buildLeagueCsv,
  buildTeamCsv,
};
