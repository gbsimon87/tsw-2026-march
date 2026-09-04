import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { safeInternalPath } from '../../../lib/safeRedirect';
import { PageHeader } from '../../../components/PageHeader';
import {
  controlClass,
  controlInvalidClass,
  hintClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
  sectionHeadingClass,
} from '../../../components/ui/formStyles';
import { teamsApi } from '../api/teamsApi';

const POSITION_OPTIONS = ['', 'PG', 'SG', 'SF', 'PF', 'C'];
const COLOR_SLOTS = 3;
const DEFAULT_PICKER_COLOR = '#F4A300';

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

function renderFieldError(message, id) {
  if (!message) {
    return null;
  }

  return (
    <p id={id} className="mt-1.5 text-xs font-medium text-red-600">
      {message}
    </p>
  );
}

/**
 * A colour slot.
 *
 * The bare `<input type="color">` rendered as a solid black bar labelled
 * "Not set" — so an unset colour looked exactly like a colour set to black.
 * The swatch now shows an empty state, and the native picker sits behind it.
 */
function ColorSlot({ index, value, onChange, onClear }) {
  const inputId = `team-colour-${index}`;
  const isSet = Boolean(value);

  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/60 p-2 sm:p-3">
      <label htmlFor={inputId} className={labelClass}>
        Colour {index + 1}
      </label>
      {/* Three slots share one row even at 320px, so the swatch goes
          full-width and the value/Clear pair stacks until sm. */}
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
        <div className="relative h-9 w-full shrink-0 sm:h-10 sm:w-14">
          <input
            id={inputId}
            type="color"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            value={value || DEFAULT_PICKER_COLOR}
            onChange={(event) => onChange(event.target.value)}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-lg border border-slate-300"
            style={
              isSet
                ? { backgroundColor: value }
                : {
                    // A diagonal hatch reads as "nothing chosen" where a solid
                    // fill would read as a chosen colour.
                    backgroundImage:
                      'repeating-linear-gradient(45deg, #fff 0 5px, #e2e8f0 5px 10px)',
                  }
            }
          />
        </div>
        <div className="flex min-w-0 flex-col items-start gap-0.5 sm:flex-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
          <span className="tsw-tnum max-w-full truncate text-[10px] uppercase tracking-wide text-slate-500 sm:text-xs">
            {value || 'Not set'}
          </span>
          {isSet ? (
            <button
              type="button"
              aria-label={`Clear colour ${index + 1}`}
              className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900 sm:px-2 sm:py-1 sm:text-xs"
              onClick={onClear}
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
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
  const [showIdentity, setShowIdentity] = useState(false);
  // Same-origin only: this page is reachable as /teams/new?redirectTo=… from
  // the onboarding hand-off. See lib/safeRedirect.
  const redirectTo = safeInternalPath(searchParams.get('redirectTo'), '');
  // Keyed by row index so a newly added row can take focus; without this the
  // focus stayed on "Add player" and the new name field had to be found by hand.
  const nameInputRefs = useRef({});
  const pendingFocusIndex = useRef(null);

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
    setPlayers((current) => {
      pendingFocusIndex.current = current.length;
      return [...current, nextPlayer()];
    });
  }

  function registerNameInput(index, node) {
    nameInputRefs.current[index] = node;
    if (node && pendingFocusIndex.current === index) {
      pendingFocusIndex.current = null;
      node.focus();
    }
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
      // Any venue error is inside the collapsed section, so open it rather than
      // reporting an error the user cannot see.
      if (Object.keys(clientErrors).some((key) => key.startsWith('homeVenue'))) {
        setShowIdentity(true);
      }
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
        // Creating a team used to land on /pricing, which confirmed nothing and
        // offered no route to the team just created — the free plan's only
        // button there is "View The Pulse". Go to the team, and say it worked.
        navigate(redirectTo || (newTeamId ? `/admin/teams/${newTeamId}` : '/admin'), {
          state: newTeamId ? { createdTeamName: teamName.trim() } : undefined,
        });
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

  const venueFields = [
    ['arenaName', 'Arena name', 'sm:col-span-2'],
    ['addressLine1', 'Address line 1', 'sm:col-span-2'],
    ['addressLine2', 'Address line 2', 'sm:col-span-2'],
    ['city', 'City', ''],
    ['state', 'State / province', ''],
    ['postalCode', 'Postal code', ''],
    ['country', 'Country', ''],
  ];

  return (
    <main className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Create Team"
        description="A name is all you need. Add the rest whenever it matters."
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
        {logoError ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {logoError}
          </p>
        ) : null}

        <section className="space-y-4">
          <div>
            <label htmlFor="team-name" className={`${labelClass} text-base font-semibold`}>
              Team Name
            </label>
            <input
              id="team-name"
              type="text"
              autoComplete="organization"
              aria-invalid={fieldErrors.teamName ? 'true' : undefined}
              aria-describedby={fieldErrors.teamName ? 'team-name-error' : undefined}
              className={fieldErrors.teamName ? controlInvalidClass : controlClass}
              placeholder="Riverside Rockets"
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
            {renderFieldError(fieldErrors.teamName, 'team-name-error')}
          </div>
        </section>

        <section
          aria-labelledby="roster-heading"
          className="space-y-3 border-t border-slate-100 pt-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="roster-heading" className={sectionHeadingClass}>
                Roster
              </h2>
              <p className={hintClass}>
                Optional now — you can add players from the team page any time, including mid-game.
              </p>
            </div>
            <button type="button" className={secondaryButtonClass} onClick={addPlayerRow}>
              Add player
            </button>
          </div>

          {renderFieldError(fieldErrors.players)}

          <div className="space-y-2">
            {playerRows.map((player) => {
              const nameErrorId = `player-${player.index}-name-error`;
              const nameError = fieldErrors[`players.${player.index}.displayName`];

              return (
                <div
                  key={player.index}
                  className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-slate-50/50 p-3 sm:grid-cols-[1.6fr,0.7fr,0.9fr,auto]"
                >
                  <div className="min-w-0">
                    <label htmlFor={`player-${player.index}-name`} className="sr-only">
                      Player {player.index + 1} name
                    </label>
                    <input
                      id={`player-${player.index}-name`}
                      ref={(node) => registerNameInput(player.index, node)}
                      type="text"
                      autoComplete="off"
                      placeholder="Player name"
                      aria-invalid={nameError ? 'true' : undefined}
                      aria-describedby={nameError ? nameErrorId : undefined}
                      className={nameError ? controlInvalidClass : controlClass}
                      value={player.displayName}
                      onChange={(event) =>
                        updatePlayer(player.index, 'displayName', event.target.value)
                      }
                    />
                  </div>
                  <div className="min-w-0">
                    <label htmlFor={`player-${player.index}-jersey`} className="sr-only">
                      Player {player.index + 1} jersey number
                    </label>
                    <input
                      id={`player-${player.index}-jersey`}
                      type="number"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="#"
                      className={controlClass}
                      value={player.jerseyNumber}
                      onChange={(event) =>
                        updatePlayer(player.index, 'jerseyNumber', event.target.value)
                      }
                    />
                  </div>
                  <div className="min-w-0">
                    <label htmlFor={`player-${player.index}-position`} className="sr-only">
                      Player {player.index + 1} position
                    </label>
                    <select
                      id={`player-${player.index}-position`}
                      className={controlClass}
                      value={player.position}
                      onChange={(event) =>
                        updatePlayer(player.index, 'position', event.target.value)
                      }
                    >
                      <option value="">No position</option>
                      {POSITION_OPTIONS.filter(Boolean).map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove player ${player.index + 1}`}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:border-red-400 hover:bg-[#B42318] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => removePlayerRow(player.index)}
                    disabled={players.length <= 1}
                  >
                    Remove
                  </button>
                  {nameError ? (
                    <p id={nameErrorId} className="text-xs font-medium text-red-600 sm:col-span-4">
                      {nameError}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        {/* Logo, colours and a full postal address used to sit between the one
            required field and the button — roughly 1,000px of optional form. */}
        <section className="border-t border-slate-100 pt-5">
          <button
            type="button"
            aria-expanded={showIdentity}
            aria-controls="team-identity-options"
            onClick={() => setShowIdentity((previous) => !previous)}
            className="flex w-full items-center justify-between gap-2 rounded-lg px-1 py-1 text-left text-sm font-semibold text-slate-700 transition-colors hover:text-slate-900"
          >
            <span>Logo, colours and home venue</span>
            <svg
              viewBox="0 0 16 16"
              className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
                showIdentity ? 'rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {showIdentity ? (
            <div id="team-identity-options" className="t-panel mt-5 space-y-7">
              <div>
                <span className={labelClass}>Team logo</span>
                <div className="flex flex-wrap items-center gap-3">
                  <label htmlFor="team-logo" className={`${secondaryButtonClass} cursor-pointer`}>
                    Choose image
                  </label>
                  <input
                    id="team-logo"
                    type="file"
                    className="sr-only"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(event) => setLogoFile(event.target.files?.[0] || null)}
                  />
                  <span className="min-w-0 truncate text-sm text-slate-500">
                    {logoFile ? logoFile.name : 'No image chosen'}
                  </span>
                </div>
                <p className={hintClass}>PNG, JPEG or WebP. Square images crop best.</p>
              </div>

              <div>
                <h3 className={`${sectionHeadingClass} mb-1`}>Team colours</h3>
                <p className={`${hintClass} mb-3 mt-0`}>
                  Used on shareable cards and your public team page.
                </p>
                {renderFieldError(fieldErrors.colors)}
                <div className="grid grid-cols-3 gap-2 sm:gap-3" data-testid="team-colour-grid">
                  {Array.from({ length: COLOR_SLOTS }).map((_, index) => (
                    <ColorSlot
                      key={index}
                      index={index}
                      value={colors[index]}
                      onChange={(next) => updateColor(index, next)}
                      onClear={() => clearColor(index)}
                    />
                  ))}
                </div>
              </div>

              <div>
                <h3 className={`${sectionHeadingClass} mb-1`}>Home venue</h3>
                <p className={`${hintClass} mb-3 mt-0`}>
                  Shown on fixtures so visiting teams know where to go. Fill it in fully or leave it
                  blank.
                </p>
                {renderFieldError(fieldErrors.homeVenue)}
                <div className="grid gap-3 sm:grid-cols-2">
                  {venueFields.map(([field, label, span]) => {
                    const errorKey = `homeVenue.${field}`;
                    const fieldError = fieldErrors[errorKey];
                    return (
                      <div key={field} className={span}>
                        <label htmlFor={`venue-${field}`} className={labelClass}>
                          {label}
                        </label>
                        <input
                          id={`venue-${field}`}
                          type="text"
                          autoComplete="off"
                          aria-invalid={fieldError ? 'true' : undefined}
                          aria-describedby={fieldError ? `${errorKey}-error` : undefined}
                          className={fieldError ? controlInvalidClass : controlClass}
                          value={homeVenue[field]}
                          onChange={(event) => updateVenue(field, event.target.value)}
                        />
                        {renderFieldError(fieldError, `${errorKey}-error`)}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
        </section>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center">
          <button type="submit" disabled={isSubmitting} className={primaryButtonClass}>
            {isSubmitting ? 'Creating…' : 'Create team'}
          </button>
          <Link to="/admin" className={secondaryButtonClass}>
            Cancel
          </Link>
        </div>
      </form>
    </main>
  );
}
