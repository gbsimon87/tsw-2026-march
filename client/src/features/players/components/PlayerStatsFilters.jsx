import { PLAYER_STAT_CATEGORIES } from '../playerStats';

export function PlayerStatsFilters({
  seasons,
  selectedSeason,
  onSeasonChange,
  category,
  onCategoryChange,
}) {
  return (
    <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-2">
      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Season
        <select
          value={selectedSeason}
          onChange={(event) => onSeasonChange(event.target.value)}
          className="mt-1 block h-10 w-full min-w-40 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium normal-case tracking-normal text-slate-900 focus:border-[#1B4332] focus:outline-none focus:ring-2 focus:ring-[#1B4332]/20"
        >
          <option value="all">All seasons</option>
          {seasons.map((season) => (
            <option key={season.value} value={season.value}>
              {season.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Category
        <select
          value={category}
          onChange={(event) => onCategoryChange(event.target.value)}
          className="mt-1 block h-10 w-full min-w-40 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium normal-case tracking-normal text-slate-900 focus:border-[#1B4332] focus:outline-none focus:ring-2 focus:ring-[#1B4332]/20"
        >
          {PLAYER_STAT_CATEGORIES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
