import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { ShareableCardExport } from './ShareableCardExport';

const playerCard = {
  playerName: 'Jordan Lee',
  teamName: 'Falcons',
  jerseyNumber: 23,
  playerImage: null,
  teamLogo: null,
  teamColors: [],
  summary: { pointsPerGame: 18.2, reboundsPerGame: 6.1, assistsPerGame: 4.4 },
};

function renderExport(props) {
  return render(
    <MemoryRouter>
      <ShareableCardExport {...props} />
    </MemoryRouter>
  );
}

describe('ShareableCardExport', () => {
  it('renders a player card export with the TSW watermark', () => {
    const { container, getByText } = renderExport({ type: 'player_card', playerCard });
    expect(getByText(/the sporty way/i)).toBeInTheDocument();
    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders nothing for an unknown type', () => {
    const { container } = renderExport({ type: 'nope' });
    expect(container.firstChild).toBeNull();
  });
});
