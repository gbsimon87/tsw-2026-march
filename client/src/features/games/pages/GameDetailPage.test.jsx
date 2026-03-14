import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import { GameDetailPage } from './GameDetailPage';

const apiMocks = vi.hoisted(() => ({
  getById: vi.fn(),
}));

vi.mock('../api/gamesApi', () => ({
  gamesApi: apiMocks,
}));

vi.mock('../../../app/store/AuthContext', () => ({
  useAuth: vi.fn(() => ({ user: null })),
}));

describe('GameDetailPage', () => {
  test('renders tabbed game detail sections and shot map interactions', async () => {
    apiMocks.getById.mockResolvedValue({
      game: {
        id: 'game-1',
        title: 'vs Wildcats',
        status: 'completed',
        scheduledAt: '2026-03-12T18:00:00.000Z',
        createdAt: '2026-03-12T17:45:00.000Z',
        completedAt: '2026-03-12T19:20:00.000Z',
        events: [
          {
            id: 'e1',
            playerId: 'p1',
            statType: 'FG2_MADE',
            zoneId: 'PAINT',
            x: 51,
            y: 78,
            occurredAt: '2026-03-12T18:03:00.000Z',
          },
          {
            id: 'e2',
            playerId: 'p2',
            statType: 'AST',
            zoneId: null,
            x: null,
            y: null,
            occurredAt: '2026-03-12T18:03:30.000Z',
          },
          {
            id: 'e3',
            playerId: 'p2',
            statType: 'FG3_MISS',
            zoneId: 'ABOVE_BREAK_THREE',
            x: 24,
            y: 36,
            occurredAt: '2026-03-12T18:04:00.000Z',
          },
          {
            id: 'e4',
            playerId: 'p1',
            statType: 'FT_MADE',
            zoneId: 'FREE_THROW_LINE',
            x: 50,
            y: 20,
            occurredAt: '2026-03-12T18:05:00.000Z',
          },
          {
            id: 'e5',
            playerId: 'p2',
            statType: 'DREB',
            zoneId: null,
            x: null,
            y: null,
            occurredAt: '2026-03-12T18:06:00.000Z',
          },
          {
            id: 'e6',
            playerId: 'p1',
            statType: 'FT_MADE',
            zoneId: 'FREE_THROW_LINE',
            x: 50,
            y: 20,
            occurredAt: '2026-03-12T18:07:00.000Z',
          },
        ],
      },
      team: {
        id: 'team-1',
        name: 'TSW Team',
        players: [
          { id: 'p1', displayName: 'Alex', isActive: true },
          { id: 'p2', displayName: 'Jordan', isActive: true },
        ],
      },
      boxScore: {
        players: [
          {
            playerId: 'p1',
            displayName: 'Alex',
            ftm: 2,
            fta: 2,
            fg2m: 1,
            fg2a: 1,
            fg3m: 0,
            fg3a: 0,
            ast: 0,
            oreb: 0,
            dreb: 0,
            reb: 0,
            points: 4,
          },
          {
            playerId: 'p2',
            displayName: 'Jordan',
            ftm: 0,
            fta: 0,
            fg2m: 0,
            fg2a: 0,
            fg3m: 0,
            fg3a: 1,
            ast: 1,
            oreb: 0,
            dreb: 1,
            reb: 1,
            points: 0,
          },
        ],
        teamTotals: {
          ftm: 2,
          fta: 2,
          fg2m: 1,
          fg2a: 1,
          fg3m: 0,
          fg3a: 1,
          ast: 1,
          oreb: 0,
          dreb: 1,
          reb: 1,
          points: 4,
        },
      },
    });

    render(
      <MemoryRouter initialEntries={['/games/game-1']}>
        <Routes>
          <Route path="/games/:gameId" element={<GameDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole('tab', { name: 'Box Score' })).toBeInTheDocument();

    expect(screen.getByRole('tab', { name: 'Box Score' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Replay' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Game Info' })).toBeInTheDocument();
    expect(screen.getByText(/Play by Play/i)).toBeInTheDocument();
    expect(screen.getByText(/Shot Map/i)).toBeInTheDocument();
    expect(screen.queryByText(/Game Date \/ Time/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Alex: 2PT Make/i)).toBeInTheDocument();
    expect(screen.getByText(/Jordan: Assist/i)).toBeInTheDocument();
    expect(screen.getByText(/Jordan: Defensive Rebound/i)).toBeInTheDocument();
    expect(screen.getByText('AST')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /PTS/i })).toBeInTheDocument();
    expect(screen.getByText('OREB')).toBeInTheDocument();
    expect(screen.getByText('DREB')).toBeInTheDocument();
    expect(screen.getByText('REB')).toBeInTheDocument();
    expect(screen.getAllByText(/Paint/i).length).toBeGreaterThan(0);
    expect(screen.getByTestId('game-shot-map')).toBeInTheDocument();
    expect(screen.getByTestId('shot-zone-overlay')).toBeInTheDocument();
    expect(screen.getByTestId('shot-zone-table')).toBeInTheDocument();
    expect(screen.getByText('Zone Results')).toBeInTheDocument();
    expect(screen.getByText('Paint')).toBeInTheDocument();
    expect(screen.getByText('ABOVE_BREAK_THREE')).toBeInTheDocument();
    expect(screen.getAllByTestId('shot-made-marker')).toHaveLength(1);
    expect(screen.getAllByTestId('shot-miss-marker')).toHaveLength(1);

    fireEvent.change(screen.getByLabelText('Player'), { target: { value: 'p1' } });
    expect(screen.getAllByTestId('shot-made-marker')).toHaveLength(1);
    expect(screen.queryByTestId('shot-miss-marker')).not.toBeInTheDocument();
    expect(screen.queryByText('ABOVE_BREAK_THREE')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: '2PT' })[1]);
    expect(screen.getAllByTestId('shot-made-marker')).toHaveLength(1);
    expect(screen.queryByTestId('shot-miss-marker')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Player'), { target: { value: 'ALL' } });
    fireEvent.click(screen.getAllByRole('button', { name: '3PT' })[1]);
    expect(screen.queryByTestId('shot-made-marker')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('shot-miss-marker')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Hide Zones' }));
    expect(screen.queryByTestId('shot-zone-overlay')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show Zones' }));
    expect(screen.getByTestId('shot-zone-overlay')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Replay' }));
    expect(screen.getByText('Event 1 of 4')).toBeInTheDocument();
    expect(screen.getAllByTestId('replay-marker')).toHaveLength(1);
    expect(screen.getByTestId('replay-box-score')).toBeInTheDocument();
    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.getByText('Jordan')).toBeInTheDocument();
    expect(screen.getByText('1/1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Event 2 of 4')).toBeInTheDocument();
    expect(screen.getAllByTestId('replay-marker')).toHaveLength(2);
    expect(screen.getByText('0/1')).toBeInTheDocument();
    fireEvent.click(
      within(screen.getByTestId('replay-box-score')).getByRole('button', { name: /AST/i })
    );
    const jordanReplayRowAfterAssist = within(screen.getByTestId('replay-box-score'))
      .getByText('Jordan')
      .closest('tr');
    expect(jordanReplayRowAfterAssist).toHaveTextContent('1');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Event 3 of 4')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Event 4 of 4')).toBeInTheDocument();
    const jordanReplayRow = within(screen.getByTestId('replay-box-score'))
      .getByText('Jordan')
      .closest('tr');
    expect(jordanReplayRow).toHaveTextContent('1');

    fireEvent.click(screen.getByRole('tab', { name: 'Game Info' }));
    expect(screen.getByText(/Game Date \/ Time/i)).toBeInTheDocument();
    expect(screen.getByText(/Recorded At/i)).toBeInTheDocument();
    expect(screen.getByText(/Finished At/i)).toBeInTheDocument();
    expect(screen.getByText(/vs Wildcats/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'TSW Team' })).toHaveAttribute('href', '/teams/team-1');

    fireEvent.click(screen.getByRole('tab', { name: 'Box Score' }));
    expect(screen.getByText(/Play by Play/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /PTS/i }));
    const boxScoreRows = within(screen.getAllByRole('table')[0]).getAllByRole('row');
    expect(within(boxScoreRows[1]).getByText('Alex')).toBeInTheDocument();
  });
});
