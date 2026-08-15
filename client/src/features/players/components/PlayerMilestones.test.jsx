import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
import { PlayerMilestones } from './PlayerMilestones';

const MILESTONES = [
  {
    id: 'm1',
    milestoneKey: 'career_points_1000',
    family: 'career_threshold',
    label: '1,000 career points',
    achievedAt: '2026-07-04T20:00:00.000Z',
    gameUrl: '/games/g1',
  },
  {
    id: 'm2',
    milestoneKey: 'triple_double',
    family: 'single_game_feat',
    label: 'Triple-double',
    achievedAt: '2026-06-21T20:00:00.000Z',
    gameUrl: '/games/g2',
  },
];

function renderList(props) {
  return render(
    <MemoryRouter>
      <PlayerMilestones {...props} />
    </MemoryRouter>
  );
}

describe('PlayerMilestones', () => {
  test('lists each milestone', () => {
    renderList({ milestones: MILESTONES, total: 2 });
    expect(screen.getByText('1,000 career points')).toBeInTheDocument();
    expect(screen.getByText('Triple-double')).toBeInTheDocument();
  });

  test('shows an empty state when there are none', () => {
    renderList({ milestones: [], total: 0 });
    expect(screen.getByText(/No milestones yet/i)).toBeInTheDocument();
  });

  test('indicates when more exist than are shown', () => {
    renderList({ milestones: MILESTONES, total: 9 });
    expect(screen.getByText(/9/)).toBeInTheDocument();
  });
});
