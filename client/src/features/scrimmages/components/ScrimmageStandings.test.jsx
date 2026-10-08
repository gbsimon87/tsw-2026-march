import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, test } from 'vitest';
import { eligibilityMessage, ScrimmageStandings } from './ScrimmageStandings';
const rules = {
  missPenalty: 1,
  turnoverPenalty: 2,
  winBonus: 2,
  lossPenalty: 1,
  weeklyMinGames: 3,
  seasonMinGames: 6,
  seasonMinWeeks: 2,
};
const row = {
  playerId: 'p1',
  displayName: 'John',
  gamesPlayed: 2,
  weeksPlayed: 1,
  points: 5,
  makes: 4,
  attempts: 6,
  misses: 2,
  turnovers: 1,
  wins: 1,
  losses: 1,
  draws: 0,
  fgPercentage: 66.666,
  mvpScore: 1,
  eligible: false,
};
afterEach(cleanup);
test('eligibility explains both remaining games and weekly attendance', () => {
  expect(eligibilityMessage(row, rules, 'weekly')).toBe('1 more game needed');
  expect(eligibilityMessage(row, rules, 'season')).toBe(
    '4 more games needed · Play in another week'
  );
  expect(eligibilityMessage({ ...row, gamesPlayed: 6 }, rules, 'season')).toBe(
    'Play in another week'
  );
  expect(eligibilityMessage({ ...row, eligible: true }, rules, 'season')).toBe('Eligible for MVP');
});
test('mobile cards prioritize core metrics and keep supporting stats expandable', () => {
  render(
    <MemoryRouter>
      <ScrimmageStandings
        rows={[row]}
        rules={rules}
        scrimmageId="s1"
        seasonId="season1"
        scope="season"
      />
    </MemoryRouter>
  );
  const card = within(screen.getByRole('article'));
  expect(card.getByRole('link', { name: 'John' })).toHaveAttribute(
    'href',
    '/scrimmage/s1/players/p1?seasonId=season1'
  );
  expect(card.getByText('Points')).toBeInTheDocument();
  expect(card.getByText('FG%')).toBeInTheDocument();
  expect(card.getByText('Turnovers')).toBeInTheDocument();
  expect(card.getByText('4 more games needed · Play in another week')).toBeInTheDocument();
  expect(card.getByText('Supporting stats').closest('details').open).toBe(false);
  expect(screen.getByText(/MVP =/)).toBeInTheDocument();
});
