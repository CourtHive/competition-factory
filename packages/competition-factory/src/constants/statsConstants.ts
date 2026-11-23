export const WALKOVER = 'WALKOVER';
export const RETIRED = 'RETIRED';
export const COMPETITIVE = 'COMPETITIVE';
export const ROUTINE = 'ROUTINE';
export const DECISIVE = 'DECISIVE';
export const WIN_RATIO = 'winRatio';

// Default keys for the SIGNED EXPOSURE axis — `deltaBands` on
// POLICY_TYPE_COMPETITIVE_BANDS. Orthogonal to the three keys above, which
// band REALIZED competitiveness (unsigned score spread, 0-100). Exposure bands
// a signed rating delta, oriented so that positive means "tougher opponent":
// ANCHOR is playing well down, STRETCH is playing well up.
//
// These name the DEFAULT band set only. Nothing in `resolveDeltaBand` knows
// them — band count and names come entirely from policy. Plain consts rather
// than an enum, matching the keys above, which carry no enum-guard obligation
// (statsConstants has zero references in enumConstConformance.test.ts) and
// because a policy's `key` types as `string` so a federation can ship its own
// vocabulary.
export const ANCHOR = 'ANCHOR';
export const DOWN = 'DOWN';
export const EVEN = 'EVEN';
export const UP = 'UP';
export const STRETCH = 'STRETCH';
