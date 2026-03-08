import { removeDirectedParticipants } from '@Mutate/matchUps/drawPositions/removeDirectedParticipants';
import { directParticipants } from '@Mutate/matchUps/drawPositions/directParticipants';
import { checkConnectedStructures } from './checkConnectedStructures';
import { decorateResult } from '@Functions/global/decorateResult';
import { attemptToModifyScore } from './attemptToModifyScore';
import { definedAttributes } from '@Tools/definedAttributes';
import { replaceQualifier } from './replaceQualifier';
import { placeQualifier } from './placeQualifier';

// Constants
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { SUCCESS } from '@Constants/resultConstants';

export function attemptToSetWinningSide(params) {
  const stack = 'attemptToSetWinningSide';
  let connectedStructures;
  const context = {};

  const { appliedPolicies, disableAutoCalc, drawDefinition, dualMatchUp, winningSide, structure, matchUp } = params;

  // disableAutoCalc means the score is being set manually
  if (dualMatchUp?._disableAutoCalc && disableAutoCalc !== false) {
    return attemptToModifyScore(params);
  }

  if (matchUp.winningSide && matchUp.winningSide !== winningSide) {
    // only applies when progression is based on WIN_RATIO, e.g. ROUND_ROBIN_WITH_PLAYOFF
    const { connectedStructureIds } = checkConnectedStructures({
      drawDefinition,
      structure,
      matchUp,
    });
    if (connectedStructureIds.length) {
      connectedStructures = true;
    }

    const result = removeDirectedParticipants(params);
    if (result.error) return result;
  }

  // Seems we need a while loop here to handle repeated propagation of exit statuses?
  const result = directParticipants(params);
  if (result.context?.progressExitStatus) Object.assign(context, result.context);
  if (result.error) return decorateResult({ result, stack });

  let qualifierReplaced, qualifierPlaced;
  if (params.qualifierChanging && appliedPolicies?.[POLICY_TYPE_PROGRESSION]?.autoReplaceQualifiers) {
    qualifierReplaced = replaceQualifier(params).qualifierReplaced;
  }

  if (params.qualifierAdvancing && appliedPolicies?.[POLICY_TYPE_PROGRESSION]?.autoPlaceQualifiers) {
    qualifierPlaced = placeQualifier(params).qualifierPlaced;
  }

  return decorateResult({
    result: definedAttributes({
      ...SUCCESS,
      ...result, // capture attributes from directParticipants
      connectedStructures,
      qualifierReplaced,
      qualifierPlaced,
      context,
    }),
    stack,
  });
}
