import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ScrimmagePlayerPage } from './ScrimmagePlayerPage';
import { scrimmagesApi } from '../api/scrimmagesApi';
vi.mock('../api/scrimmagesApi', () => ({ scrimmagesApi: { player: vi.fn() } }));
const rules = {
  missPenalty: 1,
  turnoverPenalty: 2,
  winBonus: 2,
  lossPenalty: 1,
  weeklyMinGames: 3,
  seasonMinGames: 6,
  seasonMinWeeks: 2,
};
function payload() {
  return {
    player: { id: 'player-1', displayName: 'John', isActive: true },
    scrimmage: {
      id: 'series-1',
      name: 'We-ball Wednesdays',
      seasons: [
        { id: 'season-1', label: 'Season 1', mvpRules: rules },
        { id: 'season-2', label: 'Season 2', mvpRules: rules },
      ],
    },
    seasonId: 'season-1',
    sessionId: null,
    scope: 'season',
    sessions: [{ id: 'week-1', label: 'Week 1', date: '2026-10-07' }],
    stats: {
      points: 1,
      fgPercentage: 50,
      turnovers: 1,
      makes: 1,
      misses: 1,
      attempts: 2,
      gamesPlayed: 1,
      wins: 0,
      losses: 1,
      mvpScore: -3,
      eligible: false,
    },
    games: [{ id: 'game-1', title: 'Week 1 · Game 1', date: '2026-10-07' }],
    plays: [
      {
        eventId: 'e1',
        gameId: 'game-1',
        gameTitle: 'Week 1 · Game 1',
        sessionLabel: 'Week 1',
        date: '2026-10-07',
        statType: 'FG2_MADE',
        videoTimestamp: 3672.5,
        videoUrl: 'https://youtu.be/dQw4w9WgXcQ',
        scoringRules: { insideArc: 1, outsideArc: 2 },
      },
      {
        eventId: 'e2',
        gameId: 'game-1',
        gameTitle: 'Week 1 · Game 1',
        sessionLabel: 'Week 1',
        date: '2026-10-07',
        statType: 'FG3_MISS',
        videoTimestamp: 3680,
        videoUrl: 'https://youtu.be/dQw4w9WgXcQ',
        scoringRules: { insideArc: 1, outsideArc: 2 },
      },
      {
        eventId: 'e3',
        gameId: 'game-1',
        gameTitle: 'Week 1 · Game 1',
        sessionLabel: 'Week 1',
        statType: 'TOV',
        videoTimestamp: null,
      },
    ],
  };
}
function show(path = '/scrimmage/series-1/players/player-1') {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/scrimmage/:scrimmageId/players/:playerId"
            element={<ScrimmagePlayerPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  scrimmagesApi.player.mockImplementation(async (_series, _player, filters) => ({
    ...payload(),
    seasonId: filters.seasonId || 'season-1',
    scope: filters.sessionId ? 'weekly' : 'season',
  }));
});
afterEach(cleanup);
test('a dedicated player profile shows stats and clips at full-week timestamps', async () => {
  show();
  await screen.findByRole('heading', { name: 'John' });
  expect(screen.getByText('50.0%')).toBeInTheDocument();
  expect(screen.getByText(/1PT Make · 61:12/)).toBeInTheDocument();
  const clip = screen.getByTitle('John · 1PT Make · Week 1 · Game 1');
  const query = new URL(clip.src).searchParams;
  expect(query.get('start')).toBe('3667.5');
  expect(query.get('end')).toBe('3677.5');
  expect(screen.getByText('No video timestamp available for this play.')).toBeInTheDocument();
});
test('play filters include misses and turnovers as well as makes', async () => {
  show();
  await screen.findByRole('heading', { name: 'John' });
  fireEvent.change(screen.getByLabelText('Play type'), { target: { value: 'missed' } });
  expect(screen.getByText(/2PT Miss · 61:20/)).toBeInTheDocument();
  expect(screen.queryByText(/1PT Make ·/)).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Play type'), { target: { value: 'turnovers' } });
  expect(screen.getByText('Turnover')).toBeInTheDocument();
  expect(screen.queryByText(/2PT Miss ·/)).not.toBeInTheDocument();
});
test('week filters use the profile endpoint and season changes clear the prior week', async () => {
  show();
  await screen.findByRole('heading', { name: 'John' });
  fireEvent.change(screen.getByLabelText('Weekly session'), { target: { value: 'week-1' } });
  await screen.findByRole('heading', { name: 'Weekly stats' });
  expect(scrimmagesApi.player).toHaveBeenCalledWith('series-1', 'player-1', {
    seasonId: '',
    sessionId: 'week-1',
  });
  fireEvent.change(screen.getByLabelText('Season'), { target: { value: 'season-2' } });
  await waitFor(() =>
    expect(scrimmagesApi.player).toHaveBeenCalledWith('series-1', 'player-1', {
      seasonId: 'season-2',
      sessionId: '',
    })
  );
});
test('an imported profile is visible before any games or plays exist', async () => {
  scrimmagesApi.player.mockResolvedValue({ ...payload(), stats: null, games: [], plays: [] });
  show();
  await screen.findByRole('heading', { name: 'John' });
  expect(screen.getByText('No completed games yet.')).toBeInTheDocument();
  expect(screen.getByText('No recorded plays for this selection yet.')).toBeInTheDocument();
});

test('old duplicate-profile links resolve to the retained profile with week filters intact', async () => {
  show('/scrimmage/series-1/players/old-player?seasonId=season-1&sessionId=week-1');
  await screen.findByRole('heading', { name: 'John' });
  await waitFor(() =>
    expect(scrimmagesApi.player).toHaveBeenCalledWith('series-1', 'player-1', {
      seasonId: 'season-1',
      sessionId: 'week-1',
    })
  );
});
