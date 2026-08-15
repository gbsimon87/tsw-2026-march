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

  test('links to the game it happened in', () => {
    renderCard({
      milestoneKey: 'triple_double',
      family: 'single_game_feat',
      label: 'Triple-double',
      playerName: 'Ana Ruiz',
      teamName: 'Sharks',
      gameUrl: '/games/g1',
      gameTitle: 'Sharks vs Bears',
    });

    expect(screen.getByRole('link', { name: /Sharks vs Bears/ })).toHaveAttribute(
      'href',
      '/games/g1'
    );
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
