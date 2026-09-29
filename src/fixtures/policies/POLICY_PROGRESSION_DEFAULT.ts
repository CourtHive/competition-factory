import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';

export const POLICY_PROGRESSION_DEFAULT = {
  [POLICY_TYPE_PROGRESSION]: {
    // a double exit produces a BYE for the seat its loser would have taken: nobody will ever arrive there
    // when { doubleExitPropagateBye: false } the seat receives a produced WALKOVER / DEFAULTED instead
    // this is significant for providers who do not award ranking points for first round walkovers
    doubleExitPropagateBye: true,
    // when { autoPlaceQualifiers: true } qualifiers will be randomly assigned to qualifier positions (if present)
    autoPlaceQualifiers: false,
    // when { autoReplaceQualifiers: true } placed qualifiers will be replaced in target structures if winningSide is changed
    autoReplaceQualifiers: false,
    // when { autoRemoveQualifiers: true } placed qualifiers will be removed if winningSide is removed
    autoRemoveQualifiers: false,
  },
};

export default POLICY_PROGRESSION_DEFAULT;
