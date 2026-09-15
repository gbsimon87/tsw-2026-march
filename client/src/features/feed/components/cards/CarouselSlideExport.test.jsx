import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { ShareableCardExport, ShareableCardPreview } from './ShareableCardExport';
import { buildCarouselSlides } from './carouselSlides';
import { EXPORT_HEIGHT, EXPORT_WIDTH } from './shareExportTheme';

const game = {
  game: {
    id: 'g1',
    status: 'completed',
    trackingMode: 'dual_team',
    completedAt: '2026-09-12T20:45:00.000Z',
  },
  team: { colors: ['#1B4332'] },
  recap: {
    statusLabel: 'Final',
    playedAt: '2026-09-12T20:45:00.000Z',
    home: { name: 'Demo Lions', points: 74 },
    away: { name: 'Demo Bears', points: 70 },
    homeStats: {
      points: 74,
      fg2: { percentage: 52 },
      fg3: { percentage: 31 },
      ft: { percentage: 71 },
      reb: 34,
      ast: 18,
    },
    awayStats: {
      points: 70,
      fg2: { percentage: 48 },
      fg3: { percentage: 36 },
      ft: { percentage: 64 },
      reb: 30,
      ast: 21,
    },
    topPerformers: [
      { displayName: 'Jordan Blake', points: 28, reb: 9, ast: 6 },
      { displayName: 'Sam Reed', points: 21, reb: 4, ast: 2 },
    ],
  },
};

function slideOf(kind, options = {}) {
  return buildCarouselSlides(game, { only: [kind], ...options })[0];
}

function renderSlide(kind, options) {
  return render(
    <MemoryRouter>
      <ShareableCardExport type="carousel_slide" carouselSlide={slideOf(kind, options)} />
    </MemoryRouter>
  );
}

describe('CarouselSlideExport', () => {
  it.each(['result', 'comparison', 'performers', 'cta'])(
    'frames the %s slide at exactly 1080x1350',
    (kind) => {
      const { container } = renderSlide(kind);
      const node = container.firstChild;

      // Every slide is a carousel slide: there is no story or link variant, so
      // the board's own size is the export size.
      expect(node).toHaveStyle({
        width: `${EXPORT_WIDTH}px`,
        height: `${EXPORT_HEIGHT}px`,
      });
      expect(node.dataset.captureScale).toBe('2');
    }
  );

  it.each(['result', 'comparison', 'performers', 'cta'])(
    'signs the %s slide with the handle and a CTA',
    (kind) => {
      // Shared Design Requirements: a slide reposted on its own still has to
      // carry them.
      renderSlide(kind);
      expect(screen.getByText('The Sporty Way')).toBeInTheDocument();
      expect(screen.getByText(/@TheSportyWay · Full box score in profile/)).toBeInTheDocument();
    }
  );

  it('puts both scores on the result slide', () => {
    renderSlide('result');

    expect(screen.getByText('Demo Lions')).toBeInTheDocument();
    expect(screen.getByText('74')).toBeInTheDocument();
    expect(screen.getByText('Demo Bears')).toBeInTheDocument();
    expect(screen.getByText('70')).toBeInTheDocument();
    expect(screen.getByText('FINAL')).toBeInTheDocument();
  });

  it('lays the comparison out as two columns against shared labels', () => {
    renderSlide('comparison');

    expect(screen.getByText('VS')).toBeInTheDocument();
    expect(screen.getByText('52%')).toBeInTheDocument();
    expect(screen.getByText('48%')).toBeInTheDocument();
    // Each stat label appears once, between the two figures.
    for (const label of ['2PT', '3PT', 'FT', 'REB', 'AST']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('drops the second column for a game that tracked one roster', () => {
    const oneSided = {
      game: { id: 'g2', status: 'completed', trackingMode: 'one_sided', opponent: 'Falcons' },
      team: { name: 'TSW Blue', colors: [] },
      recap: {
        statusLabel: 'Final',
        team: { name: 'TSW Blue', points: 70 },
        opponent: { name: 'Falcons', points: 61 },
        teamStats: { points: 70, fg2: { percentage: 48 }, reb: 34 },
      },
    };
    const slide = buildCarouselSlides(oneSided, { only: ['comparison'] })[0];

    render(
      <MemoryRouter>
        <ShareableCardExport type="carousel_slide" carouselSlide={slide} />
      </MemoryRouter>
    );

    expect(screen.queryByText('VS')).not.toBeInTheDocument();
    expect(screen.getByText('TEAM TOTALS')).toBeInTheDocument();
  });

  it('inscribes each performer as one name and one line', () => {
    renderSlide('performers');

    expect(screen.getByText('Jordan Blake')).toBeInTheDocument();
    expect(screen.getByText('28 PTS, 9 REB, 6 AST')).toBeInTheDocument();
    expect(screen.getByText('Sam Reed')).toBeInTheDocument();
  });

  it('shows the tagged link on the CTA slide without its scheme', () => {
    renderSlide('cta', { attributionUrl: 'https://thesportyway.com/games/g1?utm_source=tiktok' });

    expect(screen.getByText('Every stat, tracked live.')).toBeInTheDocument();
    expect(screen.getByText('thesportyway.com/games/g1?utm_source=tiktok')).toBeInTheDocument();
  });

  it('renders the same composition in the preview, at preview scale', () => {
    const { container } = render(
      <MemoryRouter>
        <ShareableCardPreview type="carousel_slide" carouselSlide={slideOf('result')} />
      </MemoryRouter>
    );

    expect(container.firstChild).toHaveStyle({ width: '280px' });
    expect(screen.getByText('Demo Lions')).toBeInTheDocument();
  });

  it('renders nothing for a slide kind it does not know', () => {
    const { container } = render(
      <MemoryRouter>
        <ShareableCardExport type="carousel_slide" carouselSlide={{ kind: 'invented' }} />
      </MemoryRouter>
    );

    expect(container).toBeEmptyDOMElement();
  });
});
