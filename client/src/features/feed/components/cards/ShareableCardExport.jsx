import { forwardRef } from 'react';

import {
  buildInitials,
  formatAverage,
  formatCompactDate,
  formatPercentage,
} from '../posts/cardUtils';
import { Board, GiltBead, Identity, Ledger, Spacer } from './boardExportParts';
import { CarouselSlideExport, canRenderSlide } from './CarouselSlideExport';
import { LeaderboardCardExport } from './LeaderboardCardExport';
import { pickContextStat } from './playerGameCard';
import { GameCardPost } from '../posts/GameCardPost';
import { SocialPresetCard } from './SocialPresetCard';
import { SOCIAL_EXPORT_PRESETS, socialExportPreset } from './socialExportPresets';
import {
  BOARD_CAPTURE_SCALE,
  COLORS,
  DISPLAY_FONT,
  EXPORT_HEIGHT,
  EXPORT_WIDTH,
  GAME_CAPTURE_SCALE,
  GAME_FRAME_HEIGHT,
  GAME_FRAME_WIDTH,
  MONO_FONT,
  readableAccent,
} from './shareExportTheme';

// Off-screen render target captured by html2canvas. Positioned off-viewport
// (NOT display:none) because html2canvas needs a laid-out node.
//
// The 4:5 compositions answer different questions.
//
// Player and team cards are an honours board — a varnished panel, gilt beading,
// and the record inscribed as a ruled ledger — composed directly at 1080x1350.
// Reusing the feed card at that size left 11px kickers and a 288px-tall card
// stranded in half a screen of black, so these are drawn for the poster.
//
// The game card is the opposite: operators hand it to Instagram, and the image
// has to be the card they approved in The Pulse, not a second design that could
// drift from it. So GameExport mounts the real <GameCardPost/> at feed scale
// inside a TSW frame, and the capture scale enlarges it. See shareExportTheme
// for why the enlargement is html2canvas' and not a CSS transform's.
const EXPORT_STYLE = {
  position: 'absolute',
  left: '-99999px',
  top: 0,
  pointerEvents: 'none',
};

// The identity block is a fixed height so a long name can never push the
// ledger and footer off the board — the name sizes down to fit it instead.
function PlayerExport({ playerCard }) {
  const accent = readableAccent(playerCard?.teamColors);
  const imageSrc = playerCard?.playerImage?.url || playerCard?.teamLogo?.url || null;
  const jersey = playerCard?.jerseyNumber;

  return (
    <Board kicker="Season averages" serial={typeof jersey === 'number' ? `No. ${jersey}` : ''}>
      <Identity
        accent={accent}
        imageSrc={imageSrc}
        imageAlt={`${playerCard.playerName} share card portrait`}
        initials={buildInitials(playerCard.playerName, 'PL')}
        headline={playerCard.playerName}
        sub={playerCard.teamName}
      />
      <Spacer />
      <Ledger
        rowHeight={220}
        valueSize={150}
        rows={[
          {
            label: 'Points per game',
            value: formatAverage(playerCard.summary?.pointsPerGame),
            lead: true,
          },
          { label: 'Rebounds per game', value: formatAverage(playerCard.summary?.reboundsPerGame) },
          { label: 'Assists per game', value: formatAverage(playerCard.summary?.assistsPerGame) },
        ]}
      />
    </Board>
  );
}

// Social backlog rank 2. Same honours-board furniture as PlayerExport, but the
// record inscribed is ONE game, not a season: the kicker says so, the serial
// carries the result, and the identity sub-line carries the matchup and date —
// the three things a viewer needs before the caption to understand what they
// are looking at.
function PlayerGameExport({ playerGameCard }) {
  const accent = readableAccent(playerGameCard?.teamColors);
  const imageSrc = playerGameCard?.playerImage?.url || playerGameCard?.teamLogo?.url || null;
  const context = pickContextStat(playerGameCard.stats);
  const matchup = [playerGameCard.teamName, playerGameCard.opponentName]
    .filter(Boolean)
    .join(' vs ');

  return (
    <Board kicker="Game performance" serial={playerGameCard.resultLabel || ''}>
      <Identity
        accent={accent}
        imageSrc={imageSrc}
        imageAlt={`${playerGameCard.playerName} share card portrait`}
        initials={buildInitials(playerGameCard.playerName, 'PL')}
        headline={playerGameCard.playerName}
        sub={[matchup, formatCompactDate(playerGameCard.playedOn)].filter(Boolean).join(' \u00b7 ')}
      />
      <Spacer />
      <Ledger
        rowHeight={166}
        valueSize={114}
        rows={[
          { label: 'Points', value: playerGameCard.stats?.points ?? 0, lead: true },
          { label: 'Rebounds', value: playerGameCard.stats?.reb ?? 0 },
          { label: 'Assists', value: playerGameCard.stats?.ast ?? 0 },
          { label: context.label, value: context.value },
        ]}
      />
    </Board>
  );
}

// Social backlog rank 3. The achievement takes the display slot a player's name
// occupies on the other boards, because that is what the post is about; the
// player and team qualify it underneath. The source game is inscribed below as
// the provenance for the claim.
export const MILESTONE_FAMILY_KICKERS = {
  career_threshold: 'Career milestone',
  single_game_feat: 'Standout game',
  first: 'First',
};

function MilestoneExport({ milestoneCard }) {
  const accent = readableAccent(milestoneCard?.teamColors);
  // buildMilestoneCardSnapshot stores these as plain strings, not the { url }
  // objects the other card types carry.
  const imageSrc = milestoneCard?.playerAvatarUrl || milestoneCard?.teamLogo || null;
  const player = [
    milestoneCard.playerName,
    typeof milestoneCard.jerseyNumber === 'number' ? `#${milestoneCard.jerseyNumber}` : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Board
      kicker={MILESTONE_FAMILY_KICKERS[milestoneCard.family] || 'Milestone'}
      serial={formatCompactDate(milestoneCard.achievedAt)}
      footnote="@TheSportyWay \u00b7 Full story in profile"
    >
      <Identity
        accent={accent}
        imageSrc={imageSrc}
        imageAlt={`${milestoneCard.playerName} milestone portrait`}
        initials={buildInitials(milestoneCard.playerName, 'PL')}
        headline={milestoneCard.label}
        sub={[player, milestoneCard.teamName].filter(Boolean).join(' \u00b7 ')}
      />
      <Spacer />
      {milestoneCard.gameTitle ? (
        <div style={{ flexShrink: 0 }}>
          <GiltBead />
          <div
            style={{
              padding: '34px 0',
              fontFamily: MONO_FONT,
              fontWeight: 500,
              fontSize: '27px',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: COLORS.tan,
              overflowWrap: 'break-word',
            }}
          >
            {milestoneCard.gameTitle}
          </div>
          <GiltBead />
        </div>
      ) : null}
    </Board>
  );
}

// The frame is deliberately quiet: a gilt bead and a wordmark, so the card is
// the only thing competing for attention in the feed it lands in.
function GameExport({ gameCard }) {
  return (
    <div
      style={{
        width: `${GAME_FRAME_WIDTH}px`,
        height: `${GAME_FRAME_HEIGHT}px`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        backgroundColor: COLORS.ink,
      }}
    >
      <div style={{ height: '3px', backgroundColor: COLORS.goldLeaf }} />
      <div style={{ height: '9px', backgroundColor: COLORS.gold }} />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '22px 20px 0',
          flexShrink: 0,
        }}
      >
        <div style={{ width: '11px', height: '11px', backgroundColor: COLORS.gold }} />
        <div
          style={{
            fontFamily: DISPLAY_FONT,
            fontSize: '13px',
            letterSpacing: '0.26em',
            textTransform: 'uppercase',
            color: COLORS.paper,
          }}
        >
          The Sporty Way
        </div>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 16px',
        }}
      >
        <div style={{ width: '400px' }}>
          <GameCardPost gameCard={gameCard} interactive={false} exportSafe />
        </div>
      </div>

      <div
        style={{
          padding: '0 20px 22px',
          textAlign: 'right',
          fontFamily: MONO_FONT,
          fontWeight: 500,
          fontSize: '11px',
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: COLORS.tan,
          flexShrink: 0,
        }}
      >
        thesportyway.com
      </div>
    </div>
  );
}

function TeamExport({ teamCard }) {
  const accent = readableAccent(teamCard?.teamColors);
  const games = teamCard.summary?.gamesCount ?? 0;

  return (
    <Board kicker="Season summary" serial={`${games} ${games === 1 ? 'game' : 'games'}`}>
      <Identity
        accent={accent}
        imageSrc={teamCard?.teamLogo?.url || null}
        imageAlt={`${teamCard.teamName} share card logo`}
        initials={buildInitials(teamCard.teamName, 'TM')}
        headline={teamCard.teamName}
        sub=""
      />
      <Spacer />
      <Ledger
        rowHeight={166}
        valueSize={114}
        rows={[
          { label: 'Points', value: teamCard.summary?.points ?? 0, lead: true },
          { label: '2-point', value: formatPercentage(teamCard.summary?.fg2?.percentage) },
          { label: '3-point', value: formatPercentage(teamCard.summary?.fg3?.percentage) },
          { label: 'Free throw', value: formatPercentage(teamCard.summary?.ft?.percentage) },
        ]}
      />
    </Board>
  );
}

// Each composition declares the scale html2canvas must capture it at. The
// existing game-card post stays exactly 1080x1350 for the Instagram handoff;
// the new story and link compositions render directly at their target size.
function renderCard({
  type,
  gameCard,
  playerCard,
  playerGameCard,
  milestoneCard,
  teamCard,
  carouselSlide,
  leaderboardCard,
  format = 'post',
}) {
  // Social backlog rank 8. The leaderboard card has its own 4:5 AND 9:16
  // compositions on the shared board, so it never reaches SocialPresetCard.
  if (type === 'leaderboard_card' && leaderboardCard?.rows?.length) {
    const preset = socialExportPreset(format === 'story' ? 'story' : 'post');
    return {
      card: <LeaderboardCardExport leaderboardCard={leaderboardCard} format={format} />,
      width: preset.width,
      height: preset.height,
      // Matches what each preset already does elsewhere: the 4:5 board is
      // composed at 1080x1350 and captured at 2x for crispness, while the 9:16
      // preset is composed at its exact target size and captured at 1x.
      captureScale: format === 'story' ? 1 : BOARD_CAPTURE_SCALE,
      safeArea: preset.safeArea,
    };
  }
  // Social backlog rank 7. A slide is composed at the board's own 1080x1350 and
  // has no story or link variant: a carousel is a 4:5 format by definition, so
  // the preset branch below is deliberately not consulted for it.
  if (type === 'carousel_slide' && canRenderSlide(carouselSlide)) {
    return {
      card: <CarouselSlideExport carouselSlide={carouselSlide} />,
      width: EXPORT_WIDTH,
      height: EXPORT_HEIGHT,
      captureScale: BOARD_CAPTURE_SCALE,
    };
  }
  if (format !== 'post' && SOCIAL_EXPORT_PRESETS[format]) {
    const cardData = {
      game_card: gameCard,
      player_card: playerCard,
      player_game_card: playerGameCard,
      milestone: milestoneCard,
      team_card: teamCard,
    }[type];
    if (!cardData) return null;
    const preset = socialExportPreset(format);
    return {
      card: (
        <SocialPresetCard
          format={format}
          type={type}
          gameCard={gameCard}
          playerCard={playerCard}
          playerGameCard={playerGameCard}
          milestoneCard={milestoneCard}
          teamCard={teamCard}
        />
      ),
      width: preset.width,
      height: preset.height,
      captureScale: 1,
      safeArea: preset.safeArea,
    };
  }
  if (type === 'game_card' && gameCard) {
    return {
      card: <GameExport gameCard={gameCard} />,
      width: GAME_FRAME_WIDTH,
      height: GAME_FRAME_HEIGHT,
      captureScale: GAME_CAPTURE_SCALE,
    };
  }
  if (type === 'player_card' && playerCard) {
    return {
      card: <PlayerExport playerCard={playerCard} />,
      width: EXPORT_WIDTH,
      height: EXPORT_HEIGHT,
      captureScale: BOARD_CAPTURE_SCALE,
    };
  }
  if (type === 'player_game_card' && playerGameCard) {
    return {
      card: <PlayerGameExport playerGameCard={playerGameCard} />,
      width: EXPORT_WIDTH,
      height: EXPORT_HEIGHT,
      captureScale: BOARD_CAPTURE_SCALE,
    };
  }
  if (type === 'milestone' && milestoneCard) {
    return {
      card: <MilestoneExport milestoneCard={milestoneCard} />,
      width: EXPORT_WIDTH,
      height: EXPORT_HEIGHT,
      captureScale: BOARD_CAPTURE_SCALE,
    };
  }
  if (type === 'team_card' && teamCard) {
    return {
      card: <TeamExport teamCard={teamCard} />,
      width: EXPORT_WIDTH,
      height: EXPORT_HEIGHT,
      captureScale: BOARD_CAPTURE_SCALE,
    };
  }
  return null;
}

export const ShareableCardExport = forwardRef(function ShareableCardExport(props, ref) {
  const rendered = renderCard(props);
  if (!rendered) return null;

  return (
    <div
      ref={ref}
      aria-hidden="true"
      data-capture-scale={rendered.captureScale}
      data-export-width={
        props.format && props.format !== 'post' ? rendered.width * rendered.captureScale : undefined
      }
      data-export-height={
        props.format && props.format !== 'post'
          ? rendered.height * rendered.captureScale
          : undefined
      }
      style={{
        ...EXPORT_STYLE,
        width: `${rendered.width}px`,
        height: `${rendered.height}px`,
      }}
    >
      {rendered.card}
    </div>
  );
});

// The preview mounts the very same composition as the off-screen export, at a
// smaller visual scale. The guide is outside the captured node and never lands
// in the PNG.
export function ShareableCardPreview(props) {
  const rendered = renderCard(props);
  if (!rendered) return null;

  const previewWidth = 280;
  const scale = previewWidth / rendered.width;
  const safe = rendered.safeArea;

  return (
    <div
      aria-hidden="true"
      data-preview-format={props.format || 'post'}
      style={{
        position: 'relative',
        width: `${previewWidth}px`,
        height: `${rendered.height * scale}px`,
        overflow: 'hidden',
        backgroundColor: COLORS.ink,
      }}
    >
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        {rendered.card}
      </div>
      {safe ? (
        <div
          data-safe-area-overlay="true"
          style={{
            position: 'absolute',
            top: `${safe.top * scale}px`,
            right: `${safe.right * scale}px`,
            bottom: `${safe.bottom * scale}px`,
            left: `${safe.left * scale}px`,
            border: '2px dashed #fff',
            boxShadow: '0 0 0 999px rgba(0, 0, 0, 0.28)',
            pointerEvents: 'none',
          }}
        />
      ) : null}
    </div>
  );
}
