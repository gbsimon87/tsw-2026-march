export function LeagueFormBadges({ form = [], className = '' }) {
  if (form.length === 0) {
    return (
      <span className={`block text-center text-slate-400 ${className}`} aria-label="No results">
        —
      </span>
    );
  }

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {form.map((formResult) => {
        const resultLabel =
          formResult.result === 'win' ? 'Win' : formResult.result === 'loss' ? 'Loss' : 'Tie';
        const resultLetter = resultLabel.charAt(0);
        const resultClass =
          formResult.result === 'win'
            ? 'bg-emerald-100 text-emerald-800'
            : formResult.result === 'loss'
              ? 'bg-rose-100 text-rose-800'
              : 'bg-amber-100 text-amber-800';
        const accessibleLabel = `${resultLabel} against ${formResult.opponentTeamName}, ${formResult.teamPoints}-${formResult.opponentPoints}`;

        return (
          <span
            key={formResult.gameId}
            aria-label={accessibleLabel}
            title={accessibleLabel}
            className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${resultClass}`}
          >
            {resultLetter}
          </span>
        );
      })}
    </div>
  );
}
