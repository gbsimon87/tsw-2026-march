import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createImageFile: vi.fn(), trackEvent: vi.fn() }));
const { createImageFile, trackEvent } = mocks;

vi.mock('../../feed/hooks/useShareImage', () => ({
  useShareImage: () => ({
    createImageFile: mocks.createImageFile,
    shareImage: vi.fn(),
    status: 'idle',
  }),
}));

vi.mock('../../analytics/trackEvent', () => ({ trackEvent: mocks.trackEvent }));

vi.mock('../../feed/components/cards/ShareableCardExport', () => ({
  ShareableCardExport: forwardRef(function MockExport({ format }, ref) {
    return <div ref={ref} data-testid="export-node" data-format={format} />;
  }),
  ShareableCardPreview: ({ format }) => <div data-testid="preview" data-format={format} />,
}));

import { LeaderboardCardsModal } from './LeaderboardCardsModal';

// Social backlog rank 9: no permission block means no export, so every test
// that downloads has to say what the league agreed to.
const GRANTED = {
  canFeature: true,
  reason: 'granted',
  scope: 'league',
  orgName: 'Southside Hoops',
  restrictedPlayerIds: [],
  handles: {},
};

const ORIGIN = 'https://thesportyway.com';
const league = { name: 'Southside Hoops', slug: 'southside-hoops' };

function category(key, abbreviation, statKey, rows) {
  return {
    key,
    statKey,
    abbreviation,
    label: `${key[0].toUpperCase()}${key.slice(1)} per game`,
    qualifiedCount: rows.length,
    rows,
  };
}

const categoryLeaders = [
  category('points', 'PPG', 'ppg', [
    { displayName: 'Jordan Blake', teamName: 'Alpha', gamesCount: 4, ppg: 24.4 },
    { displayName: 'Sam Reed', teamName: 'Bravo', gamesCount: 5, ppg: 19.25 },
    { displayName: 'Cara Pace', teamName: 'Charlie', gamesCount: 3, ppg: 12 },
  ]),
  category('rebounds', 'RPG', 'rpg', []),
  category('assists', 'APG', 'apg', []),
];

const standings = [
  { teamId: 't1', teamName: 'Alpha', record: '6-1', pointDiff: 58 },
  { teamId: 't2', teamName: 'Bravo', record: '5-2', pointDiff: 31 },
  { teamId: 't3', teamName: 'Charlie', record: '3-4', pointDiff: -12 },
];

let lastDownload;

beforeEach(() => {
  vi.clearAllMocks();
  lastDownload = null;
  createImageFile.mockImplementation((node, fileName) =>
    Promise.resolve(new File([new Uint8Array([1])], fileName, { type: 'image/png' }))
  );
  URL.createObjectURL = vi.fn(() => 'blob:card');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function capture() {
    lastDownload = this.download;
  });
});

afterEach(cleanup);

function renderModal(props = {}) {
  return render(
    <LeaderboardCardsModal
      open
      onClose={() => {}}
      league={league}
      categoryLeaders={categoryLeaders}
      standings={standings}
      seasonLabel="2026 Season"
      origin={ORIGIN}
      marketing={GRANTED}
      {...props}
    />
  );
}

describe('LeaderboardCardsModal', () => {
  it('lists only the cards this league can actually publish', () => {
    renderModal();

    expect(screen.getByText('Points per game')).toBeVisible();
    expect(screen.getByText('League table')).toBeVisible();
    // Rebounds and assists were suppressed server-side for want of three
    // qualified players; an empty podium is never offered.
    expect(screen.queryByText('Rebounds per game')).not.toBeInTheDocument();
  });

  it('renders nothing when no category survived and there is no table', () => {
    const { container } = renderModal({
      categoryLeaders: categoryLeaders.map((entry) => ({ ...entry, rows: [] })),
      standings: [],
    });

    expect(container).toBeEmptyDOMElement();
  });

  it('downloads a 4:5 card under a league-and-category file name', async () => {
    renderModal();

    fireEvent.click(screen.getAllByRole('button', { name: 'Download PNG' })[0]);

    await waitFor(() => expect(lastDownload).toBe('southside-hoops-points.png'));
    expect(trackEvent).toHaveBeenCalledWith('share_initiated', {
      target_type: 'leaderboard_card',
      method: 'download',
      source: 'league_page',
      format: 'post',
    });
    expect(trackEvent).toHaveBeenCalledWith(
      'share_completed',
      expect.objectContaining({ target_type: 'leaderboard_card', result: 'succeeded' })
    );
  });

  it('switches every card and the file name to 9:16', async () => {
    renderModal();

    fireEvent.change(screen.getByRole('combobox', { name: /image format/i }), {
      target: { value: 'story' },
    });

    expect(screen.getAllByTestId('preview')[0].dataset.format).toBe('story');
    expect(screen.getByText(/text-safe area/)).toBeVisible();

    fireEvent.click(screen.getAllByRole('button', { name: 'Download PNG' })[0]);
    await waitFor(() => expect(lastDownload).toBe('southside-hoops-points-story.png'));
    expect(trackEvent).toHaveBeenCalledWith(
      'share_initiated',
      expect.objectContaining({ format: 'story' })
    );
  });

  it('tags the caption link for the chosen destination', () => {
    renderModal();

    fireEvent.change(screen.getByRole('combobox', { name: /posting destination/i }), {
      target: { value: 'tiktok' },
    });

    const caption = screen.getByLabelText('Generated caption').value;
    expect(caption).toContain('Southside Hoops: Points per game');
    expect(caption).toContain(`${ORIGIN}/league/southside-hoops?utm_source=tiktok`);
  });

  it('reports a failed render rather than downloading nothing silently', async () => {
    createImageFile.mockResolvedValueOnce(null);
    renderModal();

    fireEvent.click(screen.getAllByRole('button', { name: 'Download PNG' })[0]);

    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not render/);
    expect(lastDownload).toBeNull();
  });
});
