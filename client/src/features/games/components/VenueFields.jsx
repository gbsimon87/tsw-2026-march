const EMPTY_ADDRESS = {
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postalCode: '',
  country: '',
};

export function emptyVenueDetails() {
  return { name: '', address: { ...EMPTY_ADDRESS } };
}

export function normalizeVenueDetails(value) {
  // The API returns null for address parts that were never filled in (an
  // unset addressLine2 on every league game, for instance). Spreading those
  // straight over EMPTY_ADDRESS kept the nulls, and every consumer here calls
  // .trim() on the parts — so one null crashed buildReusableVenues and took
  // the calling page's whole load effect down with it. Coerce to strings, and
  // only keep the fields the form knows about.
  const rawAddress = value?.address || value?.venueAddress || {};
  const address = Object.fromEntries(
    Object.keys(EMPTY_ADDRESS).map((field) => [
      field,
      typeof rawAddress[field] === 'string' ? rawAddress[field] : '',
    ])
  );
  const rawName = value?.name || value?.venue || '';
  return {
    name: typeof rawName === 'string' ? rawName : '',
    address,
  };
}

export function buildReusableVenues(values = []) {
  const seen = new Set();
  const venues = [];
  values.forEach((value) => {
    const venue = normalizeVenueDetails(value);
    if (!venue.name.trim()) return;
    const key = JSON.stringify([
      venue.name.trim().toLowerCase(),
      ...Object.values(venue.address).map((part) => part.trim().toLowerCase()),
    ]);
    if (seen.has(key)) return;
    seen.add(key);
    venues.push({ key, ...venue });
  });
  return venues;
}

export function VenueFields({ value, onChange, reusableVenues = [] }) {
  const venue = normalizeVenueDetails(value);
  const updateAddress = (field, nextValue) =>
    onChange({ ...venue, address: { ...venue.address, [field]: nextValue } });

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold text-slate-800">Venue</legend>
      {reusableVenues.length > 0 ? (
        <label className="block">
          <span className="mb-1 block text-sm text-slate-700">Use a previous venue</span>
          <select
            aria-label="Use a previous venue"
            defaultValue=""
            onChange={(event) => {
              const selected = reusableVenues.find((option) => option.key === event.target.value);
              if (selected) onChange(normalizeVenueDetails(selected));
            }}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm"
          >
            <option value="">Add a new venue</option>
            {reusableVenues.map((option) => (
              <option key={option.key} value={option.key}>
                {option.name}
                {option.address.city ? ` — ${option.address.city}` : ''}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="block min-w-0">
        <span className="mb-1 block text-sm text-slate-700">Venue name</span>
        <input
          type="text"
          maxLength={120}
          placeholder="e.g. Central Court"
          value={venue.name}
          onChange={(event) => onChange({ ...venue, name: event.target.value })}
          className="w-full max-w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm text-slate-700">Address line 1</span>
          <input
            type="text"
            value={venue.address.addressLine1}
            onChange={(event) => updateAddress('addressLine1', event.target.value)}
            autoComplete="address-line1"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm text-slate-700">Address line 2</span>
          <input
            type="text"
            value={venue.address.addressLine2}
            onChange={(event) => updateAddress('addressLine2', event.target.value)}
            autoComplete="address-line2"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm"
          />
        </label>
        {[
          ['city', 'City', 'address-level2'],
          ['state', 'State / county', 'address-level1'],
          ['postalCode', 'Postal code', 'postal-code'],
          ['country', 'Country', 'country-name'],
        ].map(([field, label, autoComplete]) => (
          <label key={field} className="block">
            <span className="mb-1 block text-sm text-slate-700">{label}</span>
            <input
              type="text"
              value={venue.address[field]}
              onChange={(event) => updateAddress(field, event.target.value)}
              autoComplete={autoComplete}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm"
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function venuePayload(value) {
  const venue = normalizeVenueDetails(value);
  const address = Object.fromEntries(
    Object.entries(venue.address).map(([key, part]) => [key, part.trim()])
  );
  return {
    ...(venue.name.trim() ? { venue: venue.name.trim() } : {}),
    ...(Object.values(address).some(Boolean) ? { venueAddress: address } : {}),
  };
}
