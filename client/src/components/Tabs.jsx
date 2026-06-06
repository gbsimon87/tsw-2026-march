import { useId, useState } from 'react';

export function Tabs({ items, defaultValue, onChange }) {
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
    <div className="space-y-4">
      <div
        className="inline-flex rounded border bg-white p-1"
        role="tablist"
        aria-label="Game detail sections"
        onKeyDown={onKeyDown}
      >
        {items.map((item) => {
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
              tabIndex={isActive ? 0 : -1}
              className={`rounded px-3 py-1.5 text-sm font-medium ${
                isActive ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
              onClick={() => setActiveAndNotify(item.value)}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div
        id={`${baseId}-${activeItem.value}-panel`}
        role="tabpanel"
        aria-labelledby={`${baseId}-${activeItem.value}-tab`}
      >
        {activeItem.content}
      </div>
    </div>
  );
}
