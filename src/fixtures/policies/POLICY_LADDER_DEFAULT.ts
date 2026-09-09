/**
 * Default ladder policy — the shape a club ladder takes when nobody has said otherwise.
 *
 * `SWAP` over `INSERTION` and a range of 3 are the most common club settings, not a factory opinion:
 * they are chosen to be unsurprising, and every one of them is expected to be overridden.
 *
 * `ordering: RANK` is the traditional ladder and the only one the movement machinery serves. A
 * policy setting `RATING` is legal to express today and its behaviour is not yet built — see
 * `getLadderOrdering`.
 */
import { POLICY_TYPE_LADDER } from '@Constants/policyConstants';
import { RANK, SWAP } from '@Constants/ladderConstants';

export const POLICY_LADDER_DEFAULT = {
  [POLICY_TYPE_LADDER]: {
    policyName: 'Default Ladder',
    policyVersion: '1.0',

    ordering: RANK,
    movement: SWAP,
    challengeRange: 3,
  },
};

export default POLICY_LADDER_DEFAULT;
