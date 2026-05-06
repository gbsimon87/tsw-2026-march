export function SportsLoader({ label = 'Loading', className = '', fullPage = false }) {
  return (
    <div
      className={`flex items-center justify-center ${fullPage ? 'min-h-[40vh]' : 'py-4'} ${className}`}
      role="status"
      aria-live="polite"
    >
      <div className="relative h-20 w-16">
        <div className="absolute left-1/2 top-0 h-12 w-12 -translate-x-1/2 animate-bounce overflow-hidden rounded-full border-2 border-orange-950 bg-orange-500 shadow-lg shadow-slate-300/70">
          <span className="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 bg-orange-950/70" />
          <span className="absolute left-0 top-1/2 h-0.5 w-full -translate-y-1/2 bg-orange-950/70" />
          <span className="absolute -left-4 top-1/2 h-12 w-8 -translate-y-1/2 rounded-full border-2 border-orange-950/70" />
          <span className="absolute -right-4 top-1/2 h-12 w-8 -translate-y-1/2 rounded-full border-2 border-orange-950/70" />
        </div>
        <div className="absolute bottom-0 left-1/2 h-2 w-10 -translate-x-1/2 rounded-full bg-slate-300/80 blur-[1px]" />
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}
