import teamPlaceholder from '../../../assets/placeholders/team-logo-placeholder.svg';
import { CloudinaryImage } from '../../media/CloudinaryImage';
import gameConstants from '../constants';
import { LiveScore } from './LiveScore';

const { TEAM_SIDES } = gameConstants;

// A landscape phone is short and wide, so the header uses the same single-row
// three-column shape `md` already gets - regardless of width - and trims the
// type and padding that only pay for themselves in portrait.
const HEADER_GRID_CLASS =
  'grid grid-cols-2 border-b border-slate-200 bg-white shadow-sm md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] landscape-compact:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]';
const SCORE_CELL_CLASS =
  'px-3 py-3 sm:gap-3 sm:px-4 sm:py-4 landscape-compact:gap-1.5 landscape-compact:px-2 landscape-compact:py-1';
const LOGO_CLASS =
  'h-8 w-8 shrink-0 rounded-full border border-slate-200 bg-white object-cover sm:h-9 sm:w-9 landscape-compact:h-6 landscape-compact:w-6';
const TEAM_LABEL_CLASS =
  'truncate text-[11px] font-semibold sm:text-xs landscape-compact:text-[10px]';
const SCORE_CLASS =
  'text-2xl font-black sm:text-3xl landscape-compact:text-xl landscape-compact:leading-tight';
// Row 2 on a portrait phone, but the middle column of one row everywhere the
// width allows it - which in landscape is always.
const CLOCK_CELL_CLASS =
  'col-span-2 col-start-1 row-start-2 border-t border-slate-200 bg-slate-950 p-2 md:col-span-1 md:col-start-2 md:row-start-1 md:border-x md:border-t-0 md:p-0 landscape-compact:col-span-1 landscape-compact:col-start-2 landscape-compact:row-start-1 landscape-compact:border-x landscape-compact:border-t-0 landscape-compact:p-0';

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
      <div className={HEADER_GRID_CLASS} data-testid="game-track-score-header">
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
              className={`flex min-w-0 items-center gap-2 transition ${SCORE_CELL_CLASS} ${
                side === TEAM_SIDES.HOME
                  ? 'col-start-1 row-start-1 justify-start border-r border-slate-200 md:border-r-0'
                  : 'col-start-2 row-start-1 justify-end text-right md:col-start-3'
              } ${isActive ? 'bg-[#141414] text-white' : 'bg-white text-slate-800 hover:bg-slate-50'}`}
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
                    className={LOGO_CLASS}
                  />
                  <div className="min-w-0 text-left">
                    <p
                      className={`${TEAM_LABEL_CLASS} ${isActive ? 'text-white/70' : 'text-slate-500'}`}
                    >
                      {sideLabel}
                    </p>
                    <p className={SCORE_CLASS}>
                      <LiveScore value={points} />
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="min-w-0 text-right">
                    <p
                      className={`${TEAM_LABEL_CLASS} ${isActive ? 'text-white/70' : 'text-slate-500'}`}
                    >
                      {sideLabel}
                    </p>
                    <p className={`text-right ${SCORE_CLASS}`}>
                      <LiveScore value={points} />
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
                    className={LOGO_CLASS}
                  />
                </>
              )}
            </button>
          );
        })}
        {clockControls ? <div className={CLOCK_CELL_CLASS}>{clockControls}</div> : null}
      </div>
    );
  }

  return (
    <div className={HEADER_GRID_CLASS} data-testid="game-track-score-header">
      <div
        className={`col-start-1 row-start-1 flex min-w-0 items-center gap-2 border-r border-slate-200 md:border-r-0 ${SCORE_CELL_CLASS}`}
      >
        <CloudinaryImage
          src={team?.logo?.url || teamPlaceholder}
          alt={team?.name || 'Team'}
          width={36}
          height={36}
          loading="lazy"
          decoding="async"
          srcSetWidths={[36, 72, 108]}
          sizes="36px"
          className={LOGO_CLASS}
        />
        <div className="min-w-0 text-left">
          <p className={`${TEAM_LABEL_CLASS} text-slate-500`}>{team?.name || 'Team'}</p>
          <p className={`${SCORE_CLASS} text-slate-900`}>
            <LiveScore value={gameSummary.teamPoints} />
          </p>
        </div>
      </div>

      <div
        className={`col-start-2 row-start-1 flex min-w-0 flex-col items-end justify-center text-right md:col-start-3 ${SCORE_CELL_CLASS}`}
      >
        <p className={`w-full text-right ${TEAM_LABEL_CLASS} text-slate-500`}>Opponent</p>
        <p className={`w-full text-right ${SCORE_CLASS} text-slate-900`}>
          <LiveScore value={gameSummary.opponentPoints} />
        </p>
      </div>

      {clockControls ? <div className={CLOCK_CELL_CLASS}>{clockControls}</div> : null}
    </div>
  );
}
