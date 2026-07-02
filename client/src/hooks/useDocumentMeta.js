import { useEffect } from 'react';

function setMetaTag(attr, key, content) {
  if (!content) {
    return null;
  }

  let element = document.head.querySelector(`meta[${attr}="${key}"]`);
  const didCreate = !element;

  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attr, key);
    document.head.appendChild(element);
  }

  const previousContent = element.getAttribute('content');
  element.setAttribute('content', content);

  return { element, didCreate, previousContent };
}

export function useDocumentMeta({ title, description, image, url } = {}) {
  useEffect(() => {
    const originalTitle = document.title;
    if (title) {
      document.title = title;
    }

    const restores = [
      setMetaTag('name', 'description', description),
      setMetaTag('property', 'og:title', title),
      setMetaTag('property', 'og:description', description),
      setMetaTag('property', 'og:image', image),
      setMetaTag('property', 'og:url', url),
      setMetaTag('name', 'twitter:card', image ? 'summary_large_image' : null),
      setMetaTag('name', 'twitter:title', title),
      setMetaTag('name', 'twitter:description', description),
      setMetaTag('name', 'twitter:image', image),
    ].filter(Boolean);

    return () => {
      document.title = originalTitle;

      for (const { element, didCreate, previousContent } of restores) {
        if (didCreate) {
          element.remove();
        } else {
          element.setAttribute('content', previousContent);
        }
      }
    };
  }, [title, description, image, url]);
}
