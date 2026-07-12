function formatSeasonLabel(season) {
  if (!season) return '';
  const statusLabel = season.status === 'active' ? 'Active' : 'Completed';
  return `${season.label} (${statusLabel})`;
}

export function SeasonSelect({ seasons, selectedSeasonId, onChange, className = '' }) {
  if (!seasons || seasons.length === 0) {
    return null;
  }

  return (
    <label className={`flex items-center gap-2 text-sm ${className}`}>
      <span className="font-semibold uppercase tracking-[0.15em] text-white/60 text-xs">
        Season
      </span>
      <select
        value={selectedSeasonId || ''}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-semibold text-white focus:border-[#F4A300] focus:outline-none focus:ring-2 focus:ring-[#F4A300]/50"
      >
        {seasons.map((season) => (
          <option key={season.id} value={season.id} className="text-slate-900">
            {formatSeasonLabel(season)}
          </option>
        ))}
      </select>
    </label>
  );
}
