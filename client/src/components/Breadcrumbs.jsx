import { Link } from 'react-router-dom';

export function Breadcrumbs({ crumbs }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex flex-wrap items-center gap-1.5 text-sm text-slate-500"
    >
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1;
        return (
          <span key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
            {index > 0 && (
              <svg
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5 shrink-0 text-slate-300"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            )}
            {isLast || !crumb.href ? (
              <span className={isLast ? 'font-medium text-slate-800' : ''}>{crumb.label}</span>
            ) : (
              <Link to={crumb.href} className="transition-colors hover:text-slate-700">
                {crumb.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
