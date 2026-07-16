// Player-declared per-day availability states (declarations tier).
// Distinct from the court/date `AvailabilityEngine` — these describe a
// person's self-declared willingness to be scheduled on a given calendar day.
// `NOT_SET` is the implicit state of any day absent from the payload's `days` map.

export const AVAILABLE = 'AVAILABLE';
export const IF_NEEDED = 'IF_NEEDED';
export const UNAVAILABLE = 'UNAVAILABLE';
export const NOT_SET = 'NOT_SET';

export const availabilityConstants = {
  AVAILABLE,
  IF_NEEDED,
  UNAVAILABLE,
  NOT_SET,
};

export default availabilityConstants;
