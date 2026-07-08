import { useEffect, useState } from 'react';
import { feedApi } from '../api/feedApi';

const tabs = [
  { value: 'video', label: '🎥 Video' },
  { value: 'image', label: 'Image' },
  { value: 'game', label: 'Game' },
  { value: 'player', label: 'Player' },
  { value: 'team', label: 'Team' },
];

const VIDEO_MAX_BYTES = 100 * 1024 * 1024;
const VIDEO_MAX_SECONDS = 60;

function mergeInitialGameOption(games, initialGameOption) {
  if (!initialGameOption?.id) {
    return games || [];
  }

  const currentGames = games || [];
  if (currentGames.some((game) => game.id === initialGameOption.id)) {
    return currentGames;
  }

  return [initialGameOption, ...currentGames];
}

function mergeInitialTeamOption(teams, initialTeamOption) {
  if (!initialTeamOption?.id) {
    return teams || [];
  }

  const currentTeams = teams || [];
  if (currentTeams.some((team) => team.id === initialTeamOption.id)) {
    return currentTeams;
  }

  return [initialTeamOption, ...currentTeams];
}

function mergeInitialPlayerOption(players, initialPlayerOption) {
  if (!initialPlayerOption?.id) {
    return players || [];
  }

  const currentPlayers = players || [];
  if (currentPlayers.some((player) => player.id === initialPlayerOption.id)) {
    return currentPlayers;
  }

  return [initialPlayerOption, ...currentPlayers];
}

export function FeedComposer({
  onCreated,
  onCancel,
  initialTab = 'video',
  initialSelectedGameId = '',
  initialGameOption = null,
  initialSelectedTeamId = '',
  initialTeamOption = null,
  initialSelectedPlayer = { teamId: '', playerId: '' },
  initialPlayerOption = null,
}) {
  const isLockedToGame = !!(initialSelectedGameId && initialTab === 'game');
  const [activeTab, setActiveTab] = useState(initialTab);
  const [caption, setCaption] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [videoFile, setVideoFile] = useState(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState({ game: '', player: '', team: '' });
  const [options, setOptions] = useState({
    games: mergeInitialGameOption([], initialGameOption),
    players: mergeInitialPlayerOption([], initialPlayerOption),
    teams: mergeInitialTeamOption([], initialTeamOption),
  });
  const [selectedGameId, setSelectedGameId] = useState(initialSelectedGameId);
  const [selectedPlayer, setSelectedPlayer] = useState(initialSelectedPlayer);
  const [selectedTeamId, setSelectedTeamId] = useState(initialSelectedTeamId);

  useEffect(() => {
    feedApi.listShareableGames(search.game).then((result) =>
      setOptions((current) => ({
        ...current,
        games: mergeInitialGameOption(result.games || [], initialGameOption),
      }))
    );
  }, [search.game, initialGameOption]);

  useEffect(() => {
    feedApi.listShareablePlayers(search.player).then((result) =>
      setOptions((current) => ({
        ...current,
        players: mergeInitialPlayerOption(result.players || [], initialPlayerOption),
      }))
    );
  }, [search.player, initialPlayerOption]);

  useEffect(() => {
    feedApi.listShareableTeams(search.team).then((result) =>
      setOptions((current) => ({
        ...current,
        teams: mergeInitialTeamOption(result.teams || [], initialTeamOption),
      }))
    );
  }, [search.team, initialTeamOption]);

  function handleVideoChange(event) {
    const file = event.target.files?.[0] || null;
    if (!file) return;

    if (file.size > VIDEO_MAX_BYTES) {
      setError('Video must be 100 MB or smaller');
      return;
    }

    if (videoPreviewUrl) {
      URL.revokeObjectURL(videoPreviewUrl);
    }

    setVideoFile(file);
    setVideoPreviewUrl(URL.createObjectURL(file));
    setError('');
  }

  function clearVideo() {
    if (videoPreviewUrl) {
      URL.revokeObjectURL(videoPreviewUrl);
    }
    setVideoFile(null);
    setVideoPreviewUrl(null);
    setUploadProgress(0);
  }

  function reset() {
    setActiveTab(initialTab);
    setCaption('');
    setImageFile(null);
    clearVideo();
    setSelectedGameId(initialSelectedGameId);
    setSelectedPlayer(initialSelectedPlayer);
    setSelectedTeamId(initialSelectedTeamId);
    setError('');
  }

  async function submit(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      let result = null;

      if (activeTab === 'video') {
        if (!videoFile) {
          throw new Error('Please choose a video');
        }
        const formData = new FormData();
        formData.append('file', videoFile);
        if (caption.trim()) {
          formData.append('caption', caption.trim());
        }
        setUploadProgress(0);
        result = await feedApi.createVideoPost(formData, (pct) => setUploadProgress(pct));
      } else if (activeTab === 'image') {
        if (!imageFile) {
          throw new Error('Please choose an image');
        }
        const formData = new FormData();
        formData.append('file', imageFile);
        if (caption.trim()) {
          formData.append('caption', caption.trim());
        }
        result = await feedApi.createImagePost(formData);
      } else if (activeTab === 'game') {
        if (!selectedGameId) {
          throw new Error('Select a game');
        }
        result = await feedApi.createGameCardPost({
          gameId: selectedGameId,
          caption: caption.trim() || undefined,
        });
      } else if (activeTab === 'player') {
        if (selectedPlayer.source === 'league') {
          if (!selectedPlayer.leagueTeamId || !selectedPlayer.leaguePlayerId) {
            throw new Error('Select a player');
          }
          result = await feedApi.createPlayerCardPost({
            leagueTeamId: selectedPlayer.leagueTeamId,
            leaguePlayerId: selectedPlayer.leaguePlayerId,
            caption: caption.trim() || undefined,
          });
        } else {
          if (!selectedPlayer.teamId || !selectedPlayer.playerId) {
            throw new Error('Select a player');
          }
          result = await feedApi.createPlayerCardPost({
            teamId: selectedPlayer.teamId,
            playerId: selectedPlayer.playerId,
            caption: caption.trim() || undefined,
          });
        }
      } else if (activeTab === 'team') {
        if (!selectedTeamId) {
          throw new Error('Select a team');
        }
        const selectedTeamOption = options.teams.find((team) => team.id === selectedTeamId);
        if (selectedTeamOption?.source === 'league') {
          result = await feedApi.createTeamCardPost({
            leagueTeamId: selectedTeamOption.leagueTeamId,
            caption: caption.trim() || undefined,
          });
        } else {
          result = await feedApi.createTeamCardPost({
            teamId: selectedTeamId,
            caption: caption.trim() || undefined,
          });
        }
      }

      onCreated(result.post);
      reset();
    } catch (submitError) {
      setError(submitError.message || 'Failed to create post');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLockedToGame) {
    const gameTitle = initialGameOption?.title || initialGameOption?.team?.name || 'Game';
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Sharing game recap
          </p>
          <p className="mt-0.5 text-sm font-semibold text-slate-900">{gameTitle}</p>
          {initialGameOption?.score ? (
            <p className="mt-1 text-xl font-bold tabular-nums text-slate-700">
              {initialGameOption.score}
            </p>
          ) : null}
        </div>
        <form onSubmit={submit} className="space-y-4">
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Caption <span className="font-normal text-slate-400">(optional)</span>
            </span>
            <textarea
              className="w-full rounded border px-3 py-2 text-sm"
              rows={3}
              maxLength={280}
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              placeholder="Add a caption..."
            />
          </label>
          <div className="flex items-center gap-3">
            <button
              aria-label="submit"
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Posting...' : 'Post to The Pulse'}
            </button>
            {onCancel ? (
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                onClick={onCancel}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            aria-label={tab.value.charAt(0).toUpperCase() + tab.value.slice(1)}
            aria-pressed={activeTab === tab.value}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              activeTab === tab.value
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
            onClick={() => setActiveTab(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-4">
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {activeTab === 'video' ? (
          <div className="space-y-3">
            {videoPreviewUrl ? (
              <div className="relative overflow-hidden rounded-xl bg-black">
                <video
                  src={videoPreviewUrl}
                  controls
                  playsInline
                  muted
                  className="max-h-64 w-full object-contain"
                />
                <button
                  type="button"
                  aria-label="Remove video"
                  onClick={clearVideo}
                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white"
                >
                  ✕
                </button>
              </div>
            ) : (
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center hover:border-slate-400">
                <span className="text-3xl">🎥</span>
                <span className="text-sm font-medium text-slate-700">
                  Tap to record or choose a video
                </span>
                <span className="text-xs text-slate-400">
                  MP4, MOV or WebM · max 100 MB · max {VIDEO_MAX_SECONDS}s
                </span>
                <input
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm"
                  capture="environment"
                  className="sr-only"
                  onChange={handleVideoChange}
                />
              </label>
            )}

            {isSubmitting && uploadProgress > 0 ? (
              <div>
                <div className="mb-1 flex justify-between text-xs text-slate-500">
                  <span>Uploading…</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-slate-900 transition-all duration-200"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {activeTab === 'image' ? (
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Image</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => setImageFile(event.target.files?.[0] || null)}
            />
          </label>
        ) : null}

        {activeTab === 'game' ? (
          <div className="space-y-2">
            <input
              className="w-full rounded border px-3 py-2 text-sm"
              placeholder="Search games"
              value={search.game}
              onChange={(event) =>
                setSearch((current) => ({ ...current, game: event.target.value }))
              }
            />
            <select
              aria-label="game-select"
              label="game-select"
              className="w-full rounded border px-3 py-2 text-sm"
              value={selectedGameId}
              onChange={(event) => setSelectedGameId(event.target.value)}
            >
              <option value="">Select game</option>
              {options.games.map((game) => (
                <option key={game.id} value={game.id}>
                  {game.title || `${game.team?.name || 'Game'} - ${game.opponent || ''}`}
                  {game.source === 'league' ? ' (League)' : ''}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {activeTab === 'player' ? (
          <div className="space-y-2">
            <input
              className="w-full rounded border px-3 py-2 text-sm"
              placeholder="Search players"
              value={search.player}
              onChange={(event) =>
                setSearch((current) => ({ ...current, player: event.target.value }))
              }
            />
            <select
              aria-label="player-name"
              label="player-name"
              className="w-full rounded border px-3 py-2 text-sm"
              value={selectedPlayer.playerId}
              onChange={(event) => {
                const nextPlayer = options.players.find(
                  (player) => player.id === event.target.value
                );
                if (nextPlayer?.source === 'league') {
                  setSelectedPlayer({
                    playerId: '',
                    teamId: '',
                    leaguePlayerId: nextPlayer?.leaguePlayerId || nextPlayer?.id || '',
                    leagueTeamId: nextPlayer?.team?.leagueTeamId || '',
                    source: 'league',
                  });
                } else {
                  setSelectedPlayer({
                    playerId: nextPlayer?.id || '',
                    teamId: nextPlayer?.team?.id || '',
                    leaguePlayerId: '',
                    leagueTeamId: '',
                    source: 'standalone',
                  });
                }
              }}
            >
              <option value="">Select player</option>
              {options.players.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.displayName} - {player.team.name}
                  {player.source === 'league' ? ' (League)' : ''}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {activeTab === 'team' ? (
          <div className="space-y-2">
            <input
              className="w-full rounded border px-3 py-2 text-sm"
              placeholder="Search teams"
              value={search.team}
              onChange={(event) =>
                setSearch((current) => ({ ...current, team: event.target.value }))
              }
            />
            <select
              aria-label="team-name"
              label="team-name"
              className="w-full rounded border px-3 py-2 text-sm"
              value={selectedTeamId}
              onChange={(event) => setSelectedTeamId(event.target.value)}
            >
              <option value="">Select team</option>
              {options.teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                  {team.source === 'league' ? ' (League)' : ''}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Caption</span>
          <textarea
            className="w-full rounded border px-3 py-2 text-sm"
            rows={3}
            maxLength={280}
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            placeholder="Write a caption (optional)"
          />
        </label>

        <div className="flex items-center gap-3">
          <button
            aria-label="post-submit"
            label="post-submit"
            type="submit"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
          >
            {isSubmitting && activeTab === 'video' && uploadProgress > 0
              ? `Uploading ${uploadProgress}%`
              : isSubmitting
                ? 'Posting...'
                : 'Post'}
          </button>
          {onCancel ? (
            <button
              type="button"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              onClick={onCancel}
            >
              Cancel
            </button>
          ) : null}
          <button type="button" className="text-sm text-slate-600 hover:underline" onClick={reset}>
            Reset
          </button>
        </div>
      </form>
    </div>
  );
}
