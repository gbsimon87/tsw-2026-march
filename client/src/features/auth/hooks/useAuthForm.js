import { useCallback, useRef, useState } from 'react';

function readMs(name, fallback) {
  if (typeof window === 'undefined') return fallback;
  const parsed = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(name)
  );
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function useAuthForm(initialValues, schema, onSubmit) {
  const [values, setValues] = useState(initialValues);
  const [error, setError] = useState('');
  // Zod reports every failing field at once; showing only the first hides the
  // rest and makes the form feel like it is failing one step at a time.
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const shakeTimer = useRef(null);

  const shake = useCallback(() => {
    // Remove → reflow → re-add is what lets the shake replay on a second
    // failed submit instead of sitting at its end state.
    setIsShaking(false);
    window.clearTimeout(shakeTimer.current);
    window.requestAnimationFrame(() => {
      setIsShaking(true);
      shakeTimer.current = window.setTimeout(
        () => setIsShaking(false),
        readMs('--shake-dur-a', 80) + readMs('--shake-dur-b', 60) * 2 + 40
      );
    });
  }, []);

  function onChange(event) {
    const { name, value } = event.target;
    setValues((previous) => ({ ...previous, [name]: value }));
    // Clear a field's error as soon as the user starts fixing it.
    setFieldErrors((previous) => (previous[name] ? { ...previous, [name]: '' } : previous));
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setFieldErrors({});

    const result = schema.safeParse(values);

    if (!result.success) {
      const nextFieldErrors = {};
      result.error.issues.forEach((issue) => {
        const field = issue.path[0];
        if (field && !nextFieldErrors[field]) {
          nextFieldErrors[field] = issue.message;
        }
      });
      setFieldErrors(nextFieldErrors);
      const count = Object.keys(nextFieldErrors).length;
      setError(
        count > 1 ? `Check the ${count} highlighted fields.` : result.error.issues[0].message
      );
      shake();
      return;
    }

    setIsSubmitting(true);

    try {
      await onSubmit(result.data);
    } catch (err) {
      setError(err?.message || 'Something went wrong. Try again.');
      shake();
    } finally {
      setIsSubmitting(false);
    }
  }

  return {
    values,
    onChange,
    submit,
    isSubmitting,
    error,
    fieldErrors,
    isShaking,
  };
}
