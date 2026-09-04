const stickyClassName =
  'sticky top-14 z-10 -mx-4 -mt-4 border-b border-slate-100 bg-white px-4 py-4 shadow-sm sm:top-12 sm:-mx-5 sm:-mt-5 sm:px-5';

export function DiscoverSearchBar({ label, placeholder, value, onChange, sticky = false }) {
  return (
    <div data-testid="discover-search-bar" className={sticky ? stickyClassName : ''}>
      <label className="block md:ml-auto md:w-72">
        <span className="sr-only">{label}</span>
        <input
          type="search"
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#1B4332] focus:ring-2 focus:ring-[#1B4332]/20"
        />
      </label>
    </div>
  );
}
