import { ABANDONED, CANCELLED, DEFAULTED, INCOMPLETE, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { FORMAT_STANDARD } from '../scoring/matchUpFormats';
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
