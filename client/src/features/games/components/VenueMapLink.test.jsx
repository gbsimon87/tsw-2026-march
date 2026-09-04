import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { formatVenueAddress, VenueMapLink } from './VenueMapLink';

describe('formatVenueAddress', () => {
  it('joins the address parts in postal order', () => {
    expect(
      formatVenueAddress({
        addressLine1: '12 Baker Street',
        addressLine2: 'Unit 4',
        city: 'London',
        state: 'Greater London',
        postalCode: 'NW1 6XE',
        country: 'United Kingdom',
      })
    ).toBe('12 Baker Street, Unit 4, London, Greater London, NW1 6XE, United Kingdom');
  });

  it('skips missing and empty parts', () => {
    expect(formatVenueAddress({ addressLine1: '12 Baker Street', city: '', country: 'UK' })).toBe(
      '12 Baker Street, UK'
    );
  });

  it('returns an empty string for no address', () => {
    expect(formatVenueAddress(null)).toBe('');
    expect(formatVenueAddress(undefined)).toBe('');
    expect(formatVenueAddress({})).toBe('');
  });
});

describe('VenueMapLink', () => {
  it('links to a maps search combining venue name and address', () => {
    render(<VenueMapLink venue="Central Court" venueAddress={{ city: 'London' }} />);

    expect(screen.getByRole('link', { name: 'View map' })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/search/?api=1&query=Central%20Court%2C%20London'
    );
  });

  it('renders from a venue name alone', () => {
    render(<VenueMapLink venue="Riverside Gym" />);

    expect(screen.getByRole('link', { name: 'View map' })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/search/?api=1&query=Riverside%20Gym'
    );
  });

  it('renders from an address alone', () => {
    render(<VenueMapLink venueAddress={{ city: 'Leeds', country: 'UK' }} />);

    expect(screen.getByRole('link', { name: 'View map' })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/search/?api=1&query=Leeds%2C%20UK'
    );
  });

  it('opens in a new tab without leaking the referrer', () => {
    render(<VenueMapLink venue="Central Court" />);
    const link = screen.getByRole('link', { name: 'View map' });

    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });

  it('renders nothing when there is no venue or address', () => {
    const { container } = render(<VenueMapLink venueAddress={{}} />);

    expect(container).toBeEmptyDOMElement();
  });
});
