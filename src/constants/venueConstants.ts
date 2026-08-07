export const INDOOR = 'INDOOR';
export const OUTDOOR = 'OUTDOOR';
// Indoor/outdoor "mixed" — a venue/court attribute. Deliberately distinct from
// genderConstants.MIXED (same string, unrelated concept): keeping it here lets
// IndoorOutdoorUnion derive from a venue-owned vocab instead of borrowing the gender constant.
export const MIXED = 'MIXED';

// Canonical indoor/outdoor values. IndoorOutdoorUnion (the type) derives from this tuple so the
// accepted values and the type can never disagree, and attr-audit gains a value vocab to guard the
// indoorOutdoor literals against typos (mirrors tournamentStatuses / disciplines).
export const indoorOutdoorTypes = [INDOOR, OUTDOOR, MIXED] as const;

export const venueConstants = {
  INDOOR,
  OUTDOOR,
  MIXED,
} as const;

export default venueConstants;
