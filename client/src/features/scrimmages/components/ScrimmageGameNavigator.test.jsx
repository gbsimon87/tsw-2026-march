import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ScrimmageGameNavigator } from './ScrimmageGameNavigator';
import { scrimmagesApi } from '../api/scrimmagesApi';
vi.mock('../api/scrimmagesApi', () => ({ scrimmagesApi: { session: vi.fn() } }));
const data = {
  session: { label: 'Week 1', videoUrl: 'https://youtu.be/dQw4w9WgXcQ' },
  games: [
    {
      id: 'g1',
      title: 'Game 1',
      status: 'completed',
      finalScore: { home: 5, away: 3 },
      videoStartTimestamp: 120,
    },
    {
      id: 'g2',
      title: 'Game 2',
      status: 'in_progress',
      finalScore: { home: 1, away: 0 },
      videoStartTimestamp: 4355,
    },
  ],
};
beforeEach(() => {
  vi.resetAllMocks();
  scrimmagesApi.session.mockResolvedValue(data);
});
afterEach(cleanup);
test('shows game scores, readable positions and the current game without allowing a redundant switch', async () => {
  render(
    <ScrimmageGameNavigator
      scrimmageId="s1"
      sessionId="w1"
      currentGameId="g2"
      currentScore={{ home: 2, away: 1 }}
      onClose={vi.fn()}
      onSelect={vi.fn()}
    />
  );
  await screen.findByText('Game 2');
  expect(screen.getByText('5–3')).toBeInTheDocument();
  expect(screen.getByText('2–1')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Tracking this game' })).toBeDisabled();
  expect(screen.getByText(/Current game · In progress/).closest('li')).toHaveAttribute(
    'aria-current',
    'step'
  );
  expect(screen.getByRole('link', { name: 'Watch from 1:12:35' })).toHaveAttribute(
    'href',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=4355s'
  );
});
test('opens an earlier completed game for correction and can return to the current tracker', async () => {
  const onSelect = vi.fn(),
    onClose = vi.fn();
  render(
    <ScrimmageGameNavigator
      scrimmageId="s1"
      sessionId="w1"
      currentGameId="g2"
      onClose={onClose}
      onSelect={onSelect}
    />
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Correct Game 1' }));
  expect(onSelect).toHaveBeenCalledWith('g1');
  fireEvent.click(screen.getByRole('button', { name: 'Return to current game' }));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(scrimmagesApi.session).toHaveBeenCalledWith('s1', 'w1');
});
test('loading failures can be retried without leaving the tracker', async () => {
  scrimmagesApi.session
    .mockRejectedValueOnce(new Error('Connection lost'))
    .mockResolvedValueOnce(data);
  render(
    <ScrimmageGameNavigator
      scrimmageId="s1"
      sessionId="w1"
      currentGameId="g2"
      onClose={vi.fn()}
      onSelect={vi.fn()}
    />
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('Connection lost');
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading games' }));
  expect(await screen.findByText('Game 1')).toBeInTheDocument();
  expect(within(screen.getByRole('dialog')).queryByRole('alert')).not.toBeInTheDocument();
});
