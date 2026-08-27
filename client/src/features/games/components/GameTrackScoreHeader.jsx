import teamPlaceholder from '../../../assets/placeholders/team-logo-placeholder.svg';
import { CloudinaryImage } from '../../media/CloudinaryImage';
import gameConstants from '../constants';

const { TEAM_SIDES } = gameConstants;

export function GameTrackScoreHeader({
  gameSummary,
  activeSide,
  onChangeActiveSide,
  isDualTeam,
  participantsBySide,
  team,
  clockControls = null,
}) {
  if (isDualTeam) {
    return (
      <div
        className="grid grid-cols-2 border-b border-slate-200 bg-white shadow-sm md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]"
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
                  ? 'col-start-1 row-start-1 justify-start border-r border-slate-200 md:border-r-0'
                  : 'col-start-2 row-start-1 justify-end text-right md:col-start-3'
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
                    <p className="text-right text-2xl font-black tabular-nums sm:text-3xl">
                      {points || 0}
                    </p>
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
          <div className="col-span-2 col-start-1 row-start-2 border-t border-slate-200 bg-slate-950 p-2 md:col-span-1 md:col-start-2 md:row-start-1 md:border-x md:border-t-0 md:p-0">
            {clockControls}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="grid grid-cols-2 border-b border-slate-200 bg-white shadow-sm md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]"
      data-testid="game-track-score-header"
    >
      <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-2 border-r border-slate-200 px-3 py-3 sm:gap-3 sm:px-4 sm:py-4 md:border-r-0">
        <CloudinaryImage
          src={team?.logo?.url || teamPlaceholder}
          alt={team?.name || 'Team'}
          width={36}
          height={36}
          loading="lazy"
          decoding="async"
          srcSetWidths={[36, 72, 108]}
          sizes="36px"
          className="h-8 w-8 shrink-0 rounded-full border border-slate-200 bg-white object-cover sm:h-9 sm:w-9"
        />
        <div className="min-w-0 text-left">
          <p className="truncate text-[11px] font-semibold text-slate-500 sm:text-xs">
            {team?.name || 'Team'}
          </p>
          <p className="text-2xl font-black tabular-nums text-slate-900 sm:text-3xl">
            {gameSummary.teamPoints || 0}
          </p>
        </div>
      </div>

      <div className="col-start-2 row-start-1 flex min-w-0 flex-col items-end justify-center px-3 py-3 text-right sm:px-4 sm:py-4 md:col-start-3">
        <p className="w-full truncate text-right text-[11px] font-semibold text-slate-500 sm:text-xs">
          Opponent
        </p>
        <p className="w-full text-right text-2xl font-black tabular-nums text-slate-900 sm:text-3xl">
          {gameSummary.opponentPoints || 0}
        </p>
      </div>

      {clockControls ? (
        <div className="col-span-2 col-start-1 row-start-2 border-t border-slate-200 bg-slate-950 p-2 md:col-span-1 md:col-start-2 md:row-start-1 md:border-x md:border-t-0 md:p-0">
          {clockControls}
        </div>
      ) : null}
    </div>
  );
}
