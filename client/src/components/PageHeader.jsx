export function PageHeader({
  eyebrow,
  title,
  titleAriaLabel,
  description,
  media,
  children,
  className = '',
}) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-5 md:p-6 ${className}`}>
      <div className={media ? 'flex flex-row items-center gap-4' : ''}>
        {media ? <div className="shrink-0">{media}</div> : null}
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">{eyebrow}</p>
          ) : null}
          <h1
            aria-label={titleAriaLabel}
            className={`${eyebrow ? 'mt-2 ' : ''}text-2xl font-bold leading-tight text-slate-900 md:text-3xl`}
          >
            {title}
          </h1>
          {description ? (
            <p className="mt-2 text-sm text-slate-700 md:text-base">{description}</p>
          ) : null}
          {children ? <div className="mt-4">{children}</div> : null}
        </div>
      </div>
    </section>
  );
}
