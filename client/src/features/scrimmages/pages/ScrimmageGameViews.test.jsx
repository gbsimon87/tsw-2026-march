import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { GameReplayPanel } from '../../games/components/GameReplayPanel';
import { ScoringTimelineChart } from '../../games/components/ScoringTimelineChart';
import { GameRecapPanel } from '../../games/components/GameRecapPanel';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  LineChart: ({ data }) => <output data-testid="timeline">{JSON.stringify(data)}</output>,
  BarChart: ({ data }) => <output data-testid="stats-chart">{JSON.stringify(data)}</output>,
  Bar: () => null,
  CartesianGrid: () => null,
  Legend: () => null,
  Line: () => null,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

const events = [
  { id: 'e1', playerId: 'p1', statType: 'FG2_MADE', teamSide: 'home', x: 50, y: 20 },
  { id: 'e2', playerId: 'p2', statType: 'FG3_MADE', teamSide: 'away', x: 5, y: 80 },
  { id: 'e3', playerId: 'p1', statType: 'FG2_MISS', teamSide: 'home', x: 50, y: 20 },
];
const participants = {
  home: { displayName: 'Red', players: [{ id: 'p1', displayName: 'Alex' }] },
  away: { displayName: 'White', players: [{ id: 'p2', displayName: 'Kyle' }] },
};

describe('scrimmage game views', () => {
  afterEach(cleanup);

  test.each([
    [undefined, 2, 3],
    [{ insideArc: 1, outsideArc: 2 }, 1, 2],
    [{ insideArc: 2, outsideArc: 4 }, 2, 4],
  ])('the timeline uses saved scoring rules %j', (scoringRules, home, away) => {
    render(<ScoringTimelineChart events={events} isDualTeam scoringRules={scoringRules} />);
    expect(JSON.parse(screen.getByTestId('timeline').textContent)).toEqual([
      { play: 1, Home: home, Away: 0 },
      { play: 2, Home: home, Away: away },
    ]);
  });

  test('the replay shows pickup points, cumulative FG% and core columns', () => {
    render(
      <GameReplayPanel
        events={events}
        participants={participants}
        isDualTeam
        isScrimmage
        scoringRules={{ insideArc: 1, outsideArc: 2 }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    const alex = screen.getByText('Alex').closest('tr');
    expect(
      within(alex)
        .getAllByRole('cell')
        .map((cell) => cell.textContent)
    ).toEqual(['Alex', '1', '1/2', '50.0%', '0']);
    const kyle = screen.getByText('Kyle').closest('tr');
    expect(within(kyle).getAllByRole('cell')[1]).toHaveTextContent('2');
    expect(screen.queryByRole('columnheader', { name: 'REB' })).not.toBeInTheDocument();
    expect(screen.getByText(/1PT Miss/)).toBeInTheDocument();
  });

  test('the recap limits comparisons to core stats and pools shooting attempts', () => {
    const homeStats = {
      points: 6,
      tov: 2,
      fg2: { made: 4, attempts: 8, percentage: 50 },
      fg3: { made: 1, attempts: 1, percentage: 100 },
    };
    const awayStats = {
      points: 0,
      tov: 1,
      fg2: { made: 0, attempts: 0 },
      fg3: { made: 0, attempts: 0 },
    };
    render(<GameRecapPanel isDualTeam isScrimmage recap={{ homeStats, awayStats }} />);
    const table = screen.getByRole('table');
    expect(within(table).getByText('FG%')).toBeInTheDocument();
    expect(within(table).getByText('56%')).toBeInTheDocument();
    expect(within(table).getByText('—')).toBeInTheDocument();
    expect(within(table).queryByText('Rebounds')).not.toBeInTheDocument();
    const charts = screen
      .getAllByTestId('stats-chart')
      .map((chart) => JSON.parse(chart.textContent));
    expect(charts).toEqual([
      [
        { stat: 'PTS', Home: 6, Away: 0 },
        { stat: 'TOV', Home: 2, Away: 1 },
      ],
      [{ stat: 'FG%', Home: 56, Away: 0 }],
    ]);
  });
});
