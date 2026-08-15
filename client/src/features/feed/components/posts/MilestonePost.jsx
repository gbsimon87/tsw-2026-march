import { Link } from 'react-router-dom';
import {
  ShareCardHeader,
  ShareCardLogoBadge,
  ShareCardMetaStrip,
  ShareCardShell,
  ShareCardSubtitle,
  ShareCardTitle,
} from '../cards/ShareCardPrimitives';
import { buildInitials } from './cardUtils';

const FAMILY_LABELS = {
  career_threshold: 'Career milestone',
  single_game_feat: 'Standout game',
  first: 'First',
};

export function MilestonePost({ post }) {
  const card = post.milestoneCard;
  if (!card) return null;

  const teamColors = card.teamColors || [];
  const playerLine = `${card.playerName || 'Player'}${card.jerseyNumber != null ? ` #${card.jerseyNumber}` : ''}`;

  return (
    <article>
      <ShareCardShell accent="amber" teamColors={teamColors} className="min-h-[19rem]">
        <ShareCardHeader
          kicker={FAMILY_LABELS[card.family] || 'Milestone'}
          badge="Achievement unlocked"
          accentColor={teamColors[1] || teamColors[0] || '#fcd34d'}
        />

        <div className="mt-6 flex flex-1 items-center gap-4">
          <ShareCardLogoBadge
            src={card.teamLogo}
            alt={card.teamName ? `${card.teamName} logo` : ''}
            initials={buildInitials(card.teamName, '★')}
            teamColors={teamColors}
            accent="amber"
            className="h-20 w-20 shrink-0 rounded-full"
          />
          <div className="min-w-0 flex-1">
            <ShareCardTitle>{card.label}</ShareCardTitle>
            <ShareCardSubtitle className="mt-3 font-bold uppercase tracking-[0.14em] text-slate-200">
              {playerLine}
              {card.teamName ? ` · ${card.teamName}` : ''}
            </ShareCardSubtitle>
          </div>
        </div>

        {card.gameTitle ? (
          <ShareCardMetaStrip>
            {card.gameUrl ? (
              <Link
                to={card.gameUrl}
                className="block text-sm font-semibold text-slate-300 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              >
                {card.gameTitle}
              </Link>
            ) : (
              <p className="text-sm font-semibold text-slate-300">{card.gameTitle}</p>
            )}
          </ShareCardMetaStrip>
        ) : null}
      </ShareCardShell>
    </article>
  );
}
