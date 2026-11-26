import { POLICY_TYPE_PROGRESSION } from '../constants';

/**
 * USTA progression policy: a double exit produces a WALKOVER / DEFAULTED, not a BYE, in the
 * connected structure where its loser would have appeared.
 *
 * USTA requires a double walkover to produce a walkover both in its own structure and in the
 * connected structure, because ranking points are awarded by `matchUpStatus` and a produced
 * walkover must not be read as a BYE. This is the behaviour of USTA Tournament Desk
 * (ustatournamentdesk.com, factory 2.2.32), confirmed with USTA 2026-10-22.
 *
 * The double exit's own structure produces an exit regardless of this policy. The policy decides only
 * the connected structure. Every other progression value is the factory default, stated here in full so that the
 * entry is complete without the engine's defaults.
 */
export const POLICY_PROGRESSION_USTA = {
  [POLICY_TYPE_PROGRESSION]: {
    doubleExitPropagateBye: false,
    autoPlaceQualifiers: false,
    autoReplaceQualifiers: false,
    autoRemoveQualifiers: false,
  },
};

export default POLICY_PROGRESSION_USTA;
