import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { ShareableCardExport, ShareableCardPreview } from './ShareableCardExport';
import { buildLeaderboardCards } from './leaderboardCards';
import { SOCIAL_EXPORT_PRESETS } from './socialExportPresets';
import { EXPORT_HEIGHT, EXPORT_WIDTH } from './shareExportTheme';

const league = { name: 'Southside Hoops', slug: 'southside-hoops' };

const categoryLeaders = [
  {
    key: 'points',
    statKey: 'ppg',
    abbreviation: 'PPG',
    label: 'Points per game',
    qualifiedCount: 3,
    rows: [
      { displayName: 'Jordan Blake', teamName: 'Alpha', gamesCount: 4, ppg: 24.4 },
      { displayName: 'Sam Reed', teamName: 'Bravo', gamesCount: 5, ppg: 19.25 },
      { displayName: 'Cara Pace', teamName: 'Charlie', gamesCount: 1, ppg: 30 },
    ],
  },
];

const standings = [
  { teamId: 't1', teamName: 'Alpha', record: '6-1', pointDiff: 58 },
  { teamId: 't2', teamName: 'Bravo', record: '5-2', pointDiff: 31 },
  { teamId: 't3', teamName: 'Charlie', record: '3-4', pointDiff: -12 },
];

const formByTeam = new Map([['t1', [{ result: 'win' }, { result: 'loss' }, { result: 'tie' }]]]);

function cardOf(kind) {
  return buildLeaderboardCards({
    league,
    categoryLeaders,
    standings,
    formByTeam,
    seasonLabel: '2026 Season',
  }).find((card) => card.kind === kind);
}

function renderCard(kind, format = 'post') {
  return render(
    <MemoryRouter>
      <ShareableCardExport type="leaderboard_card" leaderboardCard={cardOf(kind)} format={format} />
    </MemoryRouter>
  );
}

describe('LeaderboardCardExport', () => {
  it('frames the 4:5 card at 1080x1350 and captures it at 2x', () => {
    const { container } = renderCard('points');

    expect(container.firstChild).toHaveStyle({
      width: `${EXPORT_WIDTH}px`,
      height: `${EXPORT_HEIGHT}px`,
    });
    expect(container.firstChild.dataset.captureScale).toBe('2');
  });

  it('frames the 9:16 card at its exact target size, captured at 1x', () => {
    const { container } = renderCard('points', 'story');
    const node = container.firstChild;

    // The story preset is composed at full size, so a second capture pass would
    // produce a 2160x3840 PNG no platform asked for.
    expect(node).toHaveStyle({
      width: `${SOCIAL_EXPORT_PRESETS.story.width}px`,
      height: `${SOCIAL_EXPORT_PRESETS.story.height}px`,
    });
    expect(node.dataset.captureScale).toBe('1');
    expect(node.dataset.exportHeight).toBe(String(SOCIAL_EXPORT_PRESETS.story.height));
  });

  it('is the same composition at both sizes, not a second design', () => {
    const { unmount } = renderCard('points');
    expect(screen.getByText('PPG LEADERS')).toBeInTheDocument();
    expect(screen.getByText('Jordan Blake')).toBeInTheDocument();
    unmount();

    renderCard('points', 'story');
    expect(screen.getByText('PPG LEADERS')).toBeInTheDocument();
    expect(screen.getByText('Jordan Blake')).toBeInTheDocument();
  });

  it('names the league, the category and every ranked player', () => {
    renderCard('points');

    expect(screen.getByText('Southside Hoops')).toBeInTheDocument();
    expect(screen.getByText('Points per game')).toBeInTheDocument();
    expect(screen.getByText('2026 Season')).toBeInTheDocument();
    expect(screen.getByText('24.4')).toBeInTheDocument();
    expect(screen.getByText('19.3')).toBeInTheDocument();
  });

  it('shows the games played behind each average', () => {
    // A 30.0 average off one game is a true fact that must not read as a
    // season, so the sample travels with it.
    renderCard('points');

    expect(screen.getByText('Charlie · 1 GP')).toBeInTheDocument();
    expect(screen.getByText('Alpha · 4 GP')).toBeInTheDocument();
  });

  it('draws recent form as result pips on the table card', () => {
    renderCard('table');

    expect(screen.getByText('LEAGUE TABLE')).toBeInTheDocument();
    expect(screen.getByText('6-1')).toBeInTheDocument();
    expect(screen.getByText('W')).toBeInTheDocument();
    expect(screen.getByText('L')).toBeInTheDocument();
    expect(screen.getByText('D')).toBeInTheDocument();
  });

  it('signs every card with the handle and a CTA', () => {
    renderCard('points');
    expect(screen.getByText('The Sporty Way')).toBeInTheDocument();
    expect(screen.getByText(/@TheSportyWay · Full table in profile/)).toBeInTheDocument();
  });

  it('shows the text-safe guide in the 9:16 preview only', () => {
    const { container, unmount } = render(
      <MemoryRouter>
        <ShareableCardPreview
          type="leaderboard_card"
          leaderboardCard={cardOf('points')}
          format="story"
        />
      </MemoryRouter>
    );
    expect(container.querySelector('[data-safe-area-overlay]')).not.toBeNull();
    unmount();

    const { container: post } = render(
      <MemoryRouter>
        <ShareableCardPreview type="leaderboard_card" leaderboardCard={cardOf('points')} />
      </MemoryRouter>
    );
    expect(post.querySelector('[data-safe-area-overlay]')).toBeNull();
  });

  it('renders nothing for a card with no rows', () => {
    const { container } = render(
      <MemoryRouter>
        <ShareableCardExport
          type="leaderboard_card"
          leaderboardCard={{ kind: 'points', rows: [] }}
        />
      </MemoryRouter>
    );

    expect(container).toBeEmptyDOMElement();
  });
});
