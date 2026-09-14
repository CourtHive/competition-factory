import { ABANDONED, CANCELLED, DEFAULTED, INCOMPLETE, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { MAIN } from '@Constants/drawDefinitionConstants';

export const POLICY_SCORING_DEFAULT = {
  [POLICY_TYPE_SCORING]: {
    processCodes: { incompleteAssignmentsOnDefault: ['RANKING.IGNORE'] },
    defaultMatchUpFormat: FORMAT_STANDARD,
    allowDeletionWithScoresPresent: {
      drawDefinitions: false,
      structures: false,
    },
    /**
     * requireParticipantsForScoring is used to specify that both participants must be present before a matchUp can be scored
     */
    requireParticipantsForScoring: false,
    /**
     * without a SCORING_POLICY which sets { requireAllPositionsAssigned: false },  all stage:MAIN, stageSequence:1 drawPositions must be assigned **BEFORE** scoring is enabled,
     * scoring is enabled in consolation and compass/playoff structures when not all drawPositions have been filled
     */
    requireAllPositionsAssigned: undefined, // default is true; NOT required when value is false
    allowChangePropagation: false, // changes to winningSide will propagate to all "downstream" matchUps in the structure
    propagateExitStatus: false, // exit statuses (WALKOVER/DEFAULTED) do NOT propagate into the consolation unless params override
    /**
     * Whether a RETIREMENT propagates downstream like any other exit, when `propagateExitStatus` is on.
     *
     * This is a RULES question, not an engineering one, which is why it is a policy rather than a
     * constant. A retirement is a completed match: both participants took the court and there is a
     * score. Whether the retiring player is then treated as unable to continue — so their consolation
     * match is a walkover for the opponent — or as an ordinary loser who may still play, differs by
     * governing body and by event.
     *
     * **A retiree is out of a MATCH, not out of the EVENT, unless the governing policy says so** —
     * CA's ruling, 2026-09-13. So the default is `false`: the retiring player is directed to the
     * linked structure as an ordinary loser and their matchUp there is left `TO_BE_PLAYED`. A
     * governing body whose rules end a retiree's participation sets this `true`, and their
     * opponent in the connected structure then receives a walkover.
     *
     * This DOES change behaviour for a caller who passes `propagateExitStatus: true` while using the
     * default policy — previously a retirement carried onward there. That is the point of the
     * ruling, and the one place the engine was deciding a rules question on a federation's behalf.
     * `POLICY_SCORING_USTA` sets it `true` explicitly so its observable behaviour is unchanged.
     *
     * It has no effect when `propagateExitStatus` is off, which is the factory default — so a
     * provider that has never enabled exit propagation is unaffected either way.
     */
    propagateRetirementAsExit: false,
    stage: {
      [MAIN]: {
        stageSequence: {
          1: {
            requireAllPositionsAssigned: true,
          },
        },
      },
    },
    /**
     * matchUpFormats are used to define and potentially limit the formats available for scoring matchUps
     */
    matchUpFormats: [],
    /**
     * matchUpStatusCodes are used to refiine the interpretation of matchUpStatus
     */
    matchUpStatusCodes: {
      [ABANDONED]: [],
      [CANCELLED]: [],
      [DEFAULTED]: [],
      [INCOMPLETE]: [],
      [RETIRED]: [],
      [WALKOVER]: [],
    },
  },
};

export default POLICY_SCORING_DEFAULT;
