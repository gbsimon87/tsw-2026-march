import { useCallback, useEffect, useId, useRef, useState } from 'react';

function readMs(name, fallback) {
  if (typeof window === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function Modal({
  open,
  onClose,
  title,
  // A dialog with no visible title still needs an accessible name, so callers
  // that omit `title` must pass one here.
  ariaLabel = 'Dialog',
  children,
  panelClassName = '',
  showCloseButton = true,
  mobileEdgeToEdge = false,
}) {
  const titleId = useId();
  const closeButtonRef = useRef(null);
  const panelRef = useRef(null);
  // `open` flips instantly; `isMounted` lags behind it on close so the exit
  // animation has time to run before the panel leaves the tree.
  const [isMounted, setIsMounted] = useState(open);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setIsMounted(true);
      setIsClosing(false);
      return undefined;
    }

    if (!isMounted) {
      return undefined;
    }

    setIsClosing(true);
    const timer = window.setTimeout(
      () => {
        setIsMounted(false);
        // Without this the next open would start from the closing scale instead
        // of the resting pre-open one.
        setIsClosing(false);
      },
      readMs('--modal-close-dur', 150)
    );

    return () => window.clearTimeout(timer);
  }, [open, isMounted]);

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

  const requestClose = useCallback(() => onClose(), [onClose]);

  if (!isMounted) {
    return null;
  }

  return (
    <div
      className={`t-modal-backdrop fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm ${
        isClosing ? 'is-closing pointer-events-none' : ''
      }`}
      style={{ top: 0, left: 0, right: 0, bottom: 0, margin: 0 }}
    >
      <button
        type="button"
        aria-label="Close dialog"
        tabIndex={-1}
        className="fixed inset-0 h-full w-full cursor-default"
        onClick={requestClose}
      />
      <div
        className={`flex min-h-full justify-center ${
          mobileEdgeToEdge ? 'items-start p-0 sm:items-center sm:p-6' : 'items-center p-4 sm:p-6'
        }`}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={title ? undefined : ariaLabel}
          aria-labelledby={title ? titleId : undefined}
          className={`t-modal relative w-full overflow-hidden bg-white shadow-2xl ${
            isClosing ? 'is-closing' : ''
          } ${
            mobileEdgeToEdge
              ? 'max-h-[100dvh] max-w-none rounded-none sm:max-h-[90vh] sm:max-w-2xl sm:rounded-3xl'
              : 'max-h-[90vh] max-w-2xl rounded-3xl'
          } ${panelClassName}`}
        >
          {showCloseButton ? (
            <button
              ref={closeButtonRef}
              type="button"
              aria-label="Close dialog"
              className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-400"
              onClick={requestClose}
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

          <div
            className={`overflow-y-auto ${
              mobileEdgeToEdge
                ? 'max-h-[100dvh] p-0 sm:max-h-[90vh] sm:p-6'
                : 'max-h-[90vh] p-5 sm:p-6'
            }`}
          >
            {title ? (
              <div
                className={
                  mobileEdgeToEdge
                    ? 'mb-4 px-4 pt-[max(1rem,env(safe-area-inset-top))] pr-16 sm:mb-7 sm:px-0 sm:pt-0 sm:pr-12'
                    : 'mb-7 pr-12'
                }
              >
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
