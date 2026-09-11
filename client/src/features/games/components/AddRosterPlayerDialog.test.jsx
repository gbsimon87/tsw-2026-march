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

  it('prefills a missing jersey and requires an outgoing player for a full lineup', async () => {
    const { onSubmit } = setup({
      title: 'Add missing player?',
      description: 'Jersey #8 is not on this roster.',
      initialJerseyNumber: 8,
      lockJerseyNumber: true,
      submitLabel: 'Add, sub in & record stat',
      requirePlayerOut: true,
      playersToSubOut: [
        { id: 'player-1', displayName: 'Alex Morgan', jerseyNumber: 4 },
        { id: 'player-2', displayName: 'Blake Jones', jerseyNumber: null },
      ],
    });

    // The accessible name follows the heading, so the voice recovery mode announces itself.
    expect(screen.getByRole('dialog', { name: 'Add missing player?' })).toHaveTextContent(
      'Jersey #8 is not on this roster.'
    );
    expect(screen.getByLabelText(/jersey/i)).toHaveValue(8);
    expect(screen.getByLabelText(/jersey/i)).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/player name/i), 'Taylor Reed');
    await userEvent.click(screen.getByRole('button', { name: 'Add, sub in & record stat' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(await screen.findByText(/choose which on-court player/i)).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Sub out'), 'player-1');
    await userEvent.click(screen.getByRole('button', { name: 'Add, sub in & record stat' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        displayName: 'Taylor Reed',
        jerseyNumber: 8,
        playerOutId: 'player-1',
      })
    );
  });
});
