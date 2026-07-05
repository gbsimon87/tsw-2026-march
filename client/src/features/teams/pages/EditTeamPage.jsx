import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../../components/PageHeader';
import placeholderLogo from '../../../assets/placeholders/team-logo-placeholder.svg';
import { CloudinaryImage } from '../../media/CloudinaryImage';
import { teamsApi } from '../api/teamsApi';

const POSITION_OPTIONS = ['', 'PG', 'SG', 'SF', 'PF', 'C'];
const EMPTY_COLOR = '#000000';

function formatUpdatedAt(value) {
  if (!value) {
    return 'Unavailable';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Unavailable';
  }

  return parsed.toLocaleDateString();
}

function normalizeJerseyNumber(value) {
  if (value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function emptyVenue() {
  return {
    arenaName: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    postalCode: '',
    country: '',
  };
}

function hydrateVenue(homeVenue) {
  return {
    arenaName: homeVenue?.arenaName || '',
    addressLine1: homeVenue?.addressLine1 || '',
    addressLine2: homeVenue?.addressLine2 || '',
    city: homeVenue?.city || '',
    state: homeVenue?.state || '',
    postalCode: homeVenue?.postalCode || '',
    country: homeVenue?.country || '',
  };
}

function normalizeVenue(homeVenue) {
  const normalized = Object.fromEntries(
    Object.entries(homeVenue).map(([key, value]) => [key, value.trim()])
  );

  return Object.values(normalized).some(Boolean) ? normalized : undefined;
}

function hydratePlayers(players) {
  return (players || [])
    .filter((player) => player.isActive)
    .map((player) => ({
      ...player,
      jerseyNumber: player.jerseyNumber ?? '',
      position: player.position ?? '',
    }));
}

export function EditTeamPage() {
  const navigate = useNavigate();
  const { teamId } = useParams();
  const [team, setTeam] = useState(null);
  const [teamName, setTeamName] = useState('');
  const [players, setPlayers] = useState([]);
  const [colors, setColors] = useState(['', '', '']);
  const [homeVenue, setHomeVenue] = useState(emptyVenue);
  const [logoFile, setLogoFile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLogoSubmitting, setIsLogoSubmitting] = useState(false);
  const [activePlayerId, setActivePlayerId] = useState('');
  const [isRosterExpanded, setIsRosterExpanded] = useState(false);
  const [error, setError] = useState('');
  const [logoError, setLogoError] = useState('');

  useEffect(() => {
    let isActive = true;

    async function loadTeam() {
      setIsLoading(true);
      setError('');

      try {
        const response = await teamsApi.getById(teamId);
        if (!isActive) {
          return;
        }

        const loadedTeam = response.team;
        setTeam(loadedTeam);
        setTeamName(loadedTeam?.name || '');
        setPlayers(hydratePlayers(loadedTeam?.players));
        setColors([
          loadedTeam?.colors?.[0] || '',
          loadedTeam?.colors?.[1] || '',
          loadedTeam?.colors?.[2] || '',
        ]);
        setHomeVenue(hydrateVenue(loadedTeam?.homeVenue));
      } catch (loadError) {
        if (!isActive) {
          return;
        }

        setError(loadError.message || 'Failed to load team');
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    loadTeam();

    return () => {
      isActive = false;
    };
  }, [teamId]);

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const response = await teamsApi.update(teamId, {
        name: teamName,
        colors: colors.filter(Boolean).map((value) => value.toLowerCase()),
        homeVenue: normalizeVenue(homeVenue),
      });
      setTeam(response.team);
      navigate('/admin');
    } catch (submitError) {
      setError(submitError.message || 'Failed to update team');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function onUploadLogo() {
    if (!logoFile) {
      return;
    }

    setLogoError('');
    setIsLogoSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('logo', logoFile);
      const response = await teamsApi.uploadLogo(teamId, formData);
      setTeam(response.team);
      setLogoFile(null);
    } catch (submitError) {
      setLogoError(submitError.message || 'Failed to upload logo');
    } finally {
      setIsLogoSubmitting(false);
    }
  }

  async function onRemoveLogo() {
    setLogoError('');
    setIsLogoSubmitting(true);

    try {
      const response = await teamsApi.removeLogo(teamId);
      setTeam(response.team);
      setLogoFile(null);
    } catch (submitError) {
      setLogoError(submitError.message || 'Failed to remove logo');
    } finally {
      setIsLogoSubmitting(false);
    }
  }

  async function onSavePlayer(playerId) {
    const player = players.find((candidate) => candidate.id === playerId);
    if (!player) {
      return;
    }

    setError('');
    setActivePlayerId(`save-${playerId}`);

    try {
      const response = await teamsApi.updatePlayer(teamId, playerId, {
        displayName: player.displayName,
        jerseyNumber: normalizeJerseyNumber(player.jerseyNumber),
        position: player.position || null,
      });

      setTeam(response.team);
      setPlayers(hydratePlayers(response.team?.players));
    } catch (submitError) {
      setError(submitError.message || 'Failed to update player');
    } finally {
      setActivePlayerId('');
    }
  }

  async function onRemovePlayer(playerId) {
    setError('');
    setActivePlayerId(`remove-${playerId}`);

    try {
      const response = await teamsApi.removePlayer(teamId, playerId);
      setTeam(response.team);
      setPlayers(hydratePlayers(response.team?.players));
    } catch (submitError) {
      setError(submitError.message || 'Failed to remove player');
    } finally {
      setActivePlayerId('');
    }
  }

  function updatePlayerValue(playerId, field, value) {
    setPlayers((current) =>
      current.map((player) => (player.id === playerId ? { ...player, [field]: value } : player))
    );
  }

  function updateColor(index, value) {
    setColors((current) => current.map((color, idx) => (idx === index ? value : color)));
  }

  function clearColor(index) {
    updateColor(index, '');
  }

  function updateVenue(field, value) {
    setHomeVenue((current) => ({ ...current, [field]: value }));
  }

  const totalPlayers = players.length;
  const activePlayers = players.length;
  const logoUrl = team?.logo?.url || placeholderLogo;

  return (
    <main className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        eyebrow="Team Management"
        title="Edit Team"
        description={isLoading ? 'Loading team...' : team?.name || 'Unnamed Team'}
      >
        <div className="flex justify-start">
          <Link
            to="/admin"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Back
          </Link>
        </div>
      </PageHeader>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {logoError ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {logoError}
        </p>
      ) : null}

      <section className="grid grid-cols-3 gap-3">
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500 md:text-sm">Active</p>
          <p className="mt-1 text-xl font-semibold text-slate-900 md:text-2xl">
            {isLoading ? '...' : activePlayers}
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500 md:text-sm">Roster</p>
          <p className="mt-1 text-xl font-semibold text-slate-900 md:text-2xl">
            {isLoading ? '...' : totalPlayers}
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500 md:text-sm">Updated</p>
          <p className="mt-1 text-sm font-semibold text-slate-900 md:text-lg">
            {isLoading ? 'Loading...' : formatUpdatedAt(team?.updatedAt)}
          </p>
        </article>
      </section>

      <form
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        onSubmit={onSubmit}
      >
        <section aria-labelledby="team-metadata-heading" className="space-y-6">
          <div>
            <h2 id="team-metadata-heading" className="text-xl font-semibold text-slate-900">
              Team Metadata
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-[220px,1fr]">
            <div className="space-y-3">
              <CloudinaryImage
                src={logoUrl}
                alt={`${team?.name || 'Team'} logo`}
                width={160}
                height={160}
                loading="lazy"
                decoding="async"
                srcSetWidths={[160, 320, 640]}
                sizes="160px"
                className="h-40 w-40 rounded-full border border-slate-200 bg-slate-50 object-cover"
              />
              <label className="block">
                <span className="mb-1 block text-sm text-slate-700">Team Logo File</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  disabled={isLoading || !team || isLogoSubmitting}
                  aria-label="Choose team logo file"
                  onChange={(event) => setLogoFile(event.target.files?.[0] || null)}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!logoFile || isLogoSubmitting}
                  aria-label={isLogoSubmitting ? 'Saving team logo' : 'Upload team logo'}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  onClick={onUploadLogo}
                >
                  {isLogoSubmitting ? 'Saving...' : 'Upload Logo'}
                </button>
                <button
                  type="button"
                  disabled={!team?.logo?.url || isLogoSubmitting}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-60"
                  onClick={onRemoveLogo}
                >
                  Remove Logo
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="mb-1 block text-sm text-slate-700">Team Name</span>
                <input
                  type="text"
                  required
                  disabled={isLoading || !team}
                  autoComplete="organization"
                  className="w-full rounded border border-slate-300 px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-50"
                  value={teamName}
                  onChange={(event) => setTeamName(event.target.value)}
                />
              </label>

              <div className="grid gap-3 md:grid-cols-3">
                {colors.map((color, index) => (
                  <div
                    key={index}
                    className="rounded-xl border border-slate-200 bg-slate-50/60 p-3"
                  >
                    <p className="mb-1 text-sm text-slate-700">Colour {index + 1}</p>
                    <input
                      type="color"
                      aria-label={`Team colour ${index + 1}`}
                      autoComplete="off"
                      className="h-10 w-full rounded border border-slate-300 bg-white"
                      value={color || EMPTY_COLOR}
                      onChange={(event) => updateColor(index, event.target.value)}
                    />
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <span className="text-xs uppercase tracking-wide text-slate-500">
                        {color || 'Not set'}
                      </span>
                      <button
                        type="button"
                        aria-label={`Clear team colour ${index + 1}`}
                        className="text-xs font-semibold text-slate-600 hover:text-slate-900"
                        onClick={() => clearColor(index)}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="block md:col-span-2">
                  <span className="mb-1 block text-sm text-slate-700">Arena Name</span>
                  <input
                    type="text"
                    autoComplete="organization-title"
                    className="w-full rounded border border-slate-300 px-3 py-2"
                    value={homeVenue.arenaName}
                    onChange={(event) => updateVenue('arenaName', event.target.value)}
                  />
                </label>
                <label className="block md:col-span-2">
                  <span className="mb-1 block text-sm text-slate-700">Address Line 1</span>
                  <input
                    type="text"
                    autoComplete="address-line1"
                    className="w-full rounded border border-slate-300 px-3 py-2"
                    value={homeVenue.addressLine1}
                    onChange={(event) => updateVenue('addressLine1', event.target.value)}
                  />
                </label>
                <label className="block md:col-span-2">
                  <span className="mb-1 block text-sm text-slate-700">Address Line 2</span>
                  <input
                    type="text"
                    autoComplete="address-line2"
                    className="w-full rounded border border-slate-300 px-3 py-2"
                    value={homeVenue.addressLine2}
                    onChange={(event) => updateVenue('addressLine2', event.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm text-slate-700">City</span>
                  <input
                    type="text"
                    autoComplete="address-level2"
                    className="w-full rounded border border-slate-300 px-3 py-2"
                    value={homeVenue.city}
                    onChange={(event) => updateVenue('city', event.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm text-slate-700">State / Province</span>
                  <input
                    type="text"
                    autoComplete="address-level1"
                    className="w-full rounded border border-slate-300 px-3 py-2"
                    value={homeVenue.state}
                    onChange={(event) => updateVenue('state', event.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm text-slate-700">Postal Code</span>
                  <input
                    type="text"
                    autoComplete="postal-code"
                    className="w-full rounded border border-slate-300 px-3 py-2"
                    value={homeVenue.postalCode}
                    onChange={(event) => updateVenue('postalCode', event.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm text-slate-700">Country</span>
                  <input
                    type="text"
                    autoComplete="country-name"
                    className="w-full rounded border border-slate-300 px-3 py-2"
                    value={homeVenue.country}
                    onChange={(event) => updateVenue('country', event.target.value)}
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="submit"
                  disabled={isLoading || !team || isSubmitting}
                  className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
                >
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </section>
      </form>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 id="roster-heading" className="text-xl font-semibold text-slate-900">
              Edit Team Players
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {players.length} active {players.length === 1 ? 'player' : 'players'}
            </p>
          </div>
          <button
            type="button"
            aria-expanded={isRosterExpanded}
            aria-controls="team-players-panel"
            aria-label={isRosterExpanded ? 'Hide team players roster' : 'Show team players roster'}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
            onClick={() => setIsRosterExpanded((current) => !current)}
          >
            {isRosterExpanded ? 'Hide' : 'Show'}
          </button>
        </div>

        {isRosterExpanded ? (
          <div id="team-players-panel" className="mt-4 space-y-3">
            {isLoading ? <p className="text-sm text-slate-600">Loading players...</p> : null}
            {!isLoading && players.length === 0 ? (
              <p className="rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-600">
                No active players on this team yet.
              </p>
            ) : null}

            {players.map((player, index) => {
              const isSavingPlayer = activePlayerId === `save-${player.id}`;

              return (
                <div
                  key={player.id}
                  className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3 md:grid-cols-[1.4fr,0.8fr,0.8fr,auto]"
                >
                  <label className="block">
                    <span className="mb-1 block text-sm text-slate-700">
                      Player {index + 1} Name
                    </span>
                    <input
                      type="text"
                      autoComplete="name"
                      className="w-full rounded border border-slate-300 px-3 py-2"
                      value={player.displayName}
                      disabled={Boolean(activePlayerId)}
                      onChange={(event) =>
                        updatePlayerValue(player.id, 'displayName', event.target.value)
                      }
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm text-slate-700">Jersey Number</span>
                    <input
                      type="number"
                      autoComplete="off"
                      className="w-full rounded border border-slate-300 px-3 py-2"
                      value={player.jerseyNumber}
                      disabled={Boolean(activePlayerId)}
                      onChange={(event) =>
                        updatePlayerValue(player.id, 'jerseyNumber', event.target.value)
                      }
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm text-slate-700">Position</span>
                    <select
                      aria-label={`Player ${index + 1} position`}
                      className="w-full rounded border border-slate-300 px-3 py-2"
                      value={player.position}
                      disabled={Boolean(activePlayerId)}
                      onChange={(event) =>
                        updatePlayerValue(player.id, 'position', event.target.value)
                      }
                    >
                      <option value="">No position</option>
                      {POSITION_OPTIONS.filter(Boolean).map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex items-end gap-2 md:justify-end">
                    <button
                      type="button"
                      disabled={Boolean(activePlayerId)}
                      aria-label={`Save player ${player.displayName || index + 1}`}
                      className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      onClick={() => onSavePlayer(player.id)}
                    >
                      {isSavingPlayer ? '...' : 'Save'}
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(activePlayerId)}
                      aria-label={`Remove player ${player.displayName || index + 1}`}
                      className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-60"
                      onClick={() => onRemovePlayer(player.id)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </section>
    </main>
  );
}
