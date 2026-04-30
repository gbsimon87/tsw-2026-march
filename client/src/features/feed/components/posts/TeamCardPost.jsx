import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getTeamCardImage } from '../../cardImage';
import {
  ShareCardHeader,
  ShareCardLogoBadge,
  ShareCardMetaStrip,
  ShareCardShell,
  ShareCardStatPill,
  ShareCardTitle,
} from '../cards/ShareCardPrimitives';
import { buildInitials, formatPercentage } from './cardUtils';

function TeamCardContent({ imageSrc, teamCard }) {
  const teamColors = teamCard?.teamColors || [];

  return (
    <ShareCardShell accent="cyan" teamColors={teamColors}>
      <ShareCardHeader
        kicker="Team Report"
        badge={`${teamCard.summary.gamesCount} Games`}
        accentColor={teamColors[1] || teamColors[0] || '#67e8f9'}
      />

      <div className="mt-5 flex flex-1 items-start gap-4">
        <ShareCardLogoBadge
          src={imageSrc}
          alt={`${teamCard.teamName} card logo`}
          initials={buildInitials(teamCard.teamName, 'TM')}
          teamColors={teamColors}
          accent="cyan"
          className="h-24 w-24"
        />
        <div className="min-w-0 flex-1">
          <ShareCardTitle>{teamCard.teamName}</ShareCardTitle>
          {/* <ShareCardSubtitle className="mt-3">
            {teamCard.summary.gamesCount} completed public games
          </ShareCardSubtitle> */}
          {/* <p
            className="mt-4 text-[11px] font-bold uppercase tracking-[0.24em]"
            style={{ color: teamColors[1] || teamColors[0] || '#a5f3fc' }}
          >
            Public Team Snapshot
          </p> */}
        </div>
      </div>

      <ShareCardMetaStrip>
        <div className="grid grid-cols-2 gap-2">
          <ShareCardStatPill label="Points" value={teamCard.summary.points} emphasis />
          <ShareCardStatPill
            label="FG2%"
            value={formatPercentage(teamCard.summary.fg2.percentage)}
          />
          <ShareCardStatPill
            label="FG3%"
            value={formatPercentage(teamCard.summary.fg3.percentage)}
          />
          <ShareCardStatPill label="FT%" value={formatPercentage(teamCard.summary.ft.percentage)} />
        </div>
      </ShareCardMetaStrip>
    </ShareCardShell>
  );
}

export function TeamCardPost({ teamCard, interactive = true }) {
  const [imageSrc, setImageSrc] = useState(() => getTeamCardImage(teamCard));

  if (!interactive) {
    return (
      <article>
        <TeamCardContent
          imageSrc={imageSrc}
          teamCard={teamCard}
          onImageError={() => setImageSrc(getTeamCardImage({}))}
        />
      </article>
    );
  }

  return (
    <Link
      to={teamCard.teamUrl}
      className="block transition duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
    >
      <TeamCardContent
        imageSrc={imageSrc}
        teamCard={teamCard}
        onImageError={() => setImageSrc(getTeamCardImage({}))}
      />
    </Link>
  );
}
