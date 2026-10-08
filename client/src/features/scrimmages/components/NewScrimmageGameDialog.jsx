import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Modal } from '../../../components/ui/Modal';
import { formatVideoTime, parseVideoTime } from '../videoTime';
import { scrimmagesApi } from '../api/scrimmagesApi';

export function NewScrimmageGameDialog({
  scrimmageId,
  sessionId,
  previousGameId,
  initialTimestamp = 0,
  getCurrentVideoTime,
  onClose,
  onCreated,
}) {
  const requestId = useRef(crypto.randomUUID());
  const [colors, setColors] = useState({ home: '', away: '' });
  const [rosters, setRosters] = useState({ home: {}, away: {} });
  const [timestamp, setTimestamp] = useState(formatVideoTime(initialTimestamp || 0));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const {
    data,
    isLoading,
    error: loadError,
  } = useQuery({
    queryKey: ['scrimmageSession', scrimmageId, sessionId],
    queryFn: () => scrimmagesApi.session(scrimmageId, sessionId),
  });
  const assignments = data?.session?.assignments || [];
  const choices = [...new Set(assignments.map((p) => p.color))];
  const ready =
    ['home', 'away'].every((side) => colors[side] && Object.keys(rosters[side]).length > 0) &&
    colors.home !== colors.away;
  async function create(event) {
    event.preventDefault();
    const seconds = parseVideoTime(timestamp);
    if (seconds === null) {
      setError('Enter a video position such as 1:12:35, 12:35 or seconds (up to 24 hours).');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const result = await scrimmagesApi.newGame(scrimmageId, sessionId, {
        requestId: requestId.current,
        homeColor: colors.home,
        awayColor: colors.away,
        homePlayers: Object.entries(rosters.home).map(([playerId, number]) => ({
          playerId,
          jerseyNumber: number === '' ? null : Number(number),
        })),
        awayPlayers: Object.entries(rosters.away).map(([playerId, number]) => ({
          playerId,
          jerseyNumber: number === '' ? null : Number(number),
        })),
        videoStartTimestamp: seconds,
        ...(previousGameId ? { previousGameId } : {}),
      });
      onCreated(result.game.id);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      open
      title="New scrimmage game"
      onClose={saving ? () => {} : onClose}
      panelClassName="max-w-3xl"
    >
      <form onSubmit={create} className="space-y-4 text-slate-900">
        <p className="text-sm text-slate-600">
          {previousGameId ? 'Creating the next game finishes the current game. ' : ''}Select two
          colors and one to five players per side. Jerseys can change between games; colors stay
          fixed for the week.
        </p>
        {isLoading && <p>Loading weekly players…</p>}
        {(error || loadError) && (
          <p role="alert" className="text-red-700">
            {error || loadError.message}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {['home', 'away'].map((side) => (
            <fieldset key={side} className="space-y-2 rounded-xl border p-3">
              <legend className="font-semibold">
                {side === 'home' ? 'First side' : 'Second side'}
              </legend>
              <label className="block text-sm">
                Color
                <select
                  aria-label={`${side} color`}
                  value={colors[side]}
                  onChange={(e) => {
                    setColors({ ...colors, [side]: e.target.value });
                    setRosters({ ...rosters, [side]: {} });
                  }}
                  className="mt-1 w-full rounded-lg border p-2"
                >
                  <option value="">Choose a color</option>
                  {choices.map((color) => (
                    <option
                      key={color}
                      value={color}
                      disabled={color === colors[side === 'home' ? 'away' : 'home']}
                    >
                      {color}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-xs text-slate-500">
                {Object.keys(rosters[side]).length} selected (up to 5)
              </p>
              {assignments
                .filter((p) => p.color === colors[side])
                .map((player) => (
                  <div key={player.playerId} className="flex items-center gap-2">
                    <label className="flex flex-1 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={player.playerId in rosters[side]}
                        disabled={
                          !(player.playerId in rosters[side]) &&
                          Object.keys(rosters[side]).length === 5
                        }
                        onChange={(e) => {
                          const next = { ...rosters[side] };
                          if (e.target.checked) next[player.playerId] = '';
                          else delete next[player.playerId];
                          setRosters({ ...rosters, [side]: next });
                        }}
                      />
                      {player.displayName}
                    </label>
                    {player.playerId in rosters[side] && (
                      <input
                        aria-label={`${player.displayName} jersey number`}
                        type="number"
                        min="0"
                        max="999"
                        value={rosters[side][player.playerId]}
                        onChange={(e) =>
                          setRosters({
                            ...rosters,
                            [side]: { ...rosters[side], [player.playerId]: e.target.value },
                          })
                        }
                        placeholder="#"
                        className="w-20 rounded border p-2"
                      />
                    )}
                  </div>
                ))}
            </fieldset>
          ))}
        </div>
        <label className="block text-sm">
          Game starts at video position
          <input
            required
            type="text"
            placeholder="1:12:35"
            value={timestamp}
            onChange={(e) => setTimestamp(e.target.value)}
            className="ml-2 w-28 rounded border p-2"
          />
        </label>
        {getCurrentVideoTime && (
          <button
            type="button"
            className="text-sm underline"
            onClick={() => {
              const current = getCurrentVideoTime();
              if (!Number.isFinite(current) || current < 0) {
                setError('Wait for the video to load its current position.');
                return;
              }
              setTimestamp(formatVideoTime(current));
              setError('');
            }}
          >
            Use current video position
          </button>
        )}
        <p className="text-xs text-slate-500">
          Enter hours:minutes:seconds, minutes:seconds or seconds. The video opens at this position.
          Seek to the exact start before pressing Start game; each event records its position in the
          full weekly video.
        </p>
        <button
          disabled={!ready || saving}
          className="rounded-lg bg-[#1B4332] px-4 py-2 font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Creating…' : 'Create game'}
        </button>
      </form>
    </Modal>
  );
}
