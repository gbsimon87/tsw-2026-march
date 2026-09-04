import legacyCourtImage from '../../../assets/courts/basketball_court_1.png';
import courtV2Image from '../../../assets/courts/basketball_court_2.png';
import { COURT_V2_CALIBRATION, DEFAULT_COURT_IMAGE_CALIBRATION } from './courtImageCalibration';

export const LEGACY_COURT_LAYOUT_ID = 'legacy-v1';
export const CURRENT_COURT_LAYOUT_ID = 'court-v2';

// A layout is a single unit: image, intrinsic size, and the calibration that
// interprets clicks on it. Never pair these from separate sources - a correct
// image with the wrong calibration silently misclassifies every shot.
export const COURT_LAYOUTS = {
  [LEGACY_COURT_LAYOUT_ID]: {
    id: LEGACY_COURT_LAYOUT_ID,
    image: legacyCourtImage,
    // basketball_court_1.png is intrinsically 442x829, but the tracker has
    // always rendered it at a forced 420x760. Existing markers are percentages
    // of that rendered box, so correcting the ratio here would move them.
    width: 420,
    height: 760,
    calibration: DEFAULT_COURT_IMAGE_CALIBRATION,
  },
  [CURRENT_COURT_LAYOUT_ID]: {
    id: CURRENT_COURT_LAYOUT_ID,
    image: courtV2Image,
    width: 410,
    height: 854,
    calibration: COURT_V2_CALIBRATION,
  },
};

export function resolveCourtLayout(id) {
  // hasOwnProperty, not a plain lookup: `COURT_LAYOUTS['constructor']` would
  // otherwise return an inherited value and fail OPEN, handing the caller an
  // object with no image or dimensions instead of the legacy fallback.
  return isKnownCourtLayoutId(id) ? COURT_LAYOUTS[id] : COURT_LAYOUTS[LEGACY_COURT_LAYOUT_ID];
}

export function isKnownCourtLayoutId(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(COURT_LAYOUTS, id);
}
