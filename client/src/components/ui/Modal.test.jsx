import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { Modal } from './Modal';

describe('Modal', () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
  });

  test('renders accessible dialog and closes on escape', () => {
    const onClose = vi.fn();

    render(
      <Modal open onClose={onClose} title="Create Post">
        <p>Composer</p>
      </Modal>
    );

    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('closes on backdrop click and locks body scroll', () => {
    const onClose = vi.fn();

    const { container } = render(
      <Modal open onClose={onClose} title="Create Post">
        <p>Composer</p>
      </Modal>
    );

    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.click(container.firstChild);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
