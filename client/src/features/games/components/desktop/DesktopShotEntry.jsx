import { DesktopEntryHeader } from './DesktopEntryHeader';

export const desktopButton =
  'min-h-10 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-50';

export const desktopStatColor = (type) =>
  ({
    OREB: '!border-blue-200 !bg-blue-50 !text-blue-900 hover:!bg-blue-100',
    DREB: '!border-cyan-200 !bg-cyan-50 !text-cyan-900 hover:!bg-cyan-100',
    STL: '!border-teal-200 !bg-teal-50 !text-teal-900 hover:!bg-teal-100',
    BLK: '!border-violet-200 !bg-violet-50 !text-violet-900 hover:!bg-violet-100',
    TOV: '!border-orange-200 !bg-orange-50 !text-orange-900 hover:!bg-orange-100',
    FOUL: '!border-amber-200 !bg-amber-50 !text-amber-900 hover:!bg-amber-100',
    FT_MADE: '!border-emerald-200 !bg-emerald-50 !text-emerald-900 hover:!bg-emerald-100',
    FT_MISS: '!border-rose-200 !bg-rose-50 !text-rose-900 hover:!bg-rose-100',
  })[type] || '';

function shortPlayerName(name = '') {
  const [first, ...rest] = name.trim().split(/\s+/);
  return rest.length ? `${first[0]}. ${rest.join(' ')}` : first;
}

export function DesktopPlayerRow({
  players,
  teamName,
  selectedPlayerId,
  onSelect,
  disabled,
  action,
}) {
  return (
    <div role="group" aria-label={`${teamName} on-court players`}>
      <p className="mb-1 text-xs font-semibold text-slate-500">{teamName}</p>
      <div className="grid grid-cols-5 gap-1">
        {players.map((player) => (
          <button
            key={player.id}
            type="button"
            disabled={disabled}
            aria-label={
              action
                ? `${action} for ${player.jerseyNumber != null ? `number ${player.jerseyNumber}, ` : ''}${player.displayName}`
                : player.displayName
            }
            title={player.displayName}
            aria-pressed={action ? undefined : selectedPlayerId === player.id}
            onClick={() => onSelect(player.id)}
            className={`${desktopButton} !px-1 !py-2 min-w-0 ${!action && selectedPlayerId === player.id ? '!border-emerald-800 !bg-emerald-800 !text-white hover:!bg-emerald-900' : 'bg-white text-slate-800'}`}
          >
            <span className="block text-lg font-black tabular-nums">
              {player.jerseyNumber ?? '—'}
            </span>
            <span className="block truncate text-[11px] leading-4">
              {shortPlayerName(player.displayName)}
            </span>
          </button>
        ))}
      </div>
      {!players.length && <p className="text-xs text-slate-500">No eligible players on court.</p>}
    </div>
  );
}

export function DesktopShotEntry({
  shot,
  zoneLabel,
  points,
  teams,
  playersBySide,
  selectedSide,
  selectedPlayerId,
  onSelectPlayer,
  onCommit,
  onChangeLocation,
  onOtherStat,
  onCancel,
  disabled,
}) {
  return (
    <section aria-label="Record shot" className="space-y-4">
      <DesktopEntryHeader
        title={zoneLabel}
        actions={
          <>
            <button
              type="button"
              disabled={disabled}
              onClick={onChangeLocation}
              className={desktopButton}
            >
              Change location
            </button>
            <button type="button" disabled={disabled} onClick={onCancel} className={desktopButton}>
              Cancel
            </button>
          </>
        }
      />
      <div className="space-y-3">
        {['home', 'away'].map((side) => (
          <DesktopPlayerRow
            key={side}
            teamName={teams[side]?.displayName || side}
            players={playersBySide[side] || []}
            selectedPlayerId={selectedSide === side ? selectedPlayerId : null}
            onSelect={(id) => onSelectPlayer(side, id)}
            disabled={disabled}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={disabled || !selectedPlayerId || !shot}
          onClick={() => onCommit('made')}
          className={`${desktopButton} !border-transparent !bg-[#1B4332] !text-white hover:!bg-[#245c44] hover:shadow-md`}
        >
          Made · +{points}
        </button>
        <button
          type="button"
          disabled={disabled || !selectedPlayerId || !shot}
          onClick={() => onCommit('miss')}
          className={`${desktopButton} !border-transparent !bg-[#B42318] !text-white hover:!bg-[#912013] hover:shadow-md`}
        >
          Missed
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1.5" aria-label="Other actions at this location">
        {[
          ['OREB', 'Off. rebound'],
          ['DREB', 'Def. rebound'],
          ['STL', 'Steal'],
          ['BLK', 'Block'],
          ['TOV', 'Turnover'],
          ['FOUL', 'Foul'],
        ].map(([type, label]) => (
          <button
            key={type}
            type="button"
            disabled={disabled || !selectedPlayerId}
            onClick={() => onOtherStat(type)}
            className={`${desktopButton} !px-2 !text-xs ${desktopStatColor(type)}`}
          >
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}
