import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../../components/PageHeader';
import { teamsApi } from '../api/teamsApi';

const POSITION_OPTIONS = ['', 'PG', 'SG', 'SF', 'PF', 'C'];
const COLOR_SLOTS = 3;
const EMPTY_COLOR = '#000000';

function nextPlayer() {
  return { displayName: '', jerseyNumber: '', position: '' };
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

function normalizePlayers(players) {
  return players
    .map((player) => ({
      displayName: player.displayName.trim(),
      jerseyNumber:
        player.jerseyNumber === '' || Number.isNaN(Number(player.jerseyNumber))
          ? undefined
          : Number(player.jerseyNumber),
      position: player.position || undefined,
    }))
    .filter((player) => player.displayName.length > 0);
}

function normalizeColors(colors) {
  return colors.filter(Boolean).map((value) => value.toLowerCase());
}

function normalizeVenue(homeVenue) {
  const normalized = Object.fromEntries(
    Object.entries(homeVenue).map(([key, value]) => [key, value.trim()])
  );

  return Object.values(normalized).some(Boolean) ? normalized : undefined;
}

function getVenueFieldErrors(homeVenue) {
  const normalizedVenue = normalizeVenue(homeVenue);
  if (!normalizedVenue) {
    return {};
  }

  const requiredFields = [
    ['arenaName', 'Add the arena name.'],
    ['addressLine1', 'Add the street address.'],
    ['city', 'Add the city.'],
    ['state', 'Add the state or province.'],
    ['postalCode', 'Add the postal code.'],
    ['country', 'Add the country.'],
  ];

  return Object.fromEntries(
    requiredFields
      .filter(([field]) => !normalizedVenue[field])
      .map(([field, message]) => [`homeVenue.${field}`, message])
  );
}

function getClientErrors({ teamName, homeVenue, players }) {
  const nextErrors = {};

  if (!teamName.trim()) {
    nextErrors.teamName = 'Give your team a name before continuing.';
  }

  const venueErrors = getVenueFieldErrors(homeVenue);
  Object.assign(nextErrors, venueErrors);

  players.forEach((player, index) => {
    if (player.displayName.trim() === '' && (player.jerseyNumber || player.position)) {
      nextErrors[`players.${index}.displayName`] =
        'Add the player name or clear this row before creating the team.';
    }
  });

  return nextErrors;
}

function mapServerErrorToFieldErrors(error) {
  const fieldErrors = {};
  const details = error?.details?.fieldErrors;
  if (!details || typeof details !== 'object') {
    return fieldErrors;
  }

  if (Array.isArray(details.name) && details.name[0]) {
    fieldErrors.teamName = 'Give your team a name before continuing.';
  }

  if (Array.isArray(details.colors) && details.colors[0]) {
    fieldErrors.colors = 'Choose up to 3 valid team colours.';
  }

  if (Array.isArray(details.players) && details.players[0]) {
    fieldErrors.players = 'Check your roster entries and try again.';
  }

  if (Array.isArray(details.homeVenue) && details.homeVenue[0]) {
    fieldErrors.homeVenue = 'Complete the home venue details or leave them blank for now.';
  }

  return fieldErrors;
}

function inputClassName(hasError) {
  return `w-full rounded border px-3 py-2 ${hasError ? 'border-red-500 bg-red-50' : 'border-slate-300'}`;
}

function renderFieldError(message) {
  if (!message) {
    return null;
  }

  return <p className="mt-1 text-sm text-red-700">{message}</p>;
}

export function NewTeamPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [teamName, setTeamName] = useState('');
  const [players, setPlayers] = useState([nextPlayer()]);
  const [colors, setColors] = useState(['', '', '']);
  const [homeVenue, setHomeVenue] = useState(emptyVenue);
  const [logoFile, setLogoFile] = useState(null);
  const [error, setError] = useState('');
  const [logoError, setLogoError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const rawRedirectTo = searchParams.get('redirectTo') || '';
  const redirectTo = rawRedirectTo.startsWith('/') ? rawRedirectTo : '';

  const playerRows = useMemo(
    () =>
      players.map((player, index) => ({
        ...player,
        index,
      })),
    [players]
  );

  function updatePlayer(index, field, value) {
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[`players.${index}.${field}`];
      if (field !== 'displayName') {
        delete next[`players.${index}.displayName`];
      }
      delete next.players;
      return next;
    });
    setPlayers((current) =>
      current.map((player, idx) => (idx === index ? { ...player, [field]: value } : player))
    );
  }

  function addPlayerRow() {
    setPlayers((current) => [...current, nextPlayer()]);
  }

  function removePlayerRow(index) {
    setPlayers((current) => current.filter((_, idx) => idx !== index));
  }

  function updateColor(index, value) {
    setFieldErrors((current) => {
      const next = { ...current };
      delete next.colors;
      return next;
    });
    setColors((current) => current.map((color, idx) => (idx === index ? value : color)));
  }

  function clearColor(index) {
    updateColor(index, '');
  }

  function updateVenue(field, value) {
    setFieldErrors((current) => {
      const next = { ...current };
      delete next.homeVenue;
      delete next[`homeVenue.${field}`];
      return next;
    });
    setHomeVenue((current) => ({ ...current, [field]: value }));
  }

  async function onSubmit(event) {
    event.preventDefault();
    const clientErrors = getClientErrors({ teamName, homeVenue, players });
    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      setError('There are a few details to fix before we can create this team.');
      return;
    }

    setError('');
    setLogoError('');
    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const response = await teamsApi.create({
        name: teamName,
        players: normalizePlayers(players),
        colors: normalizeColors(colors),
        homeVenue: normalizeVenue(homeVenue),
      });

      let didLogoUploadFail = false;
      if (logoFile && response.team?.id) {
        try {
          const formData = new FormData();
          formData.append('logo', logoFile);
          await teamsApi.uploadLogo(response.team.id, formData);
        } catch (uploadError) {
          didLogoUploadFail = true;
          setLogoError(uploadError.message || 'Team created, but logo upload failed.');
        }
      }

      if (!didLogoUploadFail) {
        const newTeamId = response.team?.id;
        navigate(
          redirectTo ||
            (newTeamId ? `/pricing?teamId=${encodeURIComponent(newTeamId)}` : '/pricing')
        );
      }
    } catch (submitError) {
      const nextFieldErrors = mapServerErrorToFieldErrors(submitError);
      setFieldErrors(nextFieldErrors);
      setError(
        Object.keys(nextFieldErrors).length > 0
          ? 'We found a few things to fix in the form.'
          : submitError.message || 'We could not create the team right now.'
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        title="Create Team"
        description="Build your team identity, set a home venue, and start your roster in one pass."
      />

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

      <form
        className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        onSubmit={onSubmit}
      >
        <section aria-labelledby="team-details-heading" className="space-y-3">
          <h2 id="team-details-heading" className="text-xl font-semibold text-slate-900">
            Team Details
          </h2>
          <label className="block">
            <span className="mb-1 block text-sm text-slate-700">Team Name</span>
            <input
              type="text"
              required
              aria-invalid={fieldErrors.teamName ? 'true' : 'false'}
              className={inputClassName(fieldErrors.teamName)}
              value={teamName}
              onChange={(event) => {
                setFieldErrors((current) => {
                  const next = { ...current };
                  delete next.teamName;
                  return next;
                });
                setTeamName(event.target.value);
              }}
            />
            {renderFieldError(fieldErrors.teamName)}
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-slate-700">Team Logo</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="w-full rounded border border-slate-300 px-3 py-2"
              onChange={(event) => setLogoFile(event.target.files?.[0] || null)}
            />
          </label>
        </section>

        <section aria-labelledby="team-colors-heading" className="space-y-3">
          <h2 id="team-colors-heading" className="text-xl font-semibold text-slate-900">
            Team Colours
          </h2>
          {renderFieldError(fieldErrors.colors)}
          <div className="grid gap-3 md:grid-cols-3">
            {Array.from({ length: COLOR_SLOTS }).map((_, index) => (
              <div key={index} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <label className="block">
                  <span className="mb-1 block text-sm text-slate-700">Colour {index + 1}</span>
                  <input
                    type="color"
                    className="h-10 w-full rounded border border-slate-300 bg-white"
                    value={colors[index] || EMPTY_COLOR}
                    onChange={(event) => updateColor(index, event.target.value)}
                  />
                </label>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-xs uppercase tracking-wide text-slate-500">
                    {colors[index] || 'Not set'}
                  </span>
                  <button
                    type="button"
                    className="text-xs font-semibold text-slate-600 hover:text-slate-900"
                    onClick={() => clearColor(index)}
                  >
                    Clear
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="home-venue-heading" className="space-y-3">
          <h2 id="home-venue-heading" className="text-xl font-semibold text-slate-900">
            Home Venue
          </h2>
          {renderFieldError(fieldErrors.homeVenue)}
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block md:col-span-2">
              <span className="mb-1 block text-sm text-slate-700">Arena Name</span>
              <input
                type="text"
                aria-invalid={fieldErrors['homeVenue.arenaName'] ? 'true' : 'false'}
                className={inputClassName(fieldErrors['homeVenue.arenaName'])}
                value={homeVenue.arenaName}
                onChange={(event) => updateVenue('arenaName', event.target.value)}
              />
              {renderFieldError(fieldErrors['homeVenue.arenaName'])}
            </label>
            <label className="block md:col-span-2">
              <span className="mb-1 block text-sm text-slate-700">Address Line 1</span>
              <input
                type="text"
                aria-invalid={fieldErrors['homeVenue.addressLine1'] ? 'true' : 'false'}
                className={inputClassName(fieldErrors['homeVenue.addressLine1'])}
                value={homeVenue.addressLine1}
                onChange={(event) => updateVenue('addressLine1', event.target.value)}
              />
              {renderFieldError(fieldErrors['homeVenue.addressLine1'])}
            </label>
            <label className="block md:col-span-2">
              <span className="mb-1 block text-sm text-slate-700">Address Line 2</span>
              <input
                type="text"
                className={inputClassName(false)}
                value={homeVenue.addressLine2}
                onChange={(event) => updateVenue('addressLine2', event.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-slate-700">City</span>
              <input
                type="text"
                aria-invalid={fieldErrors['homeVenue.city'] ? 'true' : 'false'}
                className={inputClassName(fieldErrors['homeVenue.city'])}
                value={homeVenue.city}
                onChange={(event) => updateVenue('city', event.target.value)}
              />
              {renderFieldError(fieldErrors['homeVenue.city'])}
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-slate-700">State / Province</span>
              <input
                type="text"
                aria-invalid={fieldErrors['homeVenue.state'] ? 'true' : 'false'}
                className={inputClassName(fieldErrors['homeVenue.state'])}
                value={homeVenue.state}
                onChange={(event) => updateVenue('state', event.target.value)}
              />
              {renderFieldError(fieldErrors['homeVenue.state'])}
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-slate-700">Postal Code</span>
              <input
                type="text"
                aria-invalid={fieldErrors['homeVenue.postalCode'] ? 'true' : 'false'}
                className={inputClassName(fieldErrors['homeVenue.postalCode'])}
                value={homeVenue.postalCode}
                onChange={(event) => updateVenue('postalCode', event.target.value)}
              />
              {renderFieldError(fieldErrors['homeVenue.postalCode'])}
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-slate-700">Country</span>
              <input
                type="text"
                aria-invalid={fieldErrors['homeVenue.country'] ? 'true' : 'false'}
                className={inputClassName(fieldErrors['homeVenue.country'])}
                value={homeVenue.country}
                onChange={(event) => updateVenue('country', event.target.value)}
              />
              {renderFieldError(fieldErrors['homeVenue.country'])}
            </label>
          </div>
        </section>

        <section aria-labelledby="roster-heading" className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 id="roster-heading" className="text-xl font-semibold text-slate-900">
              Roster
            </h2>
            <button
              type="button"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
              onClick={addPlayerRow}
            >
              Add Player
            </button>
          </div>

          <p className="text-sm text-slate-600">
            Player names are required to save roster rows. Jersey numbers and positions are
            optional.
          </p>
          {renderFieldError(fieldErrors.players)}

          <div className="space-y-2">
            {playerRows.map((player) => (
              <div
                key={player.index}
                className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-slate-50/50 p-3 md:grid-cols-[1.4fr,0.8fr,0.8fr,auto]"
              >
                <input
                  type="text"
                  placeholder="Player Name"
                  aria-invalid={
                    fieldErrors[`players.${player.index}.displayName`] ? 'true' : 'false'
                  }
                  className={`rounded px-3 py-2 ${
                    fieldErrors[`players.${player.index}.displayName`]
                      ? 'border border-red-500 bg-red-50'
                      : 'border border-slate-300'
                  }`}
                  value={player.displayName}
                  onChange={(event) =>
                    updatePlayer(player.index, 'displayName', event.target.value)
                  }
                />
                <input
                  type="number"
                  placeholder="Jersey #"
                  className="rounded border border-slate-300 px-3 py-2"
                  value={player.jerseyNumber}
                  onChange={(event) =>
                    updatePlayer(player.index, 'jerseyNumber', event.target.value)
                  }
                />
                <select
                  className="rounded border border-slate-300 px-3 py-2"
                  value={player.position}
                  onChange={(event) => updatePlayer(player.index, 'position', event.target.value)}
                >
                  <option value="">No position</option>
                  {POSITION_OPTIONS.filter(Boolean).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => removePlayerRow(player.index)}
                  disabled={players.length <= 1}
                >
                  Remove
                </button>
                {fieldErrors[`players.${player.index}.displayName`] ? (
                  <p className="text-sm text-red-700 md:col-span-4">
                    {fieldErrors[`players.${player.index}.displayName`]}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
          >
            {isSubmitting ? 'Saving...' : 'Create Team'}
          </button>
        </div>
      </form>
    </main>
  );
}
