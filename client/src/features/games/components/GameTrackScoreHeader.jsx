import teamPlaceholder from '../../../assets/placeholders/team-logo-placeholder.svg';
import { CloudinaryImage } from '../../media/CloudinaryImage';
import gameConstants from '../constants';

const { TEAM_SIDES } = gameConstants;

function formatPercentage(made, attempts) {
  if (!attempts) return '--';
  return `${((made / attempts) * 100).toFixed(1)}%`;
}

export function GameTrackScoreHeader({
  game,
  gameSummary,
  activeSide,
  onChangeActiveSide,
  isDualTeam,
  participantsBySide,
  team,
  boxScore,
  clockControls = null,
}) {
  if (isDualTeam) {
    return (
      <div
        className="grid grid-cols-2 border-b border-slate-200 bg-white shadow-sm lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]"
        data-testid="game-track-score-header"
      >
        {[TEAM_SIDES.HOME, TEAM_SIDES.AWAY].map((side) => {
          const isActive = activeSide === side;
          const participant = participantsBySide[side];
          const points = side === TEAM_SIDES.HOME ? gameSummary.homePoints : gameSummary.awayPoints;
          const sideLabel =
            participant?.displayName || (side === TEAM_SIDES.HOME ? 'Home' : 'Away');

          return (
            <button
              key={side}
              type="button"
              onClick={() => onChangeActiveSide(side)}
              aria-label={`Select ${sideLabel}`}
              aria-pressed={isActive}
              className={`flex min-w-0 items-center gap-2 px-3 py-3 transition sm:gap-3 sm:px-4 sm:py-4 ${
                side === TEAM_SIDES.HOME
                  ? 'col-start-1 row-start-1 justify-start border-r border-slate-200 lg:border-r-0'
                  : 'col-start-2 row-start-1 justify-end lg:col-start-3'
              } ${isActive ? 'bg-indigo-600 text-white' : 'bg-white text-slate-800 hover:bg-slate-50'}`}
            >
              {side === TEAM_SIDES.HOME ? (
                <>
                  <CloudinaryImage
                    src={participant?.logo?.url || teamPlaceholder}
                    alt={sideLabel}
                    width={36}
                    height={36}
                    loading="lazy"
                    decoding="async"
                    srcSetWidths={[36, 72, 108]}
                    sizes="36px"
                    className="h-8 w-8 shrink-0 rounded-full border border-slate-200 bg-white object-cover sm:h-9 sm:w-9"
                  />
                  <div className="min-w-0 text-left">
                    <p
                      className={`truncate text-[11px] font-semibold sm:text-xs ${isActive ? 'text-indigo-200' : 'text-slate-500'}`}
                    >
                      {sideLabel}
                    </p>
                    <p className="text-2xl font-black tabular-nums sm:text-3xl">{points || 0}</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="min-w-0 text-right">
                    <p
                      className={`truncate text-[11px] font-semibold sm:text-xs ${isActive ? 'text-indigo-200' : 'text-slate-500'}`}
                    >
                      {sideLabel}
                    </p>
                    <p className="text-2xl font-black tabular-nums sm:text-3xl">{points || 0}</p>
                  </div>
                  <CloudinaryImage
                    src={participant?.logo?.url || teamPlaceholder}
                    alt={sideLabel}
                    width={36}
                    height={36}
                    loading="lazy"
                    decoding="async"
                    srcSetWidths={[36, 72, 108]}
                    sizes="36px"
                    className="h-8 w-8 shrink-0 rounded-full border border-slate-200 bg-white object-cover sm:h-9 sm:w-9"
                  />
                </>
              )}
            </button>
          );
        })}
        {clockControls ? (
          <div className="col-span-2 col-start-1 row-start-2 border-t border-slate-200 bg-slate-950 p-2 lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:border-x lg:border-t-0 lg:p-0">
            {clockControls}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="border-b border-slate-200 bg-white px-4 py-4 shadow-sm"
      data-testid="game-track-score-header"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{game.title}</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-[auto_minmax(15rem,auto)] sm:items-center lg:grid-cols-[auto_minmax(15rem,auto)_1fr]">
        <div className="flex items-end gap-4">
          <div className="flex items-center gap-2">
            <CloudinaryImage
              src={team?.logo?.url || teamPlaceholder}
              alt={team?.name || 'Team'}
              width={32}
              height={32}
              loading="lazy"
              decoding="async"
              srcSetWidths={[32, 64, 96]}
              sizes="32px"
              className="h-8 w-8 shrink-0 rounded-full border border-slate-200 bg-white object-cover"
            />
            <div>
              <p className="text-xs font-medium text-slate-500">{team?.name || 'Team'}</p>
              <p className="text-3xl font-bold text-slate-900">{gameSummary.teamPoints || 0}</p>
            </div>
          </div>
          <span className="mb-1 text-xl font-bold text-slate-300">—</span>
          <div>
            <p className="text-xs font-medium text-slate-500">Opponent</p>
            <p className="text-3xl font-bold text-slate-900">{gameSummary.opponentPoints || 0}</p>
          </div>
        </div>
        {clockControls}
        <div className="flex flex-wrap gap-3 text-xs text-slate-500 sm:col-span-2 lg:col-span-1">
          <span>
            REB <strong className="text-slate-700">{boxScore.teamTotals?.reb || 0}</strong>
          </span>
          <span>
            AST <strong className="text-slate-700">{boxScore.teamTotals?.ast || 0}</strong>
          </span>
          <span>
            FG2%{' '}
            <strong className="text-slate-700">
              {formatPercentage(boxScore.teamTotals?.fg2m, boxScore.teamTotals?.fg2a)}
            </strong>
          </span>
          <span>
            FG3%{' '}
            <strong className="text-slate-700">
              {formatPercentage(boxScore.teamTotals?.fg3m, boxScore.teamTotals?.fg3a)}
            </strong>
          </span>
        </div>
      </div>
    </div>
  );
}
