import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ScrimmagePage, ScrimmageSessionPage } from './ScrimmagePages';
import { NewScrimmageGameDialog } from '../components/NewScrimmageGameDialog';
import { scrimmagesApi } from '../api/scrimmagesApi';
vi.mock('../api/scrimmagesApi', () => ({
  scrimmagesApi: {
    detail: vi.fn(),
    session: vi.fn(),
    join: vi.fn(),
    newGame: vi.fn(),
    requests: vi.fn(),
    importOptions: vi.fn(),
    publishSession: vi.fn(),
    finishSession: vi.fn(),
    mergePlayers: vi.fn(),
    createSession: vi.fn(),
  },
}));
vi.mock('../../../app/store/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1', name: 'John Smith' } }),
}));
const rules = {
  missPenalty: 1,
  turnoverPenalty: 2,
  winBonus: 2,
  lossPenalty: 1,
  weeklyMinGames: 3,
  seasonMinGames: 6,
  seasonMinWeeks: 2,
};
const series = {
  id: 'series-1',
  name: 'We-ball Wednesdays',
  activeSeasonId: 'season-1',
  seasons: [{ id: 'season-1', label: 'Season 1', mvpRules: rules }],
  terms: { text: 'Play respectfully.', version: 'a'.repeat(64) },
  termsScope: 'series',
  canManage: false,
};
const assignments = Array.from({ length: 10 }, (_, i) => ({
  playerId: `player-${i}`,
  displayName: `Player ${i}`,
  color: i < 5 ? 'red' : 'white',
}));
const session = {
  id: 'week-1',
  seasonId: 'season-1',
  label: 'Week 1',
  date: '2026-10-07',
  status: 'open',
  publishedAt: '2026-10-08T12:00:00Z',
  assignments,
  scoringRules: { insideArc: 1, outsideArc: 2 },
  regulationSeconds: 240,
  overtimeSeconds: 240,
  termsScope: 'series',
};
function wrapper(children) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}
function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
    </output>
  );
}
function renderSeries(path = '/scrimmage/series-1') {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/scrimmage/:scrimmageId" element={<ScrimmagePage />} />
          <Route path="/admin/scrimmage/:scrimmageId" element={<ScrimmagePage adminMode />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  scrimmagesApi.requests.mockResolvedValue({ requests: [] });
  scrimmagesApi.importOptions.mockResolvedValue({ players: [] });
  scrimmagesApi.detail.mockResolvedValue({
    scrimmage: series,
    pool: [{ id: 'player-1', displayName: 'John', isActive: true }],
    sessions: [],
    standings: [],
    membership: null,
    joinStatus: null,
  });
  scrimmagesApi.session.mockResolvedValue({
    scrimmage: series,
    session,
    games: [],
    standings: [],
    hasAcceptedTerms: true,
  });
});
afterEach(cleanup);
describe('scrimmage membership and MVP', () => {
  test('admins land on sessions with creation and terms hidden until requested', async () => {
    scrimmagesApi.detail.mockResolvedValue({
      scrimmage: { ...series, canManage: true, isOwner: true },
      pool: [],
      sessions: [],
      standings: [],
    });
    renderSeries('/scrimmage/series-1?seasonId=season-1');
    await screen.findByRole('heading', { name: 'Weekly sessions' });
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/admin/scrimmage/series-1?seasonId=season-1'
    );
    expect(screen.queryByText('Play respectfully.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Claim my profile' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Create this week’s session' })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Scrimmage settings' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'New weekly session' }));
    expect(screen.getByRole('heading', { name: 'Create this week’s session' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Settings' }));
    expect(screen.getByRole('heading', { name: 'Scrimmage settings' })).toBeInTheDocument();
    expect(screen.getByText('Edit participation terms').closest('details').open).toBe(false);
    expect(screen.queryByRole('heading', { name: 'Weekly sessions' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Claims' }));
    expect(await screen.findByText('No pending claims.')).toBeInTheDocument();
  });

  test('regular users are redirected away from admin URLs and have no admin tabs', async () => {
    renderSeries('/admin/scrimmage/series-1?tab=players&seasonId=season-1');
    expect(await screen.findByRole('link', { name: 'John' })).toHaveAttribute(
      'href',
      '/scrimmage/series-1/players/player-1?seasonId=season-1'
    );
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/scrimmage/series-1?tab=players&seasonId=season-1'
    );
    expect(screen.queryByRole('tab', { name: 'Claims' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Settings' })).not.toBeInTheDocument();
    expect(scrimmagesApi.requests).not.toHaveBeenCalled();
  });

  test('claim terms stay hidden until the player opens the claim dialog', async () => {
    renderSeries();
    const claim = await screen.findByRole('button', { name: 'Claim my profile' });
    expect(screen.queryByText('Play respectfully.')).not.toBeInTheDocument();
    fireEvent.click(claim);
    expect(await screen.findByText('Play respectfully.')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
  test('shows the agreed formula and season eligibility below the table', async () => {
    renderSeries();
    await screen.findByRole('heading', { name: 'We-ball Wednesdays' });
    fireEvent.click(screen.getByRole('tab', { name: 'MVP' }));
    await screen.findByRole('heading', { name: 'Season stats & MVP' });
    expect(
      screen.getByText(
        /MVP = \(Points − 1 × missed field goals − 2 × turnovers \+ 2 × wins − 1 × losses\) ÷ games played/
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/at least 6 games across 2 weekly sessions/)).toBeInTheDocument();
  });
  test('pool players have profile links before recording any stats', async () => {
    renderSeries();
    await screen.findByRole('heading', { name: 'We-ball Wednesdays' });
    fireEvent.click(screen.getByRole('tab', { name: 'Players' }));
    const profile = await screen.findByRole('link', { name: 'John' });
    expect(profile).toHaveAttribute(
      'href',
      '/scrimmage/series-1/players/player-1?seasonId=season-1'
    );
  });
  test('a profile claim requires explicit signed acceptance and stays pending approval', async () => {
    scrimmagesApi.join.mockResolvedValue({ status: 'pending' });
    renderSeries();
    fireEvent.click(await screen.findByRole('button', { name: 'Claim my profile' }));
    const submit = await screen.findByRole('button', { name: 'Sign & submit' });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Your player profile'), {
      target: { value: 'player-1' },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(submit);
    await waitFor(() =>
      expect(scrimmagesApi.join).toHaveBeenCalledWith('series-1', {
        playerId: 'player-1',
        displayName: 'John',
        signedName: 'John Smith',
        termsVersion: 'a'.repeat(64),
        accepted: true,
      })
    );
  });
  test('weekly stats expose the weekly formula and manual game rules', async () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter initialEntries={['/scrimmage/series-1/sessions/week-1']}>
          <Routes>
            <Route
              path="/scrimmage/:scrimmageId/sessions/:sessionId"
              element={<ScrimmageSessionPage />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
    await screen.findByRole('heading', { name: 'Week 1' });
    expect(screen.queryByRole('heading', { name: 'Weekly stats & MVP' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Players' }));
    expect(screen.getByRole('link', { name: 'Player 0' })).toHaveAttribute(
      'href',
      '/scrimmage/series-1/players/player-0?seasonId=season-1&sessionId=week-1'
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Results' }));
    expect(screen.getByText(/at least 3 games this week/)).toBeInTheDocument();
    expect(
      screen.getByText(/1\/2 scoring · 4 min regulation \+ 4 min overtime/)
    ).toBeInTheDocument();
  });
});
test('new games start with empty rosters and allow fewer than five per side', async () => {
  render(
    wrapper(
      <NewScrimmageGameDialog
        scrimmageId="series-1"
        sessionId="week-1"
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />
    )
  );
  const create = await screen.findByRole('button', { name: 'Create game' });
  expect(create).toBeDisabled();
  await waitFor(() => expect(screen.getByLabelText('home color').options).toHaveLength(3));
  fireEvent.change(screen.getByLabelText('home color'), { target: { value: 'red' } });
  fireEvent.change(screen.getByLabelText('away color'), { target: { value: 'white' } });
  expect(screen.getAllByRole('checkbox')).toHaveLength(10);
  expect(screen.getAllByRole('checkbox').every((p) => !p.checked)).toBe(true);
  fireEvent.click(screen.getAllByRole('checkbox')[0]);
  expect(create).toBeDisabled();
  fireEvent.click(screen.getAllByRole('checkbox')[5]);
  expect(create).toBeEnabled();
  scrimmagesApi.newGame.mockResolvedValue({ game: { id: 'small-game' } });
  fireEvent.click(create);
  await waitFor(() => expect(scrimmagesApi.newGame).toHaveBeenCalled());
  expect(scrimmagesApi.newGame.mock.calls[0][2].homePlayers).toHaveLength(1);
  expect(scrimmagesApi.newGame.mock.calls[0][2].awayPlayers).toHaveLength(1);
});
test('creating the next game preserves its full-video timestamp and request ID across retries', async () => {
  const created = vi.fn();
  scrimmagesApi.newGame
    .mockRejectedValueOnce(new Error('Network timeout'))
    .mockResolvedValueOnce({ game: { id: 'next-game' } });
  render(
    wrapper(
      <NewScrimmageGameDialog
        scrimmageId="series-1"
        sessionId="week-1"
        previousGameId="old-game"
        initialTimestamp={3672.5}
        onClose={vi.fn()}
        onCreated={created}
      />
    )
  );
  await waitFor(() => expect(screen.getByLabelText('away color').options).toHaveLength(3));
  fireEvent.change(screen.getByLabelText('home color'), { target: { value: 'red' } });
  fireEvent.change(screen.getByLabelText('away color'), { target: { value: 'white' } });
  for (const checkbox of screen.getAllByRole('checkbox')) fireEvent.click(checkbox);
  fireEvent.click(screen.getByRole('button', { name: 'Create game' }));
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Create game' }));
  await waitFor(() => expect(created).toHaveBeenCalledWith('next-game'));
  const first = scrimmagesApi.newGame.mock.calls[0][2];
  expect(first).toMatchObject({
    previousGameId: 'old-game',
    videoStartTimestamp: 3672.5,
    homeColor: 'red',
    awayColor: 'white',
  });
  expect(first.homePlayers).toHaveLength(5);
  expect(first.awayPlayers).toHaveLength(5);
  expect(scrimmagesApi.newGame.mock.calls[1][2].requestId).toBe(first.requestId);
  expect(
    within(screen.getByRole('dialog')).getByText(/Creating the next game finishes the current game/)
  ).toBeInTheDocument();
});

function renderWeek(adminMode = false, query = '') {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter
        initialEntries={[`${adminMode ? '/admin' : ''}/scrimmage/series-1/sessions/week-1${query}`]}
      >
        <Routes>
          <Route
            path={`${adminMode ? '/admin' : ''}/scrimmage/:scrimmageId/sessions/:sessionId`}
            element={<ScrimmageSessionPage adminMode={adminMode} />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

test('highlights an open week and links admins straight to its active tracker', async () => {
  scrimmagesApi.detail.mockResolvedValue({
    scrimmage: { ...series, canManage: true },
    pool: [],
    sessions: [
      { ...session, activeGameId: 'active-game', gameCount: 3 },
      { ...session, id: 'old-week', label: 'Earlier week', status: 'completed' },
    ],
    standings: [],
  });
  renderSeries('/admin/scrimmage/series-1');
  expect(await screen.findByRole('link', { name: 'Resume tracking' })).toHaveAttribute(
    'href',
    '/games/active-game/track'
  );
  expect(screen.getByRole('link', { name: /Earlier week/ })).toHaveAttribute(
    'href',
    '/admin/scrimmage/series-1/sessions/old-week'
  );
});

test('the weekly tracker action stays visible when viewing players or results', async () => {
  scrimmagesApi.session.mockResolvedValue({
    scrimmage: { ...series, canManage: true },
    session: { ...session, publishedAt: null },
    games: [
      {
        id: 'active-game',
        title: 'Red vs White',
        status: 'in_progress',
        finalScore: { home: 2, away: 1 },
      },
    ],
    standings: [],
  });
  renderWeek(true);
  expect(await screen.findByRole('link', { name: 'Resume game' })).toHaveAttribute(
    'href',
    '/games/active-game/track'
  );
  fireEvent.click(screen.getByRole('tab', { name: 'Players' }));
  expect(screen.getByRole('heading', { name: 'This week’s colors' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Resume game' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Results' }));
  expect(screen.getByRole('heading', { name: 'Review weekly results' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Publish results' })).toBeDisabled();
});

test('players see a publication notice instead of draft standings', async () => {
  scrimmagesApi.session.mockResolvedValue({
    scrimmage: series,
    session: { ...session, status: 'completed', publishedAt: null },
    games: [],
    standings: [],
  });
  renderWeek(false, '?tab=results');
  expect(
    await screen.findByRole('heading', { name: 'Results awaiting publication' })
  ).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Weekly stats & MVP' })).not.toBeInTheDocument();
});

test('admins review missing timestamps and explicitly publish a finished week', async () => {
  scrimmagesApi.session.mockResolvedValue({
    scrimmage: { ...series, canManage: true },
    session: { ...session, status: 'completed', publishedAt: null },
    games: [
      {
        id: 'g1',
        title: 'Red vs White',
        status: 'completed',
        finalScore: { home: 5, away: 2 },
        statCount: 8,
        missingTimestamps: 2,
      },
    ],
    standings: [],
  });
  scrimmagesApi.publishSession.mockResolvedValue({});
  renderWeek(true, '?tab=results');
  expect(await screen.findByText(/2 missing video timestamps/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Publish results' }));
  await waitFor(() =>
    expect(scrimmagesApi.publishSession).toHaveBeenCalledWith('series-1', 'week-1')
  );
});

test('new game accepts a readable position and can capture the current video position', async () => {
  scrimmagesApi.newGame.mockResolvedValue({ game: { id: 'g2' } });
  render(
    wrapper(
      <NewScrimmageGameDialog
        scrimmageId="series-1"
        sessionId="week-1"
        getCurrentVideoTime={() => 4355}
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />
    )
  );
  await waitFor(() => expect(screen.getByLabelText('home color').options).toHaveLength(3));
  fireEvent.change(screen.getByLabelText('home color'), { target: { value: 'red' } });
  fireEvent.change(screen.getByLabelText('away color'), { target: { value: 'white' } });
  fireEvent.click(screen.getAllByRole('checkbox')[0]);
  fireEvent.click(screen.getAllByRole('checkbox')[5]);
  fireEvent.click(screen.getByRole('button', { name: 'Use current video position' }));
  expect(screen.getByLabelText('Game starts at video position')).toHaveValue('1:12:35');
  fireEvent.click(screen.getByRole('button', { name: 'Create game' }));
  await waitFor(() =>
    expect(scrimmagesApi.newGame.mock.calls[0][2].videoStartTimestamp).toBe(4355)
  );
});

test('an actively tracked week takes priority over a newer prepared session', async () => {
  scrimmagesApi.detail.mockResolvedValue({
    scrimmage: { ...series, canManage: true },
    pool: [],
    sessions: [
      { ...session, id: 'next-week', label: 'Next week', activeGameId: null },
      { ...session, activeGameId: 'live-game' },
    ],
    standings: [],
  });
  renderSeries('/admin/scrimmage/series-1');
  expect(await screen.findByRole('link', { name: 'Resume tracking' })).toHaveAttribute(
    'href',
    '/games/live-game/track'
  );
  expect(screen.getByRole('link', { name: /Next week/ })).toHaveAttribute(
    'href',
    '/admin/scrimmage/series-1/sessions/next-week'
  );
});

test('Repeat last week copies active attendance and custom rules into an editable new session', async () => {
  scrimmagesApi.detail.mockResolvedValue({
    scrimmage: { ...series, canManage: true },
    pool: [
      { id: 'present', displayName: 'John', isActive: true },
      { id: 'inactive', displayName: 'Kyle', isActive: false },
      { id: 'new-player', displayName: 'Kevin', isActive: true },
    ],
    sessions: [
      {
        ...session,
        status: 'completed',
        assignments: [
          { playerId: 'present', color: 'blue' },
          { playerId: 'inactive', color: 'red' },
          { playerId: 'removed', color: 'white' },
        ],
        scoringRules: { insideArc: 2, outsideArc: 4 },
        regulationSeconds: 450,
        overtimeSeconds: 180,
        videoUrl: 'https://youtu.be/dQw4w9WgXcQ',
      },
    ],
    standings: [],
  });
  scrimmagesApi.createSession.mockResolvedValue({ session: { id: 'new-week' } });
  renderSeries('/admin/scrimmage/series-1');
  fireEvent.click(await screen.findByRole('button', { name: 'Repeat last week' }));
  expect(screen.getByLabelText('John')).toHaveValue('blue');
  expect(screen.getByLabelText('Kevin')).toHaveValue('');
  expect(screen.queryByLabelText('Kyle')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Points inside arc')).toHaveValue(2);
  expect(screen.getByLabelText('Points outside arc')).toHaveValue(4);
  expect(screen.getByLabelText('Regulation minutes')).toHaveValue(7.5);
  expect(screen.getByLabelText('Overtime minutes')).toHaveValue(3);
  expect(screen.getByLabelText('Session label')).toHaveValue('');
  expect(screen.getByLabelText('Session date')).toHaveValue('');
  expect(screen.getByLabelText('Full weekly YouTube video')).toHaveValue('');
  fireEvent.change(screen.getByLabelText('Session label'), { target: { value: 'Week 2' } });
  fireEvent.change(screen.getByLabelText('Session date'), { target: { value: '2026-10-14' } });
  fireEvent.change(screen.getByLabelText('John'), { target: { value: 'green' } });
  fireEvent.change(screen.getByLabelText('Points outside arc'), { target: { value: '3' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create weekly session' }));
  await waitFor(() =>
    expect(scrimmagesApi.createSession).toHaveBeenCalledWith(
      'series-1',
      expect.objectContaining({
        label: 'Week 2',
        date: '2026-10-14',
        assignments: [{ playerId: 'present', color: 'green' }],
        scoringRules: { insideArc: 2, outsideArc: 3 },
        regulationSeconds: 450,
        overtimeSeconds: 180,
      })
    )
  );
});
test('starting a fresh week after cancelling Repeat last week restores empty attendance and default rules', async () => {
  scrimmagesApi.detail.mockResolvedValue({
    scrimmage: { ...series, canManage: true },
    pool: [{ id: 'player-1', displayName: 'John', isActive: true }],
    sessions: [
      {
        ...session,
        assignments: [{ playerId: 'player-1', color: 'blue' }],
        scoringRules: { insideArc: 2, outsideArc: 4 },
      },
    ],
    standings: [],
  });
  renderSeries('/admin/scrimmage/series-1');
  fireEvent.click(await screen.findByRole('button', { name: 'Repeat last week' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  fireEvent.click(screen.getByRole('button', { name: 'New weekly session' }));
  expect(screen.getByLabelText('John')).toHaveValue('');
  expect(screen.getByLabelText('Points inside arc')).toHaveValue(1);
  expect(screen.getByLabelText('Points outside arc')).toHaveValue(2);
});
test('published weeks have a shareable recap tab reachable from the results', async () => {
  scrimmagesApi.session.mockResolvedValue({
    scrimmage: { ...series, isPublic: true },
    session,
    games: [],
    standings: [],
    hasAcceptedTerms: true,
  });
  renderWeek(false, '?tab=results');
  fireEvent.click(await screen.findByRole('button', { name: 'View & share weekly recap' }));
  expect(screen.getByRole('tab', { name: 'Recap' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByLabelText('Recap link')).toHaveValue(
    `${window.location.origin}/scrimmage/series-1/sessions/week-1?tab=recap`
  );
});
test('recipient recap links open the published weekly recap directly', async () => {
  scrimmagesApi.session.mockResolvedValue({
    scrimmage: { ...series, isPublic: true },
    session,
    games: [],
    standings: [],
    hasAcceptedTerms: true,
  });
  renderWeek(false, '?tab=recap');
  expect(
    await screen.findByRole('heading', { name: 'We-ball Wednesdays · Week 1' })
  ).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Recap' })).toHaveAttribute('aria-selected', 'true');
});
test('draft weekly sessions have no recap or sharing controls even for admins', async () => {
  scrimmagesApi.session.mockResolvedValue({
    scrimmage: { ...series, canManage: true },
    session: { ...session, publishedAt: null },
    games: [],
    standings: [],
    hasAcceptedTerms: true,
  });
  renderWeek(true, '?tab=results');
  await screen.findByRole('heading', { name: 'Review weekly results' });
  expect(screen.queryByRole('tab', { name: 'Recap' })).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'View & share weekly recap' })
  ).not.toBeInTheDocument();
});
