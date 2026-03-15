import courtImage from '../../../assets/courts/basketball_court_1.png';

function isMade(statType) {
  return statType.endsWith('_MADE');
}

export function RecapShotSnapshot({ shotSnapshot }) {
  const events = shotSnapshot?.events || [];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Shot Snapshot</h3>
          <p className="text-sm text-slate-600">A quick look at made and missed field goals.</p>
        </div>
        <div className="text-right text-sm text-slate-600">
          <p>Made: {shotSnapshot?.made || 0}</p>
          <p>Missed: {shotSnapshot?.missed || 0}</p>
        </div>
      </div>

      {events.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600">
          No field-goal locations were recorded for this game.
        </p>
      ) : (
        <div
          className="relative mx-auto mt-4 w-full max-w-[360px]"
          data-testid="recap-shot-snapshot"
        >
          <img src={courtImage} alt="Game recap court" className="block w-full" />
          {events.map((event, index) => {
            const made = isMade(event.statType);
            const offset = (index % 3) * 1.1;

            return (
              <span
                key={event.id}
                className={`pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border ${
                  made ? 'border-emerald-900 bg-emerald-500' : 'border-rose-900 bg-rose-500'
                }`}
                style={{
                  left: `calc(${event.x}% + ${offset}px)`,
                  top: `calc(${event.y}% + ${offset}px)`,
                  opacity: 0.9,
                }}
                data-testid={made ? 'recap-shot-made-marker' : 'recap-shot-miss-marker'}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
