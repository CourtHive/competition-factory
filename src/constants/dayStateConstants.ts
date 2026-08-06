// A PERSON's self-declared state for a single calendar day (declarations tier):
// their willingness to be scheduled. `NOT_SET` is the implicit state of any day
// absent from the payload's `days` map.
//
// Named dayState, not availability, deliberately. In a scheduling library
// "availability" reads as COURT availability — which is `BLOCK_TYPES` in the
// AvailabilityEngine, a different vocabulary answering a different question.
// The two even share the literal 'AVAILABLE' while meaning unrelated things:
// here "this person said yes", there "no block covers this court time".
// Matches the `DAY_STATES` naming the declarations service uses independently.

export const AVAILABLE = 'AVAILABLE';
export const IF_NEEDED = 'IF_NEEDED';
export const UNAVAILABLE = 'UNAVAILABLE';
export const NOT_SET = 'NOT_SET';

export const dayStateConstants = {
  AVAILABLE,
  IF_NEEDED,
  UNAVAILABLE,
  NOT_SET,
};

/**
 * @deprecated Renamed to `dayStateConstants` — "availability" collides with court
 * availability (`BLOCK_TYPES`). Same object; kept so the rename is not a breaking
 * change. Slated for removal in the next major.
 */
export const availabilityConstants = dayStateConstants;

export default dayStateConstants;
