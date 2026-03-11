import { useState } from 'react';

export function useAuthForm(initialValues, schema, onSubmit) {
  const [values, setValues] = useState(initialValues);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  function onChange(event) {
    setValues((previous) => ({
      ...previous,
      [event.target.name]: event.target.value,
    }));
  }

  async function submit(event) {
    event.preventDefault();
    setError('');

    try {
      const parsed = schema.parse(values);
      setIsSubmitting(true);
      await onSubmit(parsed);
    } catch (err) {
      setError(err?.issues?.[0]?.message || err.message || 'Unexpected error');
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
  };
}
