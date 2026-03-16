import { useEffect, useState } from 'react';
import { feedApi } from '../api/feedApi';

const tabs = [
  { value: 'image', label: 'Image' },
  { value: 'game', label: 'Game' },
  { value: 'player', label: 'Player' },
  { value: 'team', label: 'Team' },
];

export function FeedComposer({ onCreated, onCancel }) {
  const [activeTab, setActiveTab] = useState('image');
  const [caption, setCaption] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState({ game: '', player: '', team: '' });
  const [options, setOptions] = useState({ games: [], players: [], teams: [] });
  const [selectedGameId, setSelectedGameId] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState({ teamId: '', playerId: '' });
  const [selectedTeamId, setSelectedTeamId] = useState('');

  useEffect(() => {
    feedApi
      .listShareableGames(search.game)
      .then((result) => setOptions((current) => ({ ...current, games: result.games || [] })));
  }, [search.game]);

  useEffect(() => {
    feedApi
      .listShareablePlayers(search.player)
      .then((result) => setOptions((current) => ({ ...current, players: result.players || [] })));
  }, [search.player]);

  useEffect(() => {
    feedApi
      .listShareableTeams(search.team)
      .then((result) => setOptions((current) => ({ ...current, teams: result.teams || [] })));
  }, [search.team]);

  function reset() {
    setCaption('');
    setImageFile(null);
    setSelectedGameId('');
    setSelectedPlayer({ teamId: '', playerId: '' });
    setSelectedTeamId('');
    setError('');
  }

  async function submit(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      let result = null;

      if (activeTab === 'image') {
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
        if (!selectedPlayer.teamId || !selectedPlayer.playerId) {
          throw new Error('Select a player');
        }
        result = await feedApi.createPlayerCardPost({
          teamId: selectedPlayer.teamId,
          playerId: selectedPlayer.playerId,
          caption: caption.trim() || undefined,
        });
      } else if (activeTab === 'team') {
        if (!selectedTeamId) {
          throw new Error('Select a team');
        }
        result = await feedApi.createTeamCardPost({
          teamId: selectedTeamId,
          caption: caption.trim() || undefined,
        });
      }

      onCreated(result.post);
      reset();
    } catch (submitError) {
      setError(submitError.message || 'Failed to create post');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
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
              className="w-full rounded border px-3 py-2 text-sm"
              value={selectedGameId}
              onChange={(event) => setSelectedGameId(event.target.value)}
            >
              <option value="">Select game</option>
              {options.games.map((game) => (
                <option key={game.id} value={game.id}>
                  {game.team?.name} - {game.opponent || game.title}
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
              className="w-full rounded border px-3 py-2 text-sm"
              value={selectedPlayer.playerId}
              onChange={(event) => {
                const nextPlayer = options.players.find(
                  (player) => player.id === event.target.value
                );
                setSelectedPlayer({
                  playerId: nextPlayer?.id || '',
                  teamId: nextPlayer?.team?.id || '',
                });
              }}
            >
              <option value="">Select player</option>
              {options.players.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.displayName} - {player.team.name}
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
              className="w-full rounded border px-3 py-2 text-sm"
              value={selectedTeamId}
              onChange={(event) => setSelectedTeamId(event.target.value)}
            >
              <option value="">Select team</option>
              {options.teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
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
            type="submit"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Posting...' : 'Post'}
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
