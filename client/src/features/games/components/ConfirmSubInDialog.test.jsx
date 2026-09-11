import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmSubInDialog } from './ConfirmSubInDialog';

const LINEUP = [
  { id: 'player-1', displayName: 'Alex', jerseyNumber: 1 },
  { id: 'player-2', displayName: 'Blake', jerseyNumber: null },
];

function setup(props = {}) {
  const onConfirm = props.onConfirm ?? vi.fn().mockResolvedValue(undefined);
  const onClose = props.onClose ?? vi.fn();
  render(
    <ConfirmSubInDialog
      isOpen
      onClose={onClose}
      onConfirm={onConfirm}
      playerLabel="#6 Flynn"
      teamName="TSW Team"
      statLabel="Steal"
      {...props}
    />
  );
  return { onConfirm, onClose };
}

describe('ConfirmSubInDialog', () => {
  it('renders nothing when closed', () => {
    render(
      <ConfirmSubInDialog
        isOpen={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        playerLabel="#6 Flynn"
      />
    );
    expect(screen.queryByText(/player is on the bench/i)).not.toBeInTheDocument();
  });

  it('names the player and the stat being held', () => {
    setup();
    expect(screen.getByText(/#6 Flynn is not on the court/i)).toBeInTheDocument();
    expect(screen.getByText(/record the captured Steal/i)).toBeInTheDocument();
    expect(screen.getByText('TSW Team')).toBeInTheDocument();
  });

  it('confirms with no outgoing player when the lineup has room', async () => {
    const { onConfirm } = setup();
    expect(screen.queryByLabelText('Sub out')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /sub in & record stat/i }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({ playerOutId: null }));
  });

  it('refuses to confirm a full lineup until someone is chosen to come off', async () => {
    const { onConfirm } = setup({ playersToSubOut: LINEUP, requirePlayerOut: true });
    await userEvent.click(screen.getByRole('button', { name: /sub in & record stat/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Choose which on-court player is being subbed out'
    );
    expect(onConfirm).not.toHaveBeenCalled();

    await userEvent.selectOptions(screen.getByLabelText('Sub out'), 'player-2');
    await userEvent.click(screen.getByRole('button', { name: /sub in & record stat/i }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({ playerOutId: 'player-2' }));
  });

  it("surfaces the server's own failure message and stays open to retry", async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('Lineup changed underneath you'));
    setup({ onConfirm });
    await userEvent.click(screen.getByRole('button', { name: /sub in & record stat/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Lineup changed underneath you');
    expect(screen.getByRole('button', { name: /sub in & record stat/i })).toBeEnabled();
  });
});
