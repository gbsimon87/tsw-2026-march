import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  buildReusableVenues,
  emptyVenueDetails,
  normalizeVenueDetails,
  VenueFields,
  venuePayload,
} from './VenueFields';

describe('normalizeVenueDetails', () => {
  it('reads a name from either name or venue', () => {
    expect(normalizeVenueDetails({ name: 'Court 1' }).name).toBe('Court 1');
    expect(normalizeVenueDetails({ venue: 'Court 2' }).name).toBe('Court 2');
  });

  it('reads an address from either address or venueAddress', () => {
    expect(normalizeVenueDetails({ address: { city: 'Leeds' } }).address.city).toBe('Leeds');
    expect(normalizeVenueDetails({ venueAddress: { city: 'Hull' } }).address.city).toBe('Hull');
  });

  it('fills every address field so inputs stay controlled', () => {
    const { address } = normalizeVenueDetails(null);

    expect(Object.keys(address)).toEqual([
      'addressLine1',
      'addressLine2',
      'city',
      'state',
      'postalCode',
      'country',
    ]);
    expect(Object.values(address).every((part) => part === '')).toBe(true);
  });

  it('matches emptyVenueDetails for no input', () => {
    expect(normalizeVenueDetails(undefined)).toEqual(emptyVenueDetails());
  });
});

describe('buildReusableVenues', () => {
  it('collects distinct venues from past games', () => {
    const venues = buildReusableVenues([
      { venue: 'Central Court', venueAddress: { city: 'London' } },
      { venue: 'Riverside Gym', venueAddress: { city: 'Bristol' } },
    ]);

    expect(venues.map((venue) => venue.name)).toEqual(['Central Court', 'Riverside Gym']);
  });

  it('deduplicates the same venue regardless of case or spacing', () => {
    const venues = buildReusableVenues([
      { venue: 'Central Court', venueAddress: { city: 'London' } },
      { venue: '  central court  ', venueAddress: { city: '  LONDON  ' } },
    ]);

    expect(venues).toHaveLength(1);
  });

  it('treats the same name at a different address as a separate venue', () => {
    const venues = buildReusableVenues([
      { venue: 'Sports Hall', venueAddress: { city: 'London' } },
      { venue: 'Sports Hall', venueAddress: { city: 'Leeds' } },
    ]);

    expect(venues).toHaveLength(2);
  });

  it('skips games with no venue name', () => {
    expect(
      buildReusableVenues([{ venue: '' }, { venue: '   ' }, {}, { venueAddress: { city: 'Hull' } }])
    ).toEqual([]);
  });

  it('tolerates a missing list', () => {
    expect(buildReusableVenues()).toEqual([]);
  });
});

describe('venuePayload', () => {
  it('sends a trimmed venue name', () => {
    expect(venuePayload({ name: '  Central Court  ' })).toEqual({ venue: 'Central Court' });
  });

  it('sends a trimmed address alongside the name', () => {
    expect(venuePayload({ name: 'Central Court', address: { city: '  London  ' } })).toEqual({
      venue: 'Central Court',
      venueAddress: expect.objectContaining({ city: 'London' }),
    });
  });

  it('omits both keys when nothing was entered', () => {
    expect(venuePayload(emptyVenueDetails())).toEqual({});
  });

  it('omits venueAddress when only whitespace was entered', () => {
    expect(venuePayload({ name: 'Court 1', address: { city: '   ' } })).toEqual({
      venue: 'Court 1',
    });
  });
});

describe('VenueFields', () => {
  it('hides the previous-venue picker when there is nothing to reuse', () => {
    render(<VenueFields value={emptyVenueDetails()} onChange={vi.fn()} />);

    expect(screen.queryByLabelText('Use a previous venue')).not.toBeInTheDocument();
  });

  it('offers a previous venue and applies it on selection', async () => {
    const onChange = vi.fn();
    const reusableVenues = buildReusableVenues([
      { venue: 'Central Court', venueAddress: { city: 'London' } },
    ]);
    render(
      <VenueFields
        value={emptyVenueDetails()}
        onChange={onChange}
        reusableVenues={reusableVenues}
      />
    );

    await userEvent.selectOptions(
      screen.getByLabelText('Use a previous venue'),
      reusableVenues[0].key
    );

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Central Court',
        address: expect.objectContaining({ city: 'London' }),
      })
    );
  });

  it('shows the city next to a reusable venue name', () => {
    render(
      <VenueFields
        value={emptyVenueDetails()}
        onChange={vi.fn()}
        reusableVenues={buildReusableVenues([
          { venue: 'Central Court', venueAddress: { city: 'London' } },
        ])}
      />
    );

    expect(screen.getByRole('option', { name: 'Central Court — London' })).toBeInTheDocument();
  });

  it('reports a typed venue name to the caller', async () => {
    const onChange = vi.fn();
    render(<VenueFields value={emptyVenueDetails()} onChange={onChange} />);

    await userEvent.type(screen.getByLabelText('Venue name'), 'A');

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ name: 'A' }));
  });

  it('reports a typed address part to the caller', async () => {
    const onChange = vi.fn();
    render(<VenueFields value={{ name: 'Court 1' }} onChange={onChange} />);

    await userEvent.type(screen.getByLabelText('City'), 'L');

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ address: expect.objectContaining({ city: 'L' }) })
    );
  });
});
