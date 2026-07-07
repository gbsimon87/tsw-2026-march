# Pre-PR Component Review Checklist

- [ ] No class components; hooks used correctly (called at top level, not conditionally)
- [ ] Dependency arrays in `useEffect`/`useMemo`/`useCallback` are complete and correct
- [ ] Loading, error, and empty states are all handled for any data-fetching component
- [ ] Lists use stable unique keys, not array index (unless list is static and never reorders)
- [ ] No direct state mutation — new objects/arrays created on update
- [ ] Forms disable submit while in-flight and show validation errors inline
- [ ] Accessibility: interactive elements are real buttons/links (not `div onClick`), images have `alt`, form inputs have associated `label`
- [ ] No secrets or API keys in client-side code
- [ ] Component does one thing — split if it's both fetching data and doing complex rendering
- [ ] Props are typed (PropTypes or TypeScript) with sensible defaults for optional props
