export function formatVenueAddress(venueAddress) {
  if (!venueAddress) return '';
  return [
    venueAddress.addressLine1,
    venueAddress.addressLine2,
    venueAddress.city,
    venueAddress.state,
    venueAddress.postalCode,
    venueAddress.country,
  ]
    .filter(Boolean)
    .join(', ');
}

export function VenueMapLink({ venue, venueAddress, className = '' }) {
  const address = formatVenueAddress(venueAddress);
  const query = [venue, address].filter(Boolean).join(', ');
  if (!query) return null;

  return (
    <a
      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`}
      target="_blank"
      rel="noreferrer"
      className={`font-semibold text-[#1B4332] underline decoration-[#F4A300] underline-offset-4 ${className}`}
    >
      View map
    </a>
  );
}
