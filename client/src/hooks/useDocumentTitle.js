import { useEffect } from 'react';

export function useDocumentTitle(title) {
  useEffect(() => {
    const original = document.title;
    document.title = title;

    return () => {
      document.title = original;
    };
  }, [title]);
}
