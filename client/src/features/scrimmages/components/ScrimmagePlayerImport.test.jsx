import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ScrimmagePlayerImport } from './ScrimmagePlayerImport';
import { scrimmagesApi } from '../api/scrimmagesApi';
vi.mock('../api/scrimmagesApi', () => ({
  scrimmagesApi: { importOptions: vi.fn(), addPlayer: vi.fn() },
}));
const players = [
  {
    key: 'league:john',
    displayName: 'John',
    sourceName: 'We-ball League',
    sourceKey: 'league:l1',
    sourceType: 'league',
    leaguePlayerId: 'john',
    alreadyInPool: true,
    poolPlayerId: 'kept-john',
  },
  {
    key: 'league:kyle',
    displayName: 'Kyle',
    sourceName: 'We-ball League',
    sourceKey: 'league:l1',
    sourceType: 'league',
    leaguePlayerId: 'kyle',
    alreadyInPool: false,
  },
  {
    key: 'team:john',
    displayName: 'John Smith',
    sourceName: 'Practice Team',
    sourceKey: 'team:t1',
    sourceType: 'team',
    sourceTeamId: 't1',
    sourcePlayerId: 'team-john',
    alreadyInPool: false,
  },
];
function show(
  run = async (action) => {
    await action();
    return true;
  }
) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <ScrimmagePlayerImport scrimmageId="s1" run={run} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  scrimmagesApi.importOptions.mockResolvedValue({ players });
  scrimmagesApi.addPlayer.mockResolvedValue({});
});
afterEach(cleanup);
test('search and source filters combine without confusing names shared across leagues and teams', async () => {
  show();
  await screen.findByText('John Smith');
  fireEvent.change(screen.getByLabelText('Search players'), { target: { value: 'jOhN' } });
  expect(screen.queryByText('Kyle')).not.toBeInTheDocument();
  expect(screen.getByText('John Smith')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Import source'), { target: { value: 'team:t1' } });
  expect(screen.queryByText('John', { exact: true })).not.toBeInTheDocument();
  expect(screen.getByText('John Smith')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Search players'), { target: { value: 'Kyle' } });
  expect(screen.getByText('No players match these filters.')).toBeInTheDocument();
});
test('already imported players link to the retained scrimmage profile and cannot be imported twice', async () => {
  show();
  const row = (await screen.findByText('John', { exact: true })).closest('li');
  expect(within(row).getByText('Already in this scrimmage')).toBeInTheDocument();
  expect(within(row).getByRole('link', { name: 'View scrimmage profile' })).toHaveAttribute(
    'href',
    '/admin/scrimmage/s1/players/kept-john'
  );
  expect(within(row).queryByRole('button')).not.toBeInTheDocument();
});
test.each([
  ['Kyle', 'We-ball League', { displayName: 'Kyle', leaguePlayerId: 'kyle' }],
  [
    'John Smith',
    'Practice Team',
    { displayName: 'John Smith', sourceTeamId: 't1', sourcePlayerId: 'team-john' },
  ],
])(
  'imports %s with the correct source and refreshes its imported marker',
  async (name, source, payload) => {
    show();
    const button = await screen.findByRole('button', { name: `Import ${name} from ${source}` });
    scrimmagesApi.importOptions.mockResolvedValue({
      players: players.map((player) => ({
        ...player,
        alreadyInPool: player.alreadyInPool || player.displayName === name,
        poolPlayerId: player.displayName === name ? 'new-profile' : player.poolPlayerId,
      })),
    });
    fireEvent.click(button);
    await waitFor(() => expect(scrimmagesApi.addPlayer).toHaveBeenCalledWith('s1', payload));
    const row = screen.getByText(name, { exact: true }).closest('li');
    await waitFor(() =>
      expect(within(row).getByText('Already in this scrimmage')).toBeInTheDocument()
    );
    expect(await screen.findByRole('status')).toHaveTextContent(`${name} added to this scrimmage.`);
  }
);
test('long player lists expand incrementally and search resets the list', async () => {
  scrimmagesApi.importOptions.mockResolvedValue({
    players: Array.from({ length: 25 }, (_, i) => ({
      ...players[1],
      key: `player-${i}`,
      displayName: `Player ${i}`,
    })),
  });
  show();
  await screen.findByText('25 matching players');
  expect(
    within(screen.getByRole('list', { name: 'Player import results' })).getAllByRole('listitem')
  ).toHaveLength(20);
  fireEvent.click(screen.getByRole('button', { name: 'Show more players' }));
  expect(
    within(screen.getByRole('list', { name: 'Player import results' })).getAllByRole('listitem')
  ).toHaveLength(25);
  fireEvent.change(screen.getByLabelText('Search players'), { target: { value: 'Player 24' } });
  expect(
    within(screen.getByRole('list', { name: 'Player import results' })).getAllByRole('listitem')
  ).toHaveLength(1);
});
