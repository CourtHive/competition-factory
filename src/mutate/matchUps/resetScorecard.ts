import { updateTieMatchUpScore } from '@Mutate/matchUps/score/updateTieMatchUpScore';
import { compareTieFormats } from '@Query/hierarchical/tieFormats/compareTieFormats';
import { resolveTieFormat } from '@Query/hierarchical/tieFormats/resolveTieFormat';
import { isActiveDownstream } from '@Query/drawDefinition/isActiveDownstream';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { setMatchUpState } from './matchUpStatus/setMatchUpState';
import { decorateResult } from '@Functions/global/decorateResult';
import { resetTieFormat } from '@Mutate/tieFormat/resetTieFormat';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { findStructure } from '@Acquire/findStructure';
import { isString } from '@Tools/objects';

// constants and types
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { TEAM_EVENT } from '@Constants/eventConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';
import {
  MATCHUP_NOT_FOUND,
  MISSING_DRAW_DEFINITION,
  INVALID_VALUES,
  CANNOT_CHANGE_WINNING_SIDE,
  MISSING_MATCHUP_ID,
  INVALID_MATCHUP,
} from '@Constants/errorConditionConstants';

type ResetScoreCardArgs = {
  tournamentRecord: Tournament;
  drawDefinition: DrawDefinition;
  tiebreakReset?: boolean;
  matchUpStatus?: string;
  matchUpId: string;
  event?: Event;
};

export function resetScorecard(params: ResetScoreCardArgs): ResultType {
  const { tournamentRecord, drawDefinition, matchUpId, event } = params;
  const stack = 'resetScorecard';

  // Check for missing parameters ---------------------------------------------
  if (!drawDefinition)
    return decorateResult({
      result: { error: MISSING_DRAW_DEFINITION },
      stack,
    });
  if (!matchUpId) return decorateResult({ result: { error: MISSING_MATCHUP_ID }, stack });
  if (!isString(matchUpId))
    return decorateResult({
      result: { error: INVALID_VALUES, matchUpId },
      stack,
    });

  // Get map of all drawMatchUps and inContextDrawMatchUPs ---------------------
  const matchUpsMap = getMatchUpsMap({ drawDefinition });
  const { matchUps: inContextDrawMatchUps } = getAllDrawMatchUps({
    nextMatchUps: true,
    inContext: true,
    drawDefinition,
    matchUpsMap,
  });

  // Find target matchUp ------------------------------------------------------
  const matchUp = matchUpsMap.drawMatchUps.find((matchUp) => matchUp.matchUpId === matchUpId);

  const inContextMatchUp = inContextDrawMatchUps?.find((matchUp) => matchUp.matchUpId === matchUpId);

  if (!matchUp || !inContextDrawMatchUps) return { error: MATCHUP_NOT_FOUND };

  // only accept matchUpType: TEAM
  if (matchUp.matchUpType !== TEAM_EVENT) return { error: INVALID_MATCHUP };

  // Get winner/loser position targets ----------------------------------------
  const targetData = positionTargets({
    inContextDrawMatchUps,
    drawDefinition,
    matchUpId,
  });

  const structureId = inContextMatchUp?.structureId;
  const { structure } = findStructure({ drawDefinition, structureId });

  Object.assign(params, {
    inContextDrawMatchUps,
    inContextMatchUp,
    matchUpsMap,
    targetData,
    structure,
    matchUp,
  });

  // with propagating winningSide changes, activeDownstream only applies to eventType: TEAM
  const activeDownstream = isActiveDownstream(params);
  if (activeDownstream) return { error: CANNOT_CHANGE_WINNING_SIDE };

  if (matchUp.tieMatchUps?.length) {
    for (const tieMatchUp of matchUp.tieMatchUps) {
      const result = setMatchUpState({
        matchUpId: tieMatchUp.matchUpId,
        matchUpTieId: matchUpId,
        winningSide: undefined,
        removeScore: true,
        tournamentRecord,
        drawDefinition,
        event,
      });
      if (result.error) return decorateResult({ result, stack });
    }
  }

  const appliedPolicies = getAppliedPolicies({
    tournamentRecord,
    drawDefinition,
    event,
  })?.appliedPolicies;

  const result = updateTieMatchUpScore({
    event: params.event,
    removeScore: true,
    tournamentRecord,
    appliedPolicies,
    drawDefinition,
    matchUpsMap,
    matchUpId,
  });
  if (result.error) return decorateResult({ result, stack });

  if (params.tiebreakReset && !result.tieFormatRemoved) {
    // check for scenarios where an added "Tiebreaker" collectionDefinition/matchUp has been added
    const inheritedTieFormat = resolveTieFormat({
      drawDefinition,
      structure,
      event,
    })?.tieFormat;

    if (matchUp.tieFormat && inheritedTieFormat) {
      const { matchUpCountDifference, descendantDifferences, ancestorDifferences, valueDifference } = compareTieFormats(
        {
          descendant: matchUp.tieFormat,
          ancestor: inheritedTieFormat,
        },
      );

      if (
        descendantDifferences.collectionIds.length === 1 &&
        !ancestorDifferences.collectionIds.length &&
        !ancestorDifferences.groupsCount &&
        matchUpCountDifference === 1 &&
        valueDifference === 1
      ) {
        const result = resetTieFormat({
          tournamentRecord,
          drawDefinition,
          matchUpId,
          event,
        });
        if (result.error) return result;
      }
    }
  }

  return { ...SUCCESS };
}
