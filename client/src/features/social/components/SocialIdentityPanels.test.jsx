import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { MarketingPermissionPanel } from './MarketingPermissionPanel';
import { PlayerSocialPanel } from './PlayerSocialPanel';

afterEach(cleanup);

describe('social identity admin controls', () => {
  test('organisation grant requires an explicit attestation', () => {
    const onSave = vi.fn();
    render(
      <MarketingPermissionPanel social={{ marketing: { status: 'unrecorded' } }} onSave={onSave} />
    );

    const grant = screen.getByRole('button', { name: 'Record permission' });
    expect(grant).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Confirm marketing permission' }));
    fireEvent.click(grant);
    expect(onSave).toHaveBeenCalledWith({ marketingStatus: 'granted' });
  });

  test('league-team handles panel has no independent permission action', () => {
    render(<MarketingPermissionPanel handlesOnly social={{}} onSave={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Save handles' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Record permission' })).not.toBeInTheDocument();
  });

  test('minor guardian consent and a player decline are saved together', async () => {
    const onSave = vi.fn().mockResolvedValue();
    render(
      <PlayerSocialPanel player={{ id: 'p1', displayName: 'Jordan', social: {} }} onSave={onSave} />
    );
    fireEvent.click(screen.getByText('Jordan — social identity'));
    fireEvent.change(screen.getByRole('combobox', { name: 'Jordan age category' }), {
      target: { value: 'minor' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /parent or guardian has consented/i }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Jordan marketing choice' }), {
      target: { value: 'declined' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save social identity' }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith('p1', {
        social: {
          instagramHandle: '',
          tiktokHandle: '',
          marketingStatus: 'declined',
          ageCategory: 'minor',
          guardianConsent: true,
        },
      })
    );
  });
});
