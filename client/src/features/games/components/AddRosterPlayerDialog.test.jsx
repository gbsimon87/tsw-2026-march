import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddRosterPlayerDialog } from './AddRosterPlayerDialog';

function setup(props = {}) {
  const onSubmit = props.onSubmit ?? vi.fn().mockResolvedValue(undefined);
  const onClose = props.onClose ?? vi.fn();
  render(<AddRosterPlayerDialog isOpen onClose={onClose} onSubmit={onSubmit} {...props} />);
  return { onSubmit, onClose };
}

describe('AddRosterPlayerDialog', () => {
  it('renders nothing when closed', () => {
    render(<AddRosterPlayerDialog isOpen={false} onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.queryByLabelText(/player name/i)).not.toBeInTheDocument();
  });

  it('submits a name with a null jersey number when jersey is blank', async () => {
    const { onSubmit } = setup();
    await userEvent.type(screen.getByLabelText(/player name/i), 'Jordan Blake');
    await userEvent.click(screen.getByRole('button', { name: /add player/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ displayName: 'Jordan Blake', jerseyNumber: null })
    );
  });

  it('submits a numeric jersey number', async () => {
    const { onSubmit } = setup();
    await userEvent.type(screen.getByLabelText(/player name/i), 'Sam Reed');
    await userEvent.type(screen.getByLabelText(/jersey/i), '23');
    await userEvent.click(screen.getByRole('button', { name: /add player/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ displayName: 'Sam Reed', jerseyNumber: 23 })
    );
  });

  it('does not submit an empty name', async () => {
    const { onSubmit } = setup();
    await userEvent.click(screen.getByRole('button', { name: /add player/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(await screen.findByText(/name is required/i)).toBeInTheDocument();
  });

  it('shows the server error message verbatim and stays open', async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValue(new Error('Player name is already in use on this team'));
    const { onClose } = setup({ onSubmit });

    await userEvent.type(screen.getByLabelText(/player name/i), 'Jordan Blake');
    await userEvent.click(screen.getByRole('button', { name: /add player/i }));

    expect(
      await screen.findByText(/player name is already in use on this team/i)
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on cancel', async () => {
    const { onClose } = setup();
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the team name when provided', () => {
    setup({ teamName: 'Riverside Hawks' });
    expect(screen.getByText(/riverside hawks/i)).toBeInTheDocument();
  });
});
