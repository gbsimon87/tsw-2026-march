import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { MergeScrimmagePlayers } from './MergeScrimmagePlayers';
import { scrimmagesApi } from '../api/scrimmagesApi';
vi.mock('../api/scrimmagesApi', () => ({ scrimmagesApi: { mergePlayers: vi.fn() } }));
const pool = [
  { id: 'original-123456', displayName: 'John', isActive: true },
  { id: 'duplicate-654321', displayName: 'John Smith', isActive: true },
];
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);
test('requires reviewing the chosen identities before combining and keeps the selected profile', async () => {
  scrimmagesApi.mergePlayers.mockResolvedValue({});
  const run = vi.fn(async (action) => {
    await action();
    return true;
  });
  render(<MergeScrimmagePlayers scrimmageId="s1" pool={pool} run={run} />);
  fireEvent.click(screen.getByText('Resolve duplicate profiles'));
  expect(screen.getByRole('button', { name: 'Combine profiles' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Duplicate profile'), { target: { value: pool[1].id } });
  fireEvent.change(screen.getByLabelText('Profile to keep'), { target: { value: pool[0].id } });
  expect(screen.getByRole('button', { name: 'Combine profiles' })).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Combine profiles' }));
  await waitFor(() =>
    expect(scrimmagesApi.mergePlayers).toHaveBeenCalledWith('s1', pool[1].id, {
      toPlayerId: pool[0].id,
      confirmed: true,
    })
  );
  expect(await screen.findByRole('status')).toHaveTextContent('Combined profiles under John.');
});
test('changing the retained profile requires a fresh acknowledgement', () => {
  render(<MergeScrimmagePlayers scrimmageId="s1" pool={pool} run={vi.fn()} />);
  fireEvent.click(screen.getByText('Resolve duplicate profiles'));
  fireEvent.change(screen.getByLabelText('Duplicate profile'), { target: { value: pool[1].id } });
  fireEvent.change(screen.getByLabelText('Profile to keep'), { target: { value: pool[0].id } });
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.change(screen.getByLabelText('Profile to keep'), { target: { value: '' } });
  expect(screen.getByRole('button', { name: 'Combine profiles' })).toBeDisabled();
});
