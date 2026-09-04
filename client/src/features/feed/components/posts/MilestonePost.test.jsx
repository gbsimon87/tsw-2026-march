import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
import { MilestonePost } from './MilestonePost';

function renderCard(milestoneCard) {
  return render(
    <MemoryRouter>
      <MilestonePost post={{ id: 'p1', type: 'milestone', milestoneCard }} />
    </MemoryRouter>
  );
}

describe('MilestonePost', () => {
  test('renders the milestone label and the player', () => {
    renderCard({
      milestoneKey: 'career_points_1000',
      family: 'career_threshold',
      label: '1,000 career points',
      playerName: 'Ana Ruiz',
      teamName: 'Sharks',
      gameUrl: '/games/g1',
      gameTitle: 'Sharks vs Bears',
    });

    expect(screen.getByText('1,000 career points')).toBeInTheDocument();
    expect(screen.getByText(/Ana Ruiz.*Sharks/)).toBeInTheDocument();
  });

  test('links the whole card to the game it happened in', () => {
    renderCard({
      milestoneKey: 'triple_double',
      family: 'single_game_feat',
      label: 'Triple-double',
      playerName: 'Ana Ruiz',
      teamName: 'Sharks',
      gameUrl: '/games/g1',
      gameTitle: 'Sharks vs Bears',
    });

    const link = screen.getByRole('link');

    expect(link).toHaveAttribute('href', '/games/g1');
    // The achievement itself must sit inside the link — a link on the game
    // title alone is the affordance players were missing.
    expect(link).toHaveTextContent('Triple-double');
  });

  test('exposes a single link so the card is not a nested anchor', () => {
    renderCard({
      milestoneKey: 'triple_double',
      family: 'single_game_feat',
      label: 'Triple-double',
      playerName: 'Ana Ruiz',
      teamName: 'Sharks',
      gameUrl: '/games/g1',
      gameTitle: 'Sharks vs Bears',
    });

    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  test('renders the card unlinked when the snapshot has no game url', () => {
    renderCard({
      milestoneKey: 'career_points_1000',
      family: 'career_threshold',
      label: '1,000 career points',
      playerName: 'Ana Ruiz',
      teamName: 'Sharks',
      gameUrl: null,
      gameTitle: 'Sharks vs Bears',
    });

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('1,000 career points')).toBeInTheDocument();
  });

  test('renders nothing when the snapshot is missing', () => {
    const { container } = render(
      <MemoryRouter>
        <MilestonePost post={{ id: 'p1', type: 'milestone', milestoneCard: null }} />
      </MemoryRouter>
    );
    expect(container).toBeEmptyDOMElement();
  });
});
