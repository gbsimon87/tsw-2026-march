// A phone (or small tablet) held sideways. Height is the scarce axis here, not
// width, which is why the tracker lays its chrome out horizontally and drops
// every fixed min-height in this range.
//
// `pointer: coarse` keeps a short desktop window out of it, and the 600px
// height ceiling keeps a landscape tablet — which has room for the normal
// layout — out of it too. Kept here so the JS listener in
// InteractiveCourtImage and the `landscape-compact:` Tailwind variant can
// never disagree about what "mobile landscape" means.
export const MOBILE_LANDSCAPE_QUERY =
  '(orientation: landscape) and (max-height: 600px) and (pointer: coarse)';
