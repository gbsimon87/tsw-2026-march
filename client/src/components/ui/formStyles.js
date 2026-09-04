/**
 * The one definition of what an input looks like in this app.
 *
 * Before this existed, forms carried four different input treatments
 * (`rounded border border-slate-300 px-3 py-2`, `rounded-lg border-slate-200
 * px-3 py-2.5`, native unstyled selects, and a bordered `<fieldset>` with an
 * inset legend), so two fields on the same screen rarely matched.
 */
export const controlClass =
  // min-w-0/max-w-full: a native datetime-local picker carries an intrinsic
  // minimum width and overflows a narrow flex/grid column without them.
  'w-full min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-[#F4A300]/60 focus:outline-none focus:ring-2 focus:ring-[#F4A300]/20';

export const controlInvalidClass =
  'w-full min-w-0 max-w-full rounded-lg border-2 border-red-400 bg-white px-3 py-2.5 text-sm text-slate-900 transition-colors focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200';

export const labelClass = 'mb-1.5 block text-sm font-medium text-slate-700';

export const hintClass = 'mt-1.5 text-xs text-slate-500';

export const sectionHeadingClass = 'text-base font-semibold text-slate-900';

export const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-[#141414] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#2a2a2a] active:bg-black disabled:cursor-not-allowed disabled:opacity-50';

export const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50';
