import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../../app/store/AuthContext';
import { LeagueGameCard } from '../../../components/ui/LeagueGameCard';
import { leaguesApi } from '../api/leaguesApi';
import { getLeagueHeaderImage } from '../../feed/cardImage';
import playerPlaceholder from '../../../assets/placeholders/player-placeholder.svg';
import teamPlaceholder from '../../../assets/placeholders/team-logo-placeholder.svg';
import { Breadcrumbs } from '../../../components/Breadcrumbs';
import { SportsLoader } from '../../../components/SportsLoader';
import { StatsTable } from '../../teams/components/StatsTable';
import { useDocumentMeta } from '../../../hooks/useDocumentMeta';
import { resolveShareImage } from '../../../hooks/resolveShareImage';
import { CloudinaryImage } from '../../media/CloudinaryImage';
import { FollowButton } from '../../follows/components/FollowButton';
import { LeagueFormBadges } from '../components/LeagueFormBadges';
import { buildSeasonFormByTeam } from '../seasonTrends';

const TABS = [
  {
    id: 'stats',
    label: 'Stats',
    icon: (
      <svg
        viewBox="0 0 16 16"
        className="h-4 w-4 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M2 12h12M5 12V6M8 12V3M11 12V8" />
      </svg>
    ),
  },
  {
    id: 'games',
    label: 'Games',
    icon: (
      <svg
        viewBox="0 0 16 16"
        className="h-4 w-4 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <rect x="1" y="3" width="14" height="10" rx="1.5" />
        <path d="M5 8h2M6 7v2M10 8h.01M12 8h.01" />
      </svg>
    ),
  },
  {
    id: 'join',
    label: 'Join',
    icon: (
      <svg
        viewBox="0 0 16 16"
        className="h-4 w-4 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <circle cx="7" cy="5" r="2.5" />
        <path d="M2 13c0-2.2 2.2-4 5-4" />
        <path d="M12 9v4M10 11h4" />
      </svg>
    ),
  },
];

const PLAYER_STATS_COLUMNS = [
  {
    id: 'player',
    label: 'Player',
    align: 'left',
    sortable: false,
    render: (row) => (
      <span className="flex items-center gap-1.5">
        <CloudinaryImage
          src={row.avatarUrl || playerPlaceholder}
          alt=""
          width={20}
          height={20}
          loading="lazy"
          decoding="async"
          srcSetWidths={[20, 40, 60]}
          sizes="20px"
          className="h-5 w-5 shrink-0 rounded-full border border-slate-200 bg-white object-cover"
        />
        <Link
          to={row.playerHref}
          className="truncate font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 transition hover:text-[#1B4332] hover:decoration-[#F4A300]"
        >
          {row.displayName}
        </Link>
        {row.isClaimed ? (
          <svg
            viewBox="0 0 12 12"
            className="h-3 w-3 shrink-0 text-emerald-600"
            fill="currentColor"
            aria-label="Profile claimed"
          >
            <path d="M6 1a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Zm0 6c2.76 0 5 1.12 5 2.5V10H1v-.5C1 8.12 3.24 7 6 7Z" />
          </svg>
        ) : null}
      </span>
    ),
  },
  {
    id: 'points',
    label: 'PTS',
    align: 'right',
    render: (row) => row.points,
  },
  {
    id: 'reb',
    label: 'REB',
    align: 'right',
    render: (row) => row.reb,
  },
  {
    id: 'ast',
    label: 'AST',
    align: 'right',
    render: (row) => row.ast,
  },
  {
    id: 'stl',
    label: 'STL',
    align: 'right',
    render: (row) => row.stl,
  },
  {
    id: 'tov',
    label: 'TOV',
    align: 'right',
    render: (row) => row.tov,
  },
];

export function PublicLeagueTeamPage() {
  const { leagueSlug, teamSlug } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [rolePlayer, setRolePlayer] = useState(false);
  const [roleTeamManager, setRoleTeamManager] = useState(false);
  const [requestedLeaguePlayerId, setRequestedLeaguePlayerId] = useState('');
  const [ownershipConfirmed, setOwnershipConfirmed] = useState(false);
  const [requestStatus, setRequestStatus] = useState('');
  const [requestStatusTone, setRequestStatusTone] = useState('success');
  const [activeTab, setActiveTab] = useState('stats');
  const pendingKey = `join_pending_${leagueSlug}_${teamSlug}`;
  const recentForm = useMemo(() => {
    const team = data?.team;
    if (!team) return [];
    return buildSeasonFormByTeam(team.games || []).get(String(team.id)) || [];
  }, [data?.team]);

  useEffect(() => {
    leaguesApi
      .getPublicTeam(leagueSlug, teamSlug)
      .then(setData)
      .catch((loadError) => setError(loadError.message || 'Failed to load team'))
      .finally(() => setIsLoading(false));
  }, [leagueSlug, teamSlug]);

  useDocumentMeta({
    title: data?.team ? `${data.team.name} — ${data.league?.name || 'League'}` : undefined,
    description: data?.team
      ? `${data.team.name} of ${data.league?.name || 'the league'}. Rank: ${data.team.standingsPosition || 'N/A'}.`
      : undefined,
    image: data?.team ? resolveShareImage(data.team.logo?.url) : undefined,
    url: data?.team
      ? `${window.location.origin}/league/${leagueSlug}/teams/${teamSlug}`
      : undefined,
  });

  // An anonymous visitor who fills in the Join form is sent to /login with the
  // selection stashed under pendingKey; restore it once they come back signed
  // in, otherwise that write is dead and the key leaks. The ownership
  // confirmation is deliberately NOT restored — re-ticking it keeps claiming a
  // profile an explicit act taken while authenticated.
  useEffect(() => {
    if (!user || !data?.team) return;
    const raw = sessionStorage.getItem(pendingKey);
    if (!raw) return;
    sessionStorage.removeItem(pendingKey);
    try {
      const pending = JSON.parse(raw);
      setRolePlayer(Boolean(pending?.rolePlayer));
      setRoleTeamManager(Boolean(pending?.roleTeamManager));
      setRequestedLeaguePlayerId(
        typeof pending?.requestedLeaguePlayerId === 'string' ? pending.requestedLeaguePlayerId : ''
      );
      setOwnershipConfirmed(false);
      setActiveTab('join');
    } catch {
      // A corrupt payload is not worth surfacing; the form just stays empty.
    }
  }, [user, data?.team, pendingKey]);

  if (isLoading) {
    return <SportsLoader label="Loading league team" fullPage />;
  }

  if (!data?.team) {
    return <p className="text-sm text-red-600">{error || 'League team not found'}</p>;
  }

  const { league, team } = data;
  const joinablePlayers = (team.roster || []).filter(
    (player) => !player.isClaimed && player.isActive
  );
  const rosterById = new Map((team.roster || []).map((p) => [String(p.id), p]));
  const playerStatsRows = (team.stats || []).map((row) => {
    const rosterPlayer = rosterById.get(String(row.playerId));
    return {
      ...row,
      id: row.playerId,
      playerHref: `/league/${league.slug}/teams/${team.slug}/players/${row.playerId}`,
      isClaimed: rosterPlayer?.isClaimed ?? false,
    };
  });

  async function submitRoles(lg, tm, rp, rtm, rpid) {
    setError('');
    setRequestStatus('');
    setRequestStatusTone('success');

    const roles = [...(rp ? ['player'] : []), ...(rtm ? ['team_manager'] : [])];
    const results = [];
    for (const role of roles) {
      try {
        await leaguesApi.createJoinRequest(lg.id, tm.id, {
          requestedRole: role,
          ...(role === 'player' ? { requestedLeaguePlayerId: rpid } : {}),
        });
        results.push({ role, ok: true });
      } catch (submitError) {
        results.push({ role, ok: false, message: submitError.message || 'Failed to submit' });
      }
    }

    const allOk = results.every((r) => r.ok);
    const anyPending = results.some((r) =>
      /pending join request already exists/i.test(r.message || '')
    );
    const anyOk = results.some((r) => r.ok);

    if (allOk) {
      setRequestStatus("Join request submitted. Please wait for the team manager's approval.");
      setRequestStatusTone('success');
    } else if (anyPending && !anyOk) {
      setRequestStatus('You already have a pending request for the selected role(s).');
      setRequestStatusTone('warning');
    } else if (anyOk) {
      setRequestStatus('Some requests were submitted; others may already be pending.');
      setRequestStatusTone('warning');
    } else {
      setError(results.map((r) => r.message).join(' '));
    }
  }

  async function submitJoinRequest(event) {
    event.preventDefault();

    if (!rolePlayer && !roleTeamManager) {
      setError('Select at least one role.');
      return;
    }

    if (rolePlayer && (!requestedLeaguePlayerId || !ownershipConfirmed)) {
      setError('Select your roster profile and confirm that it belongs to you.');
      return;
    }

    if (!user) {
      sessionStorage.setItem(
        pendingKey,
        JSON.stringify({ rolePlayer, roleTeamManager, requestedLeaguePlayerId })
      );
      navigate(`/login?redirectTo=${encodeURIComponent(window.location.pathname)}`);
      return;
    }

    await submitRoles(league, team, rolePlayer, roleTeamManager, requestedLeaguePlayerId);
  }

  const breadcrumbs = [
    { label: 'Discover', href: '/home' },
    { label: league.name, href: `/league/${league.slug}` },
    { label: team.name },
  ];

  const visibleTabs = TABS;

  return (
    <main className="space-y-6 bg-[#F7F5F0] -m-4 p-4 md:-m-6 md:p-6">
      <Breadcrumbs crumbs={breadcrumbs} />

      {/* Team card header */}
      <section
        aria-label={team.name}
        className="relative overflow-hidden rounded-2xl bg-[#141414] p-5 md:p-8"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg, #fff 0, #fff 1px, transparent 1px, transparent 64px)',
          }}
        />
        <div className="relative flex items-center gap-4">
          <CloudinaryImage
            src={team.logo?.url || teamPlaceholder}
            alt={`${team.name} logo`}
            width={64}
            height={64}
            loading="eager"
            decoding="async"
            srcSetWidths={[64, 128, 192]}
            sizes="64px"
            className="h-16 w-16 shrink-0 rounded-full border-2 border-white/10 bg-white object-cover"
          />
          <div className="min-w-0 flex-1">
            <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#F4A300]">
              <CloudinaryImage
                src={getLeagueHeaderImage(league)}
                alt={`${league.name} logo`}
                width={16}
                height={16}
                loading="eager"
                decoding="async"
                srcSetWidths={[16, 32]}
                sizes="16px"
                className="h-4 w-4 shrink-0 rounded-full border border-white/10 bg-white object-cover"
              />
              {league.name}
            </span>
            <h1
              className="mt-2 truncate text-2xl text-white md:text-3xl"
              style={{ fontFamily: "'Archivo Black', sans-serif" }}
            >
              {team.name}
            </h1>
            <p className="mt-1 text-sm text-white/60">
              Rank:{' '}
              <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                {team.standingsPosition || 'N/A'}
              </span>
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50">
                Form
              </span>
              <LeagueFormBadges form={recentForm} />
            </div>
          </div>
          {/* Follow is a public-surface-only feature (decision D8/DL7): only
              offer it when the parent league is public, even though a private
              league's team page is reachable here for its own members. */}
          {league.isPublic ? (
            <div className="relative shrink-0 self-start">
              <FollowButton targetType="leagueTeam" targetId={team.id} variant="onDark" />
            </div>
          ) : null}
        </div>
      </section>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div
          className="grid border-b border-slate-200"
          style={{ gridTemplateColumns: `repeat(${visibleTabs.length}, minmax(0, 1fr))` }}
        >
          {visibleTabs.map((tab, index) => (
            <button
              key={tab.id}
              type="button"
              aria-label={tab.label}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center gap-1 py-3 text-xs font-semibold transition ${
                index < visibleTabs.length - 1 ? 'border-r border-slate-200' : ''
              } ${
                activeTab === tab.id
                  ? 'bg-[#141414] text-white'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {activeTab === 'stats' ? (
            <div>
              <h2
                className="text-lg text-slate-900"
                style={{ fontFamily: "'Archivo Black', sans-serif" }}
              >
                Player Stats
              </h2>
              {playerStatsRows.length === 0 ? (
                <p className="mt-4 text-sm text-slate-600">No player stats yet.</p>
              ) : (
                <>
                  <div className="mt-4 overflow-x-auto">
                    <StatsTable
                      columns={PLAYER_STATS_COLUMNS}
                      rows={playerStatsRows}
                      tableClassName="w-full text-sm"
                    />
                  </div>
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
                    <svg
                      viewBox="0 0 12 12"
                      className="h-3 w-3 shrink-0 text-emerald-600"
                      fill="currentColor"
                    >
                      <path d="M6 1a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Zm0 6c2.76 0 5 1.12 5 2.5V10H1v-.5C1 8.12 3.24 7 6 7Z" />
                    </svg>
                    Profile claimed — this player has linked their account.
                  </p>
                </>
              )}
            </div>
          ) : null}

          {activeTab === 'games' ? (
            <div>
              <h2
                className="text-lg text-slate-900"
                style={{ fontFamily: "'Archivo Black', sans-serif" }}
              >
                League Games
              </h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {(team.games || []).length === 0 ? (
                  <p className="text-sm text-slate-600">No league games yet.</p>
                ) : (
                  (team.games || []).map((game) => <LeagueGameCard key={game.id} game={game} />)
                )}
              </div>
            </div>
          ) : null}

          {activeTab === 'join' ? (
            <div>
              <div className="overflow-hidden rounded-2xl bg-[#1B4332] p-5 text-white">
                <div className="flex items-center gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#F4A300] text-[#141414]">
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="h-6 w-6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="9" cy="7" r="3" />
                      <path d="M3 19c0-4 2.7-7 6-7s6 3 6 7M18 8v6M15 11h6" strokeLinecap="round" />
                    </svg>
                  </span>
                  <div>
                    <h2 className="text-xl" style={{ fontFamily: "'Archivo Black', sans-serif" }}>
                      Are you on this team?
                    </h2>
                    <p className="mt-1 text-sm text-white/75">
                      Choose the role that matches how you participate with this team.
                    </p>
                  </div>
                </div>
              </div>
              <form onSubmit={submitJoinRequest} className="mt-5 space-y-4">
                <fieldset className="space-y-2">
                  <legend className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#141414] text-xs text-white">
                      1
                    </span>
                    Choose your role
                  </legend>
                  <label
                    className={`flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 transition ${
                      joinablePlayers.length === 0
                        ? 'cursor-not-allowed opacity-60'
                        : 'cursor-pointer hover:border-[#F4A300]/60 hover:bg-white'
                    }`}
                  >
                    <input
                      type="checkbox"
                      aria-label="Player — claim my profile"
                      disabled={joinablePlayers.length === 0}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-[#141414] disabled:cursor-not-allowed"
                      checked={rolePlayer}
                      onChange={(e) => {
                        setRolePlayer(e.target.checked);
                        if (!e.target.checked) {
                          setRequestedLeaguePlayerId('');
                          setOwnershipConfirmed(false);
                        }
                      }}
                    />
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        Player — claim my profile
                      </p>
                      <p className="text-xs text-slate-500">
                        {joinablePlayers.length === 0
                          ? 'No unclaimed player profiles are currently available'
                          : 'Link your account to a roster slot and start building your My Sporty profile'}
                      </p>
                    </div>
                  </label>
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 transition hover:border-[#F4A300]/60 hover:bg-white">
                    <input
                      type="checkbox"
                      aria-label="Team Manager"
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-[#141414]"
                      checked={roleTeamManager}
                      onChange={(e) => setRoleTeamManager(e.target.checked)}
                    />
                    <div>
                      <p className="text-sm font-medium text-slate-900">Team Manager</p>
                      <p className="text-xs text-slate-500">
                        Help manage this team&apos;s roster and games
                      </p>
                    </div>
                  </label>
                </fieldset>
                {rolePlayer ? (
                  <div className="space-y-4 rounded-xl border border-slate-200 p-4">
                    <label className="block">
                      <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#141414] text-xs text-white">
                          2
                        </span>
                        Select your roster profile
                      </span>
                      <select
                        required
                        className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#F4A300]/30"
                        value={requestedLeaguePlayerId}
                        onChange={(event) => {
                          setRequestedLeaguePlayerId(event.target.value);
                          setOwnershipConfirmed(false);
                        }}
                      >
                        <option value="">Select your name</option>
                        {joinablePlayers.map((player) => (
                          <option key={player.id} value={player.id}>
                            {player.displayName}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                      <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-200 text-xs">
                          3
                        </span>
                        Confirm this profile is yours
                      </p>
                      <p className="mt-2 text-xs leading-5 text-amber-800">
                        Team managers review every request. Requesting someone else’s profile may
                        result in rejection or removal of the link.
                      </p>
                      <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-amber-950">
                        <input
                          type="checkbox"
                          required
                          aria-label="I confirm this is my player profile"
                          checked={ownershipConfirmed}
                          onChange={(event) => setOwnershipConfirmed(event.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded border-amber-400 accent-[#141414]"
                        />
                        <span>I confirm that the selected player profile belongs to me.</span>
                      </label>
                    </div>
                  </div>
                ) : null}
                {error ? <p className="text-sm text-red-600">{error}</p> : null}
                {requestStatus ? (
                  <p
                    className={`text-sm ${requestStatusTone === 'warning' ? 'text-amber-700' : 'text-emerald-700'}`}
                  >
                    {requestStatus}
                  </p>
                ) : null}
                <button
                  type="submit"
                  disabled={
                    (!rolePlayer && !roleTeamManager) ||
                    (rolePlayer && (!requestedLeaguePlayerId || !ownershipConfirmed))
                  }
                  className="rounded-xl bg-[#141414] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1B4332] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Submit Request
                </button>
              </form>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
