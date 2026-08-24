import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../../components/PageHeader';
import { SportsLoader } from '../../../components/SportsLoader';
import {
  controlClass,
  controlInvalidClass,
  hintClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
  sectionHeadingClass,
} from '../../../components/ui/formStyles';
import { teamsApi } from '../../teams/api/teamsApi';
import { gamesApi } from '../api/gamesApi';
import { GameFormatFields } from '../components/GameFormatFields';
import { DEFAULT_GAME_FORMAT } from '../gameClock';

export function NewGamePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedTeamId = searchParams.get('teamId') || '';

  const [teams, setTeams] = useState([]);
  const [knownOpponents, setKnownOpponents] = useState([]);
  const [teamId, setTeamId] = useState('');
  const [title, setTitle] = useState('');
  const [titleError, setTitleError] = useState('');
  const [opponentMode, setOpponentMode] = useState('new');
  const [selectedOpponent, setSelectedOpponent] = useState('');
  const [newOpponent, setNewOpponent] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [gameFormat, setGameFormat] = useState({ ...DEFAULT_GAME_FORMAT });
  const titleRef = useRef(null);

  useEffect(() => {
    Promise.allSettled([teamsApi.list(), gamesApi.list()])
      .then(([teamsResult, gamesResult]) => {
        if (teamsResult.status === 'fulfilled') {
          const loadedTeams = teamsResult.value.teams || [];
          setTeams(loadedTeams);
          if (loadedTeams.length > 0) {
            // Honour ?teamId= so arriving from a specific team's "Track a game"
            // does not silently switch to the first team in the list.
            const preselected = loadedTeams.some((team) => team.id === requestedTeamId)
              ? requestedTeamId
              : loadedTeams[0].id;
            setTeamId(preselected);
          }
        } else {
          setError(teamsResult.reason?.message || 'Failed to load teams');
        }

        if (gamesResult.status === 'fulfilled') {
          const values = [];
          const seen = new Set();

          for (const game of gamesResult.value.games || []) {
            const opponent = game?.opponent?.trim();
            if (!opponent) {
              continue;
            }
            const key = opponent.toLowerCase();
            if (seen.has(key)) {
              continue;
            }
            seen.add(key);
            values.push(opponent);
          }

          values.sort((a, b) => a.localeCompare(b));
          setKnownOpponents(values);
          setOpponentMode(values.length > 0 ? 'existing' : 'new');
        }
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [requestedTeamId]);

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    setTitleError('');

    // Game Title is the only required field on this form, and it used to be the
    // only one without a marker — so the first submit always failed, through a
    // native browser tooltip.
    if (!title.trim()) {
      setTitleError('Give the game a name so you can find it later.');
      titleRef.current?.focus();
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        gameContext: 'standalone',
        trackingMode: 'one_sided',
        teamId,
        title: title.trim(),
        gameFormat,
      };

      const resolvedOpponent = (
        opponentMode === 'existing' ? selectedOpponent : newOpponent
      )?.trim();

      if (resolvedOpponent) {
        payload.opponent = resolvedOpponent;
      }

      if (scheduledAt) {
        payload.scheduledAt = new Date(scheduledAt).toISOString();
      }

      if (videoUrl.trim()) {
        payload.videoUrl = videoUrl.trim();
      }

      const response = await gamesApi.create(payload);
      navigate(`/games/${response.game.id}/track`);
    } catch (submitError) {
      setError(submitError.message || 'Failed to create game');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return <SportsLoader label="Loading teams" fullPage />;
  }

  if (teams.length === 0) {
    return (
      <main className="mx-auto max-w-3xl space-y-6">
        <PageHeader
          title="Create Game"
          description="Set up game details and start tracking your team performance."
        />

        <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
          <p className="text-base font-semibold text-slate-900">Add a team first</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-600">
            A game is tracked against one of your teams, so there needs to be a team to track.
          </p>
          <Link to="/teams/new" className={`${primaryButtonClass} mt-5`}>
            Create your team
          </Link>
        </section>
      </main>
    );
  }

  const backTo = teamId ? `/admin/teams/${teamId}` : '/admin';

  return (
    <main className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Create Game"
        description="Name the game and start tracking. Everything else can wait."
      />

      <form
        className="space-y-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
        onSubmit={onSubmit}
        noValidate
      >
        <div aria-live="assertive" role="alert">
          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}
        </div>

        <section aria-labelledby="game-details-heading" className="space-y-4">
          <h2 id="game-details-heading" className={sectionHeadingClass}>
            Game details
          </h2>

          <label className="block">
            <span className={labelClass}>Team</span>
            <select
              className={controlClass}
              value={teamId}
              onChange={(event) => setTeamId(event.target.value)}
            >
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>

          <div>
            <label htmlFor="game-title" className={labelClass}>
              Game title
            </label>
            <input
              id="game-title"
              ref={titleRef}
              type="text"
              autoComplete="off"
              aria-invalid={titleError ? 'true' : undefined}
              aria-describedby={titleError ? 'game-title-error' : 'game-title-hint'}
              className={titleError ? controlInvalidClass : controlClass}
              placeholder="vs Wildcats — March 12"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                if (titleError) setTitleError('');
              }}
            />
            {titleError ? (
              <p id="game-title-error" className="mt-1.5 text-xs font-medium text-red-600">
                {titleError}
              </p>
            ) : (
              <p id="game-title-hint" className={hintClass}>
                Required.
              </p>
            )}
          </div>
        </section>

        <section aria-labelledby="opponent-heading" className="space-y-3">
          <div>
            <h2 id="opponent-heading" className={sectionHeadingClass}>
              Opponent
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Optional — their score is tracked either way.
            </p>
          </div>
          {knownOpponents.length > 0 ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-4 text-sm text-slate-700">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="opponentMode"
                    value="existing"
                    className="h-4 w-4"
                    checked={opponentMode === 'existing'}
                    onChange={() => setOpponentMode('existing')}
                  />
                  Choose existing
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="opponentMode"
                    value="new"
                    className="h-4 w-4"
                    checked={opponentMode === 'new'}
                    onChange={() => setOpponentMode('new')}
                  />
                  Add new opponent
                </label>
              </div>

              {opponentMode === 'existing' ? (
                <select
                  aria-label="Previous opponent"
                  className={controlClass}
                  value={selectedOpponent}
                  onChange={(event) => setSelectedOpponent(event.target.value)}
                >
                  <option value="">Select opponent</option>
                  {knownOpponents.map((opponent) => (
                    <option key={opponent} value={opponent}>
                      {opponent}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  autoComplete="off"
                  aria-label="Opponent name"
                  className={controlClass}
                  placeholder="Enter opponent name"
                  value={newOpponent}
                  onChange={(event) => setNewOpponent(event.target.value)}
                />
              )}
            </div>
          ) : (
            <div>
              <input
                type="text"
                autoComplete="off"
                aria-label="Opponent name"
                className={controlClass}
                placeholder="Enter opponent name"
                value={newOpponent}
                onChange={(event) => setNewOpponent(event.target.value)}
              />
              <p className={hintClass}>No previous opponents yet. You can type one.</p>
            </div>
          )}
        </section>

        {/* Schedule, format and video are all optional and all rarely changed at
            tip-off, so they no longer stand between the coach and the button. */}
        <section className="border-t border-slate-100 pt-5">
          <button
            type="button"
            aria-expanded={showMoreOptions}
            aria-controls="game-more-options"
            onClick={() => setShowMoreOptions((previous) => !previous)}
            className="flex w-full items-center justify-between gap-2 rounded-lg px-1 py-1 text-left text-sm font-semibold text-slate-700 transition-colors hover:text-slate-900"
          >
            <span>Schedule, format and video</span>
            <svg
              viewBox="0 0 16 16"
              className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
                showMoreOptions ? 'rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {showMoreOptions ? (
            <div id="game-more-options" className="t-panel mt-5 space-y-6">
              <label className="block">
                <span className={labelClass}>Scheduled at</span>
                <input
                  type="datetime-local"
                  autoComplete="off"
                  className={controlClass}
                  value={scheduledAt}
                  onChange={(event) => setScheduledAt(event.target.value)}
                />
              </label>

              <GameFormatFields value={gameFormat} onChange={setGameFormat} />

              <label className="block">
                <span className={labelClass}>YouTube link</span>
                <input
                  type="url"
                  autoComplete="off"
                  className={controlClass}
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={videoUrl}
                  onChange={(event) => setVideoUrl(event.target.value)}
                />
                <span className={hintClass}>
                  Sync a recording with your tracked events for replay.
                </span>
              </label>
            </div>
          ) : null}
        </section>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center">
          <button type="submit" disabled={isSubmitting} className={primaryButtonClass}>
            {isSubmitting ? 'Creating…' : 'Create and start tracking'}
          </button>
          <Link to={backTo} className={secondaryButtonClass}>
            Cancel
          </Link>
        </div>
      </form>
    </main>
  );
}
