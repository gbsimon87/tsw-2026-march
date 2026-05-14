import { useEffect, useId, useRef } from 'react';

export function Modal({
  open,
  onClose,
  title,
  children,
  panelClassName = '',
  showCloseButton = true,
}) {
  const titleId = useId();
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm"
      style={{ top: 0, left: 0, right: 0, bottom: 0, margin: 0 }}
      onClick={onClose}
    >
      <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? titleId : undefined}
          className={`relative w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-3xl bg-white shadow-2xl ${panelClassName}`}
          onClick={(event) => event.stopPropagation()}
        >
          {showCloseButton ? (
            <button
              ref={closeButtonRef}
              type="button"
              aria-label="Close dialog"
              className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-400"
              onClick={onClose}
            >
              <svg
                viewBox="0 0 20 20"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="m5 5 10 10" />
                <path d="M15 5 5 15" />
              </svg>
            </button>
          ) : null}

          <div className="max-h-[90vh] overflow-y-auto p-5 sm:p-6">
            {title ? (
              <div className="mb-7 pr-12">
                <h2 id={titleId} className="text-xl font-semibold text-slate-900">
                  {title}
                </h2>
              </div>
            ) : null}
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
