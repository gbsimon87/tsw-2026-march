const TITLE_SIZE_CLASSES = {
  default: 'text-2xl md:text-3xl truncate',
  hero: 'max-w-2xl text-4xl leading-[1.05] md:text-5xl',
};

export function DarkPageHeader({
  eyebrow,
  title,
  titleAriaLabel,
  description,
  media,
  children,
  size = 'default',
  className = '',
}) {
  return (
    <section
      aria-label={titleAriaLabel}
      className={`relative overflow-hidden rounded-2xl bg-[#141414] p-5 md:p-8 ${className}`}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(90deg, #fff 0, #fff 1px, transparent 1px, transparent 64px)',
        }}
      />
      <div className={`relative ${media ? 'flex items-center gap-4' : ''}`}>
        {media ? <div className="shrink-0">{media}</div> : null}
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#F4A300]">
              {eyebrow}
            </p>
          ) : null}
          <h1
            aria-label={titleAriaLabel}
            className={`${eyebrow ? 'mt-2 ' : ''}leading-tight text-white ${TITLE_SIZE_CLASSES[size]}`}
            style={{ fontFamily: "'Archivo Black', sans-serif" }}
          >
            {title}
          </h1>
          {description ? (
            <p className="mt-4 max-w-xl text-sm text-white/60 md:text-base">{description}</p>
          ) : null}
          {children ? <div className="mt-3">{children}</div> : null}
        </div>
      </div>
    </section>
  );
}
