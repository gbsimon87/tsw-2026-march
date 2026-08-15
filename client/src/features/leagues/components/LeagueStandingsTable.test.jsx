import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
import { LeagueStandingsTable } from './LeagueStandingsTable';

const standings = [
  {
    teamId: 'team-a',
    teamName: 'Falcons',
    record: '1-1',
    wins: 1,
    losses: 1,
    pointsFor: 140,
    pointsAgainst: 136,
    pointDiff: 4,
  },
];

function renderTable(props = {}) {
  render(
    <MemoryRouter>
      <LeagueStandingsTable standings={standings} {...props} />
    </MemoryRouter>
  );
}

describe('LeagueStandingsTable recent form', () => {
  test('only shows the optional Form column when form data is provided', () => {
    renderTable();

    expect(screen.queryByRole('columnheader', { name: 'Form' })).not.toBeInTheDocument();
  });

  test('shows accessible result badges with opponent and score context', () => {
    renderTable({
      getTeamForm: () => [
        {
          gameId: 'game-2',
          result: 'win',
          opponentTeamName: 'Bears',
          teamPoints: 74,
          opponentPoints: 68,
        },
        {
          gameId: 'game-1',
          result: 'loss',
          opponentTeamName: 'Owls',
          teamPoints: 66,
          opponentPoints: 70,
        },
      ],
    });

    expect(screen.getByRole('columnheader', { name: 'Form' })).toBeInTheDocument();
    expect(screen.getByLabelText('Win against Bears, 74-68')).toHaveTextContent('W');
    expect(screen.getByLabelText('Loss against Owls, 66-70')).toHaveTextContent('L');
  });

  test('shows an explicit empty state when a team has no completed results', () => {
    renderTable({ getTeamForm: () => [] });

    expect(screen.getByLabelText('No results')).toHaveTextContent('—');
  });
});
