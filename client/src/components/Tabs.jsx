import { useId, useState } from 'react';

export function Tabs({ items, defaultValue, onChange, ariaLabel, stickyTabList = false }) {
  const fallback = items[0]?.value || '';
  const [active, setActive] = useState(defaultValue || fallback);

  function setActiveAndNotify(value) {
    setActive(value);
    onChange?.(value);
  }
  const baseId = useId();

  if (!items.length) {
    return null;
  }

  const activeItem = items.find((item) => item.value === active) || items[0];
  const activeIndex = items.findIndex((item) => item.value === activeItem.value);

  function onKeyDown(event) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      return;
    }

    event.preventDefault();
    if (event.key === 'Home') {
      setActiveAndNotify(items[0].value);
      return;
    }
    if (event.key === 'End') {
      setActiveAndNotify(items[items.length - 1].value);
      return;
    }

    const direction = event.key === 'ArrowRight' ? 1 : -1;
    const nextIndex = (activeIndex + direction + items.length) % items.length;
    setActiveAndNotify(items[nextIndex].value);
  }

  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white ${
        stickyTabList ? 'overflow-visible' : 'overflow-hidden'
      }`}
    >
      <div
        className={`grid border-b border-slate-200 ${
          stickyTabList
            ? 'sticky top-0 z-20 h-14 overflow-hidden rounded-t-2xl bg-white shadow-sm sm:h-12'
            : ''
        }`}
        role="tablist"
        aria-label={ariaLabel || 'Game detail sections'}
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((item, index) => {
          const isActive = item.value === activeItem.value;
          const tabId = `${baseId}-${item.value}-tab`;
          const panelId = `${baseId}-${item.value}-panel`;

          return (
            <button
              key={item.value}
              id={tabId}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={panelId}
              aria-label={item.label}
              tabIndex={isActive ? 0 : -1}
              className={`flex flex-col items-center justify-center gap-1 text-xs font-semibold transition sm:flex-row sm:gap-1.5 sm:text-sm ${
                stickyTabList ? 'h-full py-2' : 'py-3'
              } ${index < items.length - 1 ? 'border-r border-slate-200' : ''} ${
                isActive
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
              }`}
              onClick={() => setActiveAndNotify(item.value)}
              onKeyDown={onKeyDown}
            >
              {item.icon ?? null}
              {item.label}
            </button>
          );
        })}
      </div>

      <div
        id={`${baseId}-${activeItem.value}-panel`}
        role="tabpanel"
        aria-labelledby={`${baseId}-${activeItem.value}-tab`}
        className="p-4 sm:p-5"
      >
        {activeItem.content}
      </div>
    </div>
  );
}
