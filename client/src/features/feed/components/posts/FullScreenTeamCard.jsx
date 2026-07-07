import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getTeamCardImage } from '../../cardImage';
import { buildInitials, formatPercentage } from './cardUtils';
import CloudinaryImage from '../../../media/CloudinaryImage';

export function FullScreenTeamCard({ teamCard }) {
  const [imageSrc, setImageSrc] = useState(() => getTeamCardImage(teamCard));

  if (!teamCard) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-900">
        <p className="text-sm text-slate-400">Team info unavailable.</p>
      </div>
    );
  }

  const teamColors = teamCard?.teamColors || [];
  const primary = teamColors[0] || '#334155';
  const secondary = teamColors[1] || '#94a3b8';

  const stats = [
    { label: 'Points', value: teamCard.summary?.points ?? 0 },
    { label: 'FG2%', value: formatPercentage(teamCard.summary?.fg2?.percentage) },
    { label: 'FG3%', value: formatPercentage(teamCard.summary?.fg3?.percentage) },
    { label: 'FT%', value: formatPercentage(teamCard.summary?.ft?.percentage) },
  ];

  const inner = (
    <div
      className="flex h-full flex-col items-center justify-center gap-8 p-8"
      style={{ background: `linear-gradient(160deg, ${primary}cc 0%, #0f172a 100%)` }}
    >
      <p className="text-xs font-bold uppercase tracking-[0.3em]" style={{ color: secondary }}>
        Team Report · {teamCard.summary?.gamesCount ?? 0} Games
      </p>

      {/* Logo */}
      {imageSrc ? (
        <CloudinaryImage
          src={imageSrc}
          alt={`${teamCard.teamName} logo`}
          width={128}
          height={128}
          className="h-32 w-32 rounded-full object-cover shadow-2xl"
          onError={() => setImageSrc(getTeamCardImage({}))}
          loading="lazy"
          srcSetWidths={[128, 256, 384]}
          sizes="128px"
        />
      ) : (
        <div
          className="flex h-32 w-32 items-center justify-center rounded-full text-3xl font-black text-white shadow-2xl"
          style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}
        >
          {buildInitials(teamCard.teamName, 'TM')}
        </div>
      )}

      <h2 className="text-center text-3xl font-black uppercase tracking-tight text-white">
        {teamCard.teamName}
      </h2>

      <div className="grid w-full max-w-sm grid-cols-2 gap-3">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-2xl bg-white/10 px-4 py-5 text-center backdrop-blur-sm"
          >
            <p className="text-3xl font-black text-white">{s.value}</p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
              {s.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <Link to={teamCard.teamUrl} className="block h-full w-full focus:outline-none">
      {inner}
    </Link>
  );
}
