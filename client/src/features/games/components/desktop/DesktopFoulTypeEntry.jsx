import { FoulTypeChoices } from '../FoulTypeChoices';
import { DesktopEntryHeader } from './DesktopEntryHeader';
import { desktopButton } from './DesktopShotEntry';

export function DesktopFoulTypeEntry({ onSelect, onBack, onCancel, disabled, location }) {
  return (
    <section aria-label="Choose foul type" className="space-y-4">
      <DesktopEntryHeader
        title="Foul type"
        actions={
          <>
            <button type="button" disabled={disabled} onClick={onBack} className={desktopButton}>
              Back
            </button>
            <button type="button" disabled={disabled} onClick={onCancel} className={desktopButton}>
              Cancel
            </button>
          </>
        }
      >
        {location && <p className="text-sm text-slate-500">{location}</p>}
      </DesktopEntryHeader>
      <FoulTypeChoices onSelect={onSelect} disabled={disabled} />
    </section>
  );
}
