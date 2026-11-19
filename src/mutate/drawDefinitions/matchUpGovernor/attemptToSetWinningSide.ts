import { removeDirectedParticipants } from '@Mutate/matchUps/drawPositions/removeDirectedParticipants';
import { refreshArrivalsFrom } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { directParticipants } from '@Mutate/matchUps/drawPositions/directParticipants';
import { checkConnectedStructures } from './checkConnectedStructures';
import { decorateResult } from '@Functions/global/decorateResult';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { attemptToModifyScore } from './attemptToModifyScore';
import { definedAttributes } from '@Tools/definedAttributes';
import { replaceQualifier } from './replaceQualifier';
import { placeQualifier } from './placeQualifier';

// constants
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { SUCCESS } from '@Constants/resultConstants';

// types
import type { DrawDefinition, Event, MatchUp, Tournament } from '@Types/tournamentTypes';
import type { MatchUpsMap } from '@Types/factoryTypes';

export function attemptToSetWinningSide(params) {
  const stack = 'attemptToSetWinningSide';
  let connectedStructures;
  const context = {};

  const { appliedPolicies, disableAutoCalc, drawDefinition, dualMatchUp, winningSide, structure, matchUp } = params;

  // disableAutoCalc means the score is being set manually; read first-class (NATIVE) with
  // fallback to the legacy `_disableAutoCalc` hydrated alias (LEGACY writeMode)
  if ((dualMatchUp?.disableAutoCalc ?? dualMatchUp?._disableAutoCalc) && disableAutoCalc !== false) {
    return attemptToModifyScore(params);
  }

  const corrected = !!matchUp.winningSide && matchUp.winningSide !== winningSide;
  // A FRESH LINE THAT HANDS A DECIDED DUAL TO THE OTHER SIDE (a dual decided by its own call, against its lines): what
  // the dual directed is taken back first, as for a corrected line. Directed without that, the new winner met the old
  // one in the next dual and the call returned `EXISTING_POSITION_ASSIGNMENT` after writing the line and the dual
  // (measured 2026-11-18, TEAM SINGLE_ELIMINATION 4: the final full, the dual left won by a team not in it).
  const handsOver =
    !!params.isCollectionMatchUp &&
    !!dualMatchUp?.winningSide &&
    !!params.projectedWinningSide &&
    params.projectedWinningSide !== dualMatchUp.winningSide;
  if (corrected || handsOver) {
    // only applies when progression is based on WIN_RATIO, e.g. ROUND_ROBIN_WITH_PLAYOFF
    const { connectedStructureIds } = checkConnectedStructures({
      drawDefinition,
      structure,
      matchUp,
    });
    if (connectedStructureIds.length) {
      connectedStructures = true;
    }

    // the line keeps its place in its collection's finishing order: the result written next decides it
    const result = removeDirectedParticipants({ ...params, keepsFinishingOrder: true });
    if (result.error) return result;
  }

  // Seems we need a while loop here to handle repeated propagation of exit statuses?
  const result = directParticipants(
    redirectsUndecidedDual(params) ? { ...params, dualWinningSideChange: true } : params,
  );
  if (result.context?.progressExitStatus) Object.assign(context, result.context);
  if (result.error) return decorateResult({ result, stack });
  if (matchUp.winningSide === winningSide) refreshArrivals(params);

  let qualifierReplaced, qualifierPlaced;
  if (params.qualifierChanging && appliedPolicies?.[POLICY_TYPE_PROGRESSION]?.autoReplaceQualifiers) {
    const replaced = replaceQualifier(params);
    if (replaced.error) return decorateResult({ result: replaced, stack });
    qualifierReplaced = replaced.qualifierReplaced;
  }

  if (params.qualifierAdvancing && appliedPolicies?.[POLICY_TYPE_PROGRESSION]?.autoPlaceQualifiers) {
    const placed = placeQualifier(params);
    if (placed.error) return decorateResult({ result: placed, stack });
    qualifierPlaced = placed.qualifierPlaced;
  }

  // shallow: the context holds the live matchUps map the exit propagation reads (see `decorateResult`)
  return decorateResult({
    result: definedAttributes(
      {
        ...SUCCESS,
        ...result, // capture attributes from directParticipants
        connectedStructures,
        qualifierReplaced,
        qualifierPlaced,
        context,
      },
      false,
      false,
      true,
    ),
    stack,
  });
}

/**
 * A LINE CORRECTED UNDER A DUAL ITS OTHER LINES DO NOT DECIDE. The correction first clears the line and tallies the dual
 * without it (`removeDirectedParticipants`); where that tally names no winner (a dual decided by its own call, its
 * lines level without this one) the dual is un-decided there and what it directed is taken back. The line's new winner
 * then projects the winner the dual held before, so `dualWinningSideChange`, read before the clear, says nothing
 * changed, and the dual was written decided again with nobody sent on: COMPLETED, its winner out of the next dual and
 * its loser out of the dual its link feeds (measured 2026-11-18, TEAM FIRST_MATCH_LOSER_CONSOLATION 8, DOMINANT_DUO).
 * The dual as it now stands is asked: holding no winner while the lines project one, it is directed.
 */
function redirectsUndecidedDual(params: {
  isCollectionMatchUp?: boolean;
  dualWinningSideChange?: boolean;
  projectedWinningSide?: number;
  matchUpsMap?: MatchUpsMap;
  matchUpTieId?: string;
}): boolean {
  const { matchUpTieId, matchUpsMap, projectedWinningSide, dualWinningSideChange } = params;
  if (!params.isCollectionMatchUp || dualWinningSideChange || !projectedWinningSide) return false;
  const dual = matchUpsMap?.drawMatchUps?.find((candidate) => candidate.matchUpId === matchUpTieId);
  return !!dual && !dual.winningSide;
}

// the same winner, re-directed into the seat they hold: the arrival they left onward follows the new result
export function refreshArrivals({
  tournamentRecord,
  drawDefinition,
  matchUpsMap,
  matchUp,
  event,
}: {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  matchUpsMap?: MatchUpsMap;
  matchUp: MatchUp;
  event?: Event;
}): void {
  const matchUps = (matchUpsMap ?? getMatchUpsMap({ drawDefinition }))?.drawMatchUps;
  const stored = matchUps?.find((m) => m.matchUpId === matchUp.matchUpId);
  const refreshed = refreshArrivalsFrom({
    matchUpId: matchUp.matchUpId,
    matchUpStatus: stored?.matchUpStatus,
    matchUps,
  });
  // rewritten in place, so nothing else announces them
  for (const arrival of refreshed)
    modifyMatchUpNotice({
      tournamentId: tournamentRecord?.tournamentId,
      context: 'refreshArrivals',
      eventId: event?.eventId,
      matchUp: arrival,
      drawDefinition,
      event,
    });
}
