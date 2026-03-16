export function FloatingActionButton({ label, onClick, icon, className = '' }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`fixed bottom-5 right-5 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-white shadow-[0_18px_50px_-18px_rgba(15,23,42,0.6)] transition hover:-translate-y-0.5 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 active:scale-95 md:bottom-6 md:right-6 ${className}`}
      onClick={onClick}
    >
      {icon || (
        <svg
          viewBox="0 0 24 24"
          className="h-6 w-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      )}
    </button>
  );
}
