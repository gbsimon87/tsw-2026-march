import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { useHashScroll } from './useHashScroll';

function Harness() {
  useHashScroll();
  return null;
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Harness />
    </MemoryRouter>
  );
}

// The hook retries across animation frames, so the test drives them by hand
// rather than waiting on real ones.
let frameQueue = [];

function flushFrames(count = 1) {
  for (let i = 0; i < count; i += 1) {
    const pending = frameQueue;
    frameQueue = [];
    pending.forEach((callback) => callback());
  }
}

beforeEach(() => {
  frameQueue = [];
  vi.stubGlobal('requestAnimationFrame', (callback) => {
    frameQueue.push(callback);
    return frameQueue.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('useHashScroll', () => {
  test('scrolls to the section named by the fragment', () => {
    const section = document.createElement('section');
    section.id = 'data-deletion';
    section.scrollIntoView = vi.fn();
    document.body.appendChild(section);

    renderAt('/privacy#data-deletion');
    flushFrames();

    expect(section.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  test('keeps retrying until a lazily mounted section appears', () => {
    renderAt('/privacy#data-deletion');
    flushFrames(5);

    // Stands in for the route chunk arriving after the browser gave up.
    const section = document.createElement('section');
    section.id = 'data-deletion';
    section.scrollIntoView = vi.fn();
    document.body.appendChild(section);
    flushFrames();

    expect(section.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  test('gives up rather than looping forever on an id that never arrives', () => {
    renderAt('/privacy#never-rendered');
    flushFrames(70);

    expect(frameQueue).toHaveLength(0);
  });

  test('does nothing when the route carries no fragment', () => {
    renderAt('/privacy');

    expect(frameQueue).toHaveLength(0);
  });

  test('decodes a percent-encoded fragment', () => {
    const section = document.createElement('section');
    section.id = 'a b';
    section.scrollIntoView = vi.fn();
    document.body.appendChild(section);

    renderAt('/privacy#a%20b');
    flushFrames();

    expect(section.scrollIntoView).toHaveBeenCalledTimes(1);
  });
});
