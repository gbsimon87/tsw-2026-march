import { FoulTypeChoices } from '../FoulTypeChoices';
import { FOUL_TYPES, isFoulStat } from '../../foulStats';
import { DesktopEntryHeader } from './DesktopEntryHeader';
import { desktopButton, DesktopPlayerRow } from './DesktopShotEntry';

export const DESKTOP_QUICK_STATS = [
  { type: 'FT_MADE', label: 'Free throw made' },
  { type: 'FT_MISS', label: 'Free throw missed' },
  { type: 'OREB', label: 'Offensive rebound' },
  { type: 'DREB', label: 'Defensive rebound' },
  { type: 'STL', label: 'Steal' },
  { type: 'BLK', label: 'Block' },
  { type: 'TOV', label: 'Turnover' },
  { type: 'FOUL', label: 'Foul' },
];

export function DesktopQuickStatEntry({
  entry,
  playersBySide,
  teams,
  onCommit,
  onBasketChange,
  onFoulTypeChange,
  onChangeFoulType,
  horizontal,
  onCancel,
  disabled,
}) {
  const label =
    DESKTOP_QUICK_STATS.find((stat) => stat.type === entry.statType)?.label ||
    FOUL_TYPES.find((foul) => foul.type === entry.statType)?.label;
  return (
    <section aria-label={`Record ${label}`} className="space-y-4">
      <DesktopEntryHeader
        title={label}
        eyebrow="Quick stat"
        actions={
          <>
            {isFoulStat(entry.statType) && entry.foulTypeChosen && (
              <button
                type="button"
                disabled={disabled}
                onClick={onChangeFoulType}
                className={desktopButton}
              >
                Change type
              </button>
            )}
            <button type="button" disabled={disabled} onClick={onCancel} className={desktopButton}>
              Cancel
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-500">
          {isFoulStat(entry.statType) && !entry.foulTypeChosen
            ? 'Choose a foul type.'
            : 'Choose a player to record this event.'}
        </p>
      </DesktopEntryHeader>
      {isFoulStat(entry.statType) && !entry.foulTypeChosen ? (
        <FoulTypeChoices onSelect={onFoulTypeChange} disabled={disabled} />
      ) : (
        <>
          {entry.statType.startsWith('FT_') && (
            <label className="block text-sm font-semibold">
              Basket
              <select
                aria-label="Free throw basket"
                value={entry.hoopSide}
                disabled={disabled}
                onChange={(e) => onBasketChange(e.target.value)}
                className={`${desktopButton} mt-1 block w-full bg-white`}
              >
                <option value="south">{horizontal ? 'Left' : 'Bottom'} basket</option>
                <option value="north">{horizontal ? 'Right' : 'Top'} basket</option>
              </select>
            </label>
          )}
          <div className="space-y-3">
            {['home', 'away'].map((side) => (
              <DesktopPlayerRow
                key={side}
                teamName={teams[side]?.displayName || side}
                players={playersBySide[side] || []}
                onSelect={(playerId) => onCommit(playerId, side)}
                disabled={disabled}
                action={`Record ${label.toLowerCase()}`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
