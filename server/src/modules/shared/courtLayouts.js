// A game's court layout is an immutable compatibility contract, not a display
// preference. Stored event x/y are percentages of the image the game was
// tracked on, so the layout decides how they are read back. Absence is the
// durable legacy discriminator: every game created before versioning has no
// courtLayoutId, and must keep resolving to the original court forever.
const LEGACY_COURT_LAYOUT_ID = 'legacy-v1';
const CURRENT_COURT_LAYOUT_ID = 'court-v2';

const COURT_LAYOUT_IDS = [LEGACY_COURT_LAYOUT_ID, CURRENT_COURT_LAYOUT_ID];

// Deliberately not a Mongoose schema default: a document default would make a
// hydrated legacy document indistinguishable from a genuinely stamped new one.
function resolveCourtLayoutId(value) {
  return COURT_LAYOUT_IDS.includes(value) ? value : LEGACY_COURT_LAYOUT_ID;
}

module.exports = {
  LEGACY_COURT_LAYOUT_ID,
  CURRENT_COURT_LAYOUT_ID,
  COURT_LAYOUT_IDS,
  resolveCourtLayoutId,
};
