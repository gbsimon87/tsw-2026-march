import { DesktopEntryHeader } from './DesktopEntryHeader';
import { desktopButton, DesktopPlayerRow } from './DesktopShotEntry';

const titles = {
  assist: 'Who assisted?',
  rebound: 'Who got the rebound?',
  who_missed_shot: 'Who missed the shot?',
  who_turned_over: 'Who turned over the ball?',
  who_got_steal: 'Who got the steal?',
  who_was_fouled: 'Who was fouled?',
};
const saved = {
  assist: 'Basket',
  rebound: 'Miss',
  who_missed_shot: 'Event',
  who_turned_over: 'Steal',
  who_got_steal: 'Turnover',
  who_was_fouled: 'Foul',
};

export function DesktopFollowUpEntry({
  prompt,
  groups,
  teams,
  onSelect,
  onSkip,
  disabled,
  needsLocation,
  court,
  relatedShot,
  relatedZoneLabel,
  onChangeLocation,
  voiceControl,
  onUndo,
  canUndo,
  saving = false,
  primaryStatType,
}) {
  const primaryLabel =
    {
      OREB: 'Rebound',
      DREB: 'Rebound',
      BLK: 'Block',
      FT_MISS: 'Free throw miss',
      TECHNICAL_FOUL: 'Technical foul',
      FLAGRANT_FOUL: 'Flagrant foul',
    }[primaryStatType] || saved[prompt.kind];
  return (
    <section aria-label="Related event" className="space-y-4">
      <DesktopEntryHeader
        title={needsLocation ? 'Where was the missed shot?' : titles[prompt.kind]}
        actions={
          <button
            type="button"
            disabled={disabled}
            onClick={onSkip}
            aria-label="Skip this question"
            className={desktopButton}
          >
            Skip
          </button>
        }
      >
        <p role="status" className="text-xs font-semibold text-emerald-800">
          {saving ? 'Saving…' : `${primaryLabel} saved`}
        </p>
      </DesktopEntryHeader>
      {needsLocation ? (
        court
      ) : (
        <>
          {relatedShot && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
              <p className="text-sm text-slate-600">{relatedZoneLabel}</p>
              <button
                type="button"
                disabled={disabled}
                onClick={onChangeLocation}
                className={desktopButton}
              >
                Change location
              </button>
            </div>
          )}
          {voiceControl}
          {groups.map((group) => (
            <DesktopPlayerRow
              key={group.side || 'tracked'}
              teamName={teams[group.side]?.displayName || 'On court'}
              players={group.players}
              onSelect={onSelect}
              disabled={disabled}
              action={titles[prompt.kind]}
            />
          ))}
        </>
      )}
      {(prompt.kind === 'assist' || canUndo) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          {prompt.kind === 'assist' && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onSelect('NO_ASSIST')}
              className={desktopButton}
            >
              Unassisted
            </button>
          )}
          {canUndo && (
            <button
              type="button"
              disabled={disabled}
              onClick={onUndo}
              className={`${desktopButton} text-slate-600`}
            >
              Undo {primaryLabel.toLowerCase()}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
