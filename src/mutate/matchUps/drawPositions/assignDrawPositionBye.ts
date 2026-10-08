import { addPositionActionTelemetry } from '@Mutate/drawDefinitions/positionGovernor/addPositionActionTelemetry';
import { rekeySideFacts, setMatchUpDrawPositions } from '@Mutate/matchUps/drawPositions/setMatchUpDrawPositions';
import { modifyMatchUpNotice, modifyPositionAssignmentsNotice } from '@Mutate/notifications/drawNotifications';
import { matchUpHoldsScheduling, releaseByeScheduling } from '@Mutate/matchUps/schedule/byeScheduling';
import { getDrawPositionSideNumber, getSideDrawPosition } from '@Query/matchUps/getDrawPositionSides';
import { getStructureDrawPositionProfiles } from '@Query/structure/getStructureDrawPositionProfiles';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { getInitialRoundNumber } from '@Query/matchUps/getInitialRoundNumber';
import { isLuckyBasedDraw } from '@Query/drawDefinition/isLuckyBasedDraw';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { getRoundMatchUps } from '@Query/matchUps/getRoundMatchUps';
import { decorateResult } from '@Functions/global/decorateResult';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { normalizeDrawPositions } from './normalizeDrawPositions';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { pushGlobalLog } from '@Functions/global/globalLog';
import { drawPositionFilled } from './drawPositionFilled';
import { ensureGoesTo } from '@Query/matchUps/addGoesTo';
import { findStructure } from '@Acquire/findStructure';
import { matchUpsOf } from '@Acquire/structureMembers';
import { numericSort } from '@Tools/sorting';
import { isExit } from '@Validators/isExit';
import {
  deriveExitStateFromProvenance,
  buildCarriedExitProvenance,
  mergeSideExitProvenance,
  getSideExitProvenance,
  carriedExitStatus,
  retainPolicyCodes,
  policyCodeString,
} from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';

// constants and types
import { DrawDefinition, Event, MatchUp, Structure, Tournament } from '@Types/tournamentTypes';
import { BYE, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { CONTAINER } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { MatchUpsMap } from '@Types/factoryTypes';
import { HydratedMatchUp } from '@Types/hydrated';
import {
  DRAW_POSITION_ACTIVE,
  DRAW_POSITION_ASSIGNED,
  LUCKY_DRAW_BYE_LIMIT,
  MATCHUP_HAS_SCHEDULING,
  MISSING_DRAW_DEFINITION,
  MISSING_DRAW_POSITION,
  STRUCTURE_NOT_FOUND,
} from '@Constants/errorConditionConstants';

/*
  assignDrawPositionBye

  supporting functions:
  - drawPositionFilled
  - setMatchUpStatusBYE
  - assignRoundRobinBYE
  - advanceDrawPosition

  PSEUDOCODE:
  *. Requires allDrawMatchUps inContext
  *. Requires structureMatchUps

  => assignDrawPositionBye
  1. Modifies structure positionAssignments to assign BYE to position
    - if structure is part of ROUND ROBIN then return { ...SUCCESS }
  2. Finds the furthest advancement of the drawPosition to determine the matchUp where BYE-advancement needs to occur
  3. Set the matchUpStatus to BYE
  4. Check whether there is a position to Advance

  If so...
  => advancePosition
  5a. Use links to find winnerMatchUp and loserMatchUp

  6. If winnerMatchUp is part of same structure...
  6a. Add drawPosition to target matchUp 
  6b. Check for further advancement and if so, go back to step #5
  6b. If no further positions to advance check for FMLC Consolation BYE assignment

  7. If loserMatchUp is part of different structure... return to step #1
 */

type AssignDrawPositionByeArgs = {
  /**
   * Set by a propagation cascade that KNOWS it is placing this BYE.
   *
   * Passed rather than re-derived. The local `hasPropagatedStatus` below tests upstream matchUps
   * with `isExit`, which excludes DOUBLE_WALKOVER and DOUBLE_DEFAULT — so it is false in exactly
   * the double-exit case that most needs the marker. Measured: every BYE placed by a COMPASS
   * double-walkover cascade arrived with `hasPropagatedStatus === false`.
   *
   * A boolean rather than a source id, because the id is not reliably in scope at the cascade's
   * call site and the FACT is what removal needs. The id is recorded when available.
   */
  byeFromPropagation?: boolean;
  provisionalPositioning?: boolean;
  preserveScheduling?: boolean;
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  isPositionAction?: boolean;
  matchUpsMap?: MatchUpsMap;
  structure?: Structure;
  drawPosition: number;
  structureId?: string;
  loserMatchUp?: MatchUp;
  event?: Event;
};

export function assignDrawPositionBye({
  byeFromPropagation,
  provisionalPositioning,
  preserveScheduling,
  isPositionAction,
  tournamentRecord,
  drawDefinition,
  drawPosition,
  loserMatchUp,
  matchUpsMap,
  structureId,
  structure,
  event,
}: AssignDrawPositionByeArgs) {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  if (!structure) ({ structure } = findStructure({ drawDefinition, structureId }));

  if (!structure) return { error: STRUCTURE_NOT_FOUND };
  if (!structureId) ({ structureId } = structure);

  const stack = 'assignDrawPositionBye';
  pushGlobalLog({ method: stack, color: 'cyan', drawPosition });

  matchUpsMap ??= getMatchUpsMap({ drawDefinition });
  const { positionAssignments } = getPositionAssignments({ structure });

  const currentAssignment = positionAssignments?.find((assignment) => assignment.drawPosition === drawPosition);

  if (currentAssignment?.bye) {
    return { ...SUCCESS };
  }

  // Lucky draw: at most one BYE allowed in the first round
  if (isLuckyBasedDraw(drawDefinition.drawType)) {
    const existingByes = positionAssignments?.filter((a) => a.bye && a.drawPosition !== drawPosition);
    if (existingByes?.length) {
      return decorateResult({ result: { error: LUCKY_DRAW_BYE_LIMIT }, stack });
    }
  }

  //
  const hasPropagatedStatus = !!(
    loserMatchUp &&
    matchUpsMap.drawMatchUps.some((m) => m.loserMatchUpId === loserMatchUp?.matchUpId && isExit(m.matchUpStatus))
  );

  // "Is this BYE propagation-produced?" — resolved ONCE.
  //
  // Four places in this function need the answer: the two error guards below, the participant clear,
  // and the `byeFromPropagation` marker. Three of them read `hasPropagatedStatus` and one read the
  // declaration, so the function could refuse a placement and then, had it not refused, have marked
  // that same placement as propagation-produced.
  //
  // `byeFromPropagation` is the caller's DECLARATION: `advanceByeToLoserMatchUp` sets it precisely
  // because, in its words, the cascade "is placing the BYE, so it says so rather than leaving
  // assignDrawPositionBye to infer it from upstream statuses it cannot classify".
  // `hasPropagatedStatus` is that inference — it scans for an upstream matchUp whose
  // `loserMatchUpId` points here and whose status `isExit`, and `isExit` EXCLUDES DOUBLE_WALKOVER
  // and DOUBLE_DEFAULT, so it is false in exactly the double-exit case these BYEs come from. The
  // type doc on `byeFromPropagation` already recorded the measurement: every BYE placed by a COMPASS
  // double-walkover cascade arrived with `hasPropagatedStatus === false`.
  //
  // So a cascade that had DECLARED itself was refused by a topology scan that could not see it — and
  // refused AFTER the cascade had already written. Over two independent 600-seed frozen census
  // windows that was the largest remaining defect class in this programme: 50 failing seeds to 32,
  // 18 closed and 0 opened.
  //
  // `??` and not `||`: `byeFromPropagation: false` is a caller saying "this is NOT propagation",
  // which must not fall through to the inference.
  const isPropagationPlacement = byeFromPropagation ?? hasPropagatedStatus;

  // ################### Check error conditions ######################
  // Whether the position is ACTIVE is asked only of a placement that could be refused for it. A
  // propagation placement is never refused on those grounds, and the answer costs two hydrations of
  // the draw (`getStructureDrawPositionProfiles`, and the `addGoesTo` inside its dependency map) —
  // which this took on every BYE the cascade placed and then did not read. Measured 2026-10-01
  // (`pipelineCost.test.ts`): 462 hydrations and 6,666 `positionTargets` calls over 2,026
  // `setMatchUpStatus` calls, none of them consulted. Nothing between the top of this function and
  // this line changes the draw, so a placement that IS asked gets the answer it got before.
  //
  // ONE THING THAT CALL DID WAS LOAD-BEARING, and it is kept — by name now rather than by accident.
  // Its `addGoesTo` wrote `winnerMatchUpId` / `loserMatchUpId` onto the stored matchUps, so a draw
  // STORED WITHOUT them had them from the first BYE a cascade placed, and the rest of the cascade
  // reads them. Skipping the call outright took that away: a hundred matrix cells played on draws
  // with the ids stripped ended in a different draw 14 times before, and 44 times after. A draw that
  // stores its edges (`hasStoredGoesTo`, a walk of the stored matchUps) needs nothing; one that does
  // not is given them here, as it was.
  const goesTo = goesToForPropagation({ isPropagationPlacement, drawDefinition });
  if (goesTo?.error) return decorateResult({ result: goesTo, stack });

  const drawPositionIsActive =
    !isPropagationPlacement &&
    getStructureDrawPositionProfiles({ drawDefinition, structureId }).activeDrawPositions?.includes(drawPosition);
  if (drawPositionIsActive) {
    return { error: DRAW_POSITION_ACTIVE };
  }

  let positionAssignment = positionAssignments?.find((assignment) => assignment.drawPosition === drawPosition);
  if (!positionAssignment) {
    // Position exists in matchUps but has no positionAssignment entry — add one
    positionAssignment = { drawPosition };
    positionAssignments?.push(positionAssignment);
  }

  const { filled, containsBye, containsParticipant: assignedParticipantId } = drawPositionFilled(positionAssignment);
  if (containsBye) return { ...SUCCESS }; // nothing to be done

  if (filled && !containsBye && !isPropagationPlacement) {
    return decorateResult({ result: { error: DRAW_POSITION_ASSIGNED }, stack });
  }

  const appliedPolicies =
    getAppliedPolicies({
      tournamentRecord,
      drawDefinition,
      event,
    }).appliedPolicies ?? {};

  // ########## gather reusable data for performance optimization ###########
  const inContextDrawMatchUps =
    getAllDrawMatchUps({
      inContext: true,
      drawDefinition,
      matchUpsMap,
    }).matchUps ?? [];

  const matchUpFilters = { isCollectionMatchUp: false };
  const { matchUps } = getAllStructureMatchUps({
    provisionalPositioning,
    drawDefinition,
    matchUpFilters,
    matchUpsMap,
    structure,
  });

  // ############ Scheduling is the operator's, not ours ############
  // A director may schedule a whole event and then swap participants around,
  // placing byes temporarily or permanently. Silently wiping the surrounding plan
  // to keep a conflict detector quiet destroys careful work — so a BYE KEEPS its
  // placement unless the caller says otherwise, and a court-holding BYE is
  // rendered in the grid and flagged CONFLICT_BYE_SCHEDULED (WARNING) instead.
  //
  // When the caller is an operator position-action and the target already holds
  // scheduling, the intent is genuinely ambiguous — keep the slot mid-swap, or give
  // it back? Refuse rather than guess; TMX catches this and asks. The gate is scoped
  // to `isPositionAction` on purpose: 10 of this function's 14 call sites are
  // engine-internal (directLoser during SCORE ENTRY, doubleExitAdvancement,
  // positionSwap, draw generation, this function's own recursion) and must never
  // start hard-failing on a scheduled draw. They take the non-destructive default.
  const byeTargets = byeTargetMatchUps({ structure, matchUps, drawPosition });
  if (
    isPositionAction &&
    preserveScheduling === undefined &&
    byeTargets.some((m) => matchUpHoldsScheduling({ matchUp: m }))
  ) {
    return decorateResult({
      info: 'assigning a BYE to a scheduled matchUp requires preserveScheduling: true | false',
      result: { error: MATCHUP_HAS_SCHEDULING },
      stack,
    });
  }

  // modifies the structure's positionAssignments
  // applies to both ELIMINATION and ROUND_ROBIN structures
  positionAssignments?.forEach((assignment) => {
    if (assignment.drawPosition === drawPosition) {
      assignment.bye = true;
      // Clear the participant that was here because of a propagated exit.
      //
      // This is the SAME question as the guards above — "is this BYE propagation-produced?" — and it
      // read the topology inference alone for the same reason they did. Leaving it that way while
      // the guards began honouring the declaration produced `BYE_POSITION_WITH_PARTICIPANT` on 6
      // seeds of one census window and 4 of another: the cascade now placed its BYE, and the
      // participant it displaced stayed assigned to the position. A drawPosition that is both a BYE
      // and assigned to somebody is worse than the refusal it replaced, because nothing reports it.
      if (isPropagationPlacement) {
        assignment.participantId = undefined;
      }

      // Record WHO placed this BYE.
      //
      // Removal previously had to infer this from topology — `removeDoubleExit` asked whether the
      // matchUp was a BYE sitting on a feed round or in round 1 and concluded it must have placed
      // it. That is a structural proxy of exactly the kind that produced #4778, and it cannot tell
      // a BYE the cascade created from one that was already there, so unwinding over-cleared.
      //
      // The marker is authoritative when present. It is deliberately NOT written for a BYE that
      // arrives any other way, so its absence continues to mean "unknown" for draws stored before
      // this existed.
      if (isPropagationPlacement) {
        // the marker records the FACT and nothing else: a stored matchUpId would be a reference
        // that can dangle when the source is removed, and nothing consumes it.
        assignment.byeFromPropagation = true;
      } else {
        // A BYE placed by any other route must not inherit a stale marker from a previous
        // propagated BYE that occupied this drawPosition.
        delete assignment.byeFromPropagation;
      }
    }
  });

  if (structure.structureType === CONTAINER) {
    assignRoundRobinBYE({
      preserveScheduling,
      tournamentRecord,
      drawDefinition,
      drawPosition,
      matchUps,
    });

    modifyPositionAssignmentsNotice({
      tournamentId: tournamentRecord?.tournamentId,
      drawDefinition,
      structure,
      event,
    });

    return successNotice({
      assignedParticipantId,
      isPositionAction,
      appliedPolicies,
      drawDefinition,
      drawPosition,
      structureId,
      stack,
    });
  }

  // ############ Get furthest advancement of drawPosition ############
  const { roundProfile, roundMatchUps } = getRoundMatchUps({ matchUps });

  // search from final rounds towards first rounds to find furthest advancement
  const roundNumbers =
    roundProfile &&
    Object.keys(roundProfile)
      .map((roundNumber) => Number.parseInt(roundNumber))
      .reverse();
  const roundNumber = roundNumbers?.find((roundNumber) => {
    return roundProfile?.[roundNumber].drawPositions?.includes(drawPosition);
  });

  // matchUp where BYE-advancement needs to occur
  const matchUp = roundNumber
    ? roundMatchUps?.[roundNumber].find(({ drawPositions }) => drawPositions?.includes(drawPosition))
    : undefined;

  matchUp && setMatchUpStatusBYE({ preserveScheduling, tournamentRecord, drawDefinition, matchUp, event });

  correctResultsAwardedToTheBye({
    inContextDrawMatchUps,
    furthestMatchUpId: matchUp?.matchUpId,
    preserveScheduling,
    tournamentRecord,
    drawDefinition,
    drawPosition,
    matchUps,
    event,
  });

  const drawPositionToAdvance = matchUp?.drawPositions?.find((position) => position !== drawPosition);

  if (matchUp && drawPositionToAdvance) {
    const result = advanceDrawPosition({
      // the cascade continues through here, so the provenance travels with it — without this the
      // BYEs placed further down the chain arrive unmarked (measured: 4 of COMPASS's 8)
      byeFromPropagation,
      matchUpId: matchUp.matchUpId,
      inContextDrawMatchUps,
      drawPositionToAdvance,
      preserveScheduling,
      tournamentRecord,
      drawDefinition,
      matchUpsMap,
    });
    if (result.error) return result;
  } else if (
    matchUp &&
    roundNumber &&
    roundNumber > (getInitialRoundNumber({ drawPosition, matchUps }).initialRoundNumber ?? 0)
  ) {
    // THE SEAT IS ALREADY ADVANCED AND ALONE. It reached this matchUp over its opponent's draw BYE
    // before anything was played, and it is a BYE itself now, so this matchUp will never produce a
    // loser — the loser target is owed a BYE, exactly as when `advanceWinner` carries a BYE into a
    // partnerless matchUp. See `assignByeToLoserTarget`.
    const result = assignByeToLoserTarget({
      byeFromPropagation,
      inContextDrawMatchUps,
      preserveScheduling,
      tournamentRecord,
      drawDefinition,
      matchUpsMap,
      matchUp,
      event,
    });
    if (result?.error) return result;
  }

  modifyPositionAssignmentsNotice({
    tournamentId: tournamentRecord?.tournamentId,
    drawDefinition,
    structure,
    event,
  });

  return successNotice({
    assignedParticipantId,
    isPositionAction,
    appliedPolicies,
    drawDefinition,
    drawPosition,
    structureId,
    stack,
  });
}

/**
 * Every EARLIER matchUp in this drawPosition's chain that awarded its result to the position.
 *
 * The line above takes the FURTHEST advancement, which is right for where the BYE cascade
 * continues from — and blind to everything behind it. When the position being BYEd had already
 * advanced, every matchUp it advanced THROUGH keeps whatever result it held, and that result is
 * now recorded over a BYE. `getExitWinningSide` states the rule this breaks: *"A BYE draw position
 * can never be the winning side."*
 *
 * The shape that reaches here is a PENDING PROPAGATED EXIT. `progressExitStatus` RULE 2 awards a
 * carried walkover to the side WITHOUT the exit — the empty slot that will receive whoever falls
 * through — and that award is written before anyone arrives. When what arrives is a BYE, nobody
 * ever will, and the matchUp stands as the BYE having won by walkover. Measured over the two
 * 600-seed census windows: 47 seeds, split evenly across both propagation arms and 8 draw types,
 * reported by neither `getDrawInconsistencies` nor any status-only rule.
 *
 * RULE 1 already states the answer for the case where the BYE is there FIRST — *"opponent is a
 * BYE: the participant advances through it… so this matchUp stays a BYE"*. This applies the same
 * conclusion when the BYE arrives LAST, which is the only reason the two were ever treated
 * differently.
 *
 * SCOPED TO THE AWARDED SIDE, and that scope is the whole safety of it. A matchUp where the BYE is
 * the LOSING side is the ordinary, legitimate shape — a participant advancing past a BYE, or a
 * propagated exit against an emptied position — and is left exactly as it is.
 *
 * `sideExitProvenance` is untouched: it records WHICH upstream result produced the exit, keyed by
 * `sourceMatchUpId`, and that remains true whether or not a winner can be named. `withdrawProducedExits`
 * unwinds by that key, so correcting the original result still takes this back.
 */
/** the edges a propagation placement gives a draw stored without them (above); a malformed round link is returned */
function goesToForPropagation({
  isPropagationPlacement,
  drawDefinition,
}: {
  isPropagationPlacement?: boolean;
  drawDefinition: DrawDefinition;
}) {
  return isPropagationPlacement ? ensureGoesTo({ drawDefinition }) : undefined;
}

function correctResultsAwardedToTheBye({
  inContextDrawMatchUps,
  furthestMatchUpId,
  preserveScheduling,
  tournamentRecord,
  drawDefinition,
  drawPosition,
  matchUps,
  event,
}: {
  inContextDrawMatchUps: HydratedMatchUp[];
  preserveScheduling?: boolean;
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  furthestMatchUpId?: string;
  matchUps?: MatchUp[];
  drawPosition: number;
  event?: Event;
}): void {
  for (const chainMatchUp of matchUps ?? []) {
    if (chainMatchUp.matchUpId === furthestMatchUpId) continue;
    if (!chainMatchUp.winningSide || !chainMatchUp.drawPositions?.includes(drawPosition)) continue;
    const inContextChainMatchUp = inContextDrawMatchUps.find((m) => m.matchUpId === chainMatchUp.matchUpId);
    const sideNumber = inContextChainMatchUp?.sides?.find((side) => side.drawPosition === drawPosition)?.sideNumber;
    if (sideNumber !== chainMatchUp.winningSide) continue;
    setMatchUpStatusBYE({ preserveScheduling, tournamentRecord, drawDefinition, matchUp: chainMatchUp, event });
  }
}

/**
 * The matchUps this BYE assignment will set to `BYE` status directly.
 *
 * ROUND_ROBIN (CONTAINER): every matchUp in the group containing the drawPosition.
 * ELIMINATION: the single matchUp at the drawPosition's furthest advancement — the
 * same one the main body picks for BYE-advancement. Derived from `matchUp.drawPositions`
 * and so is safe to compute BEFORE positionAssignments are mutated, which is what lets
 * the ambiguity gate refuse without leaving a half-applied change behind.
 *
 * Does NOT include matchUps a BYE later cascades into; those take the caller's decision
 * (see advanceWinner) rather than re-opening the question mid-cascade.
 */
function byeTargetMatchUps({
  structure,
  matchUps,
  drawPosition,
}: {
  matchUps?: MatchUp[];
  structure: Structure;
  drawPosition: number;
}): MatchUp[] {
  const containing = (matchUps ?? []).filter((matchUp) => matchUp.drawPositions?.includes(drawPosition));
  if (structure.structureType === CONTAINER) return containing;

  const furthestRoundNumber = containing.reduce(
    (furthest: number | undefined, matchUp) =>
      matchUp.roundNumber && (!furthest || matchUp.roundNumber > furthest) ? matchUp.roundNumber : furthest,
    undefined,
  );
  const target = containing.find((matchUp) => matchUp.roundNumber === furthestRoundNumber);
  return target ? [target] : [];
}

function successNotice({
  assignedParticipantId,
  isPositionAction,
  appliedPolicies,
  drawDefinition,
  drawPosition,
  structureId,
  stack,
}) {
  if (isPositionAction) {
    const positionAction = {
      removedParticipantId: assignedParticipantId,
      drawPosition,
      structureId,
      name: stack,
    };
    addPositionActionTelemetry({ appliedPolicies, drawDefinition, positionAction });
  }

  return decorateResult({ result: { ...SUCCESS }, stack });
}

type SetMatchUpStatusByeArgs = {
  preserveScheduling?: boolean;
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  eventId?: string;
  matchUp: MatchUp;
  event?: Event;
};
function setMatchUpStatusBYE({
  preserveScheduling,
  tournamentRecord,
  drawDefinition,
  eventId,
  matchUp,
  event,
}: SetMatchUpStatusByeArgs) {
  Object.assign(matchUp, {
    matchUpStatus: BYE,
    score: undefined,
    winningSide: undefined,
  });

  // ONLY on an explicit release. `undefined` preserves — see the gate in
  // assignDrawPositionBye. Folded in before the notice below so the release ships
  // with the same modifyMatchUpNotice rather than emitting a second one.
  if (preserveScheduling === false) releaseByeScheduling({ matchUp });

  modifyMatchUpNotice({
    tournamentId: tournamentRecord?.tournamentId,
    eventId: eventId ?? event?.eventId,
    context: 'setMatchUpStatusBye',
    drawDefinition,
    matchUp,
    event,
  });
}

type AssignRoundRobinByeArgs = {
  preserveScheduling?: boolean;
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  drawPosition: number;
  matchUps: MatchUp[];
  event?: Event;
};

function assignRoundRobinBYE({
  preserveScheduling,
  tournamentRecord,
  drawDefinition,
  drawPosition,
  matchUps,
  event,
}: AssignRoundRobinByeArgs) {
  matchUps.forEach((matchUp) => {
    if (matchUp.drawPositions?.includes(drawPosition)) {
      setMatchUpStatusBYE({
        eventId: event?.eventId,
        preserveScheduling,
        tournamentRecord,
        drawDefinition,
        matchUp,
      });
    }
  });
}

// Looks to see whether a given matchUp has a winnerMatchup or a loserMatchUp
// and if so advances the appropriate drawPosition into the targetMatchUp
type AdvanceDrawPositionType = {
  byeFromPropagation?: boolean;
  inContextDrawMatchUps: HydratedMatchUp[];
  drawPositionToAdvance: number;
  preserveScheduling?: boolean;
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  matchUpsMap: MatchUpsMap;
  matchUpId: string;
  event?: Event;
};
export function advanceDrawPosition({
  byeFromPropagation,
  drawPositionToAdvance,
  inContextDrawMatchUps,
  preserveScheduling,
  tournamentRecord,
  drawDefinition,
  matchUpsMap,
  matchUpId,
  event,
}: AdvanceDrawPositionType) {
  const stack = 'advanceDrawPosition';
  pushGlobalLog({ method: stack, color: 'cyan', drawPositionToAdvance });

  const matchUp = matchUpsMap.drawMatchUps.find((matchUp) => matchUp.matchUpId === matchUpId);
  const inContextMatchUp = inContextDrawMatchUps.find((matchUp) => matchUp.matchUpId === matchUpId);
  const structureId = inContextMatchUp?.structureId;
  const { structure } = findStructure({ drawDefinition, structureId });
  const { positionAssignments } = getPositionAssignments({
    structure,
  });

  const byeAssignedDrawPositions = positionAssignments
    ?.filter((assignment) => assignment.bye)
    .map((assignment) => assignment.drawPosition);

  const losingDrawPosition = matchUp?.drawPositions?.find((drawPosition) => drawPosition !== drawPositionToAdvance);
  const losingDrawPosiitonIsBye = losingDrawPosition && byeAssignedDrawPositions?.includes(losingDrawPosition);

  const targetData = positionTargets({
    inContextDrawMatchUps,
    drawDefinition,
    matchUpId,
  });
  if (targetData.error) return decorateResult({ result: targetData, stack });
  const {
    targetLinks: { loserTargetLink },
    targetMatchUps: { loserMatchUp, winnerMatchUp, loserTargetDrawPosition },
  } = targetData;

  // In lucky draws, pre-feed rounds (odd matchUp count) defer advancement to
  // luckyDrawAdvancement. Normal power-of-2 rounds advance immediately.
  const isLuckyDraw = isLuckyBasedDraw(drawDefinition?.drawType);
  const isPreFeedRound = (() => {
    const structureMatchUps = matchUpsOf(structure);
    if (!isLuckyDraw || !matchUp?.roundNumber || !structureMatchUps) return false;
    const roundMatchUpCount = structureMatchUps.filter((m: any) => m.roundNumber === matchUp.roundNumber).length;
    return roundMatchUpCount % 2 !== 0;
  })();

  // only handling situation where winningMatchUp is in same structure
  if (winnerMatchUp && winnerMatchUp.structureId === structure?.structureId && (!isLuckyDraw || !isPreFeedRound)) {
    // NOTE: error conditions are ignored
    advanceWinner({
      sourceRoundPosition: matchUp?.roundPosition,
      byeFromPropagation,
      drawPositionToAdvance,
      inContextDrawMatchUps,
      preserveScheduling,
      tournamentRecord,
      drawDefinition,
      winnerMatchUp,
      matchUpsMap,
      event,
    });
  }

  // only handling situation where a BYE is being placed in linked structure
  // and linked structure is NOT the same structure (a loser target is only found from its link, and
  // always with its target drawPosition)
  if (
    loserTargetLink &&
    loserMatchUp &&
    loserTargetDrawPosition !== undefined &&
    losingDrawPosiitonIsBye &&
    loserMatchUp.structureId !== structure?.structureId
  ) {
    const { roundNumber } = loserMatchUp;

    if (roundNumber === 1) {
      const result = assignDrawPositionBye({
        byeFromPropagation,
        structureId: loserTargetLink.target.structureId,
        drawPosition: loserTargetDrawPosition,
        preserveScheduling,
        tournamentRecord,
        drawDefinition,
        event,
      });
      if (result.error) return result;
    } else {
      assignFedDrawPositionBye({
        byeFromPropagation,
        loserTargetDrawPosition,
        preserveScheduling,
        tournamentRecord,
        loserTargetLink,
        drawDefinition,
        loserMatchUp,
        matchUpsMap,
        event,
      });
    }
  }

  return { ...SUCCESS };
}

/**
 * A carrier passing a BYE brings its exit with it: record it on the side it arrives at, where a produced exit already
 * stands pending (an exit with no winner).
 *
 * The feeder is the matchUp of the round before that holds the advancing position (`sourceRoundPosition`); the carrier
 * is the side of it that records a carried exit and did not win it. The entry names the feeder, as
 * the presumptive stamp did, so nothing keyed by source identity moves.
 */
function stampCarriedExitOnArrival({
  inContextDrawMatchUps,
  noContextWinnerMatchUp,
  drawPositionToAdvance,
  sourceRoundPosition,
  drawDefinition,
  drawPositions,
  winnerMatchUp,
  structureId,
}: {
  drawPositions: (number | undefined)[];
  inContextDrawMatchUps: HydratedMatchUp[];
  drawDefinition: DrawDefinition;
  noContextWinnerMatchUp: MatchUp;
  winnerMatchUp: HydratedMatchUp;
  drawPositionToAdvance: number;
  sourceRoundPosition?: number;
  structureId?: string;
}): void {
  if (!isExit(noContextWinnerMatchUp.matchUpStatus) || noContextWinnerMatchUp.winningSide) return;
  const feeder = inContextDrawMatchUps.find(
    (candidate) =>
      candidate.structureId === structureId &&
      candidate.roundNumber === (winnerMatchUp.roundNumber ?? 0) - 1 &&
      (sourceRoundPosition ? candidate.roundPosition === sourceRoundPosition : true) &&
      candidate.drawPositions?.includes(drawPositionToAdvance),
  );
  if (!feeder) return;
  // The feeder is read by PROVENANCE, not status: by the time the carrier passes, the BYE has settled it to BYE
  // (#5158), and its exit side still records the exit the carrier holds.
  const carrierSide = getDrawPositionSideNumber({
    matchUp: { ...feeder, sides: undefined },
    drawPosition: drawPositionToAdvance,
    drawDefinition,
    structureId,
  });
  if (!carrierSide || carrierSide === feeder.winningSide) return;
  // a CARRIER is a participant: a produced exit relayed past a BYE holder is `sendHeldExitsOn`'s to deliver, and it
  // writes the origin's own entry (`byeAdvancesIntoPendingDoubleExit`: both sides then read DOUBLE_WALKOVER)
  if (!feeder.sides?.some((side) => side?.sideNumber === carrierSide && side.participantId)) return;
  const carried = carriedExitStatus(getSideExitProvenance({ matchUp: feeder })?.[carrierSide]);
  if (!carried) return;
  // the side the lone arrival takes: structurally where the round profile can place it, else its bracket side, as
  // `arrivalIntoProvenanceOnlyExit` reads it (a fed round seats the fed position on side 1, the arrival on side 2)
  const bracketSide = winnerMatchUp.feedRound ? 2 : sourceRoundPosition && (sourceRoundPosition % 2 === 1 ? 1 : 2);
  const arrivalSide =
    getDrawPositionSideNumber({
      matchUp: { ...noContextWinnerMatchUp, sides: undefined, drawPositions },
      drawPosition: drawPositionToAdvance,
      drawDefinition,
      structureId,
    }) ?? bracketSide;
  mergeSideExitProvenance({
    matchUp: noContextWinnerMatchUp,
    provenance: buildCarriedExitProvenance({
      // the feeder WAS this exit before the BYE settled it; the entry reads as the presumptive stamp did
      previousMatchUpStatus: carried,
      sourceMatchUpId: feeder.matchUpId,
      exitingSideNumber: arrivalSide,
      matchUpStatus: carried,
    }),
  });
}

function advanceWinner({
  sourceRoundPosition,
  byeFromPropagation,
  drawPositionToAdvance,
  inContextDrawMatchUps,
  preserveScheduling,
  tournamentRecord,
  drawDefinition,
  winnerMatchUp,
  matchUpsMap,
  event,
}) {
  const stack = 'advanceWinner';
  const noContextWinnerMatchUp = matchUpsMap.drawMatchUps.find(
    (matchUp) => matchUp.matchUpId === winnerMatchUp.matchUpId,
  );
  const inContextMatchUp = inContextDrawMatchUps.find((matchUp) => matchUp.matchUpId === winnerMatchUp.matchUpId);
  const structureId = inContextMatchUp?.structureId;
  const { structure } = findStructure({ drawDefinition, structureId });
  const { positionAssignments } = getPositionAssignments({ structure });
  const drawPositionToAdvanceAssigment = positionAssignments?.find(
    ({ drawPosition }) => drawPosition === drawPositionToAdvance,
  );
  const drawPositionToAdvanceIsBye = drawPositionToAdvanceAssigment?.bye;
  const existingDrawPositions = noContextWinnerMatchUp.drawPositions?.filter(Boolean);

  // Defensive: advanceWinner only ever advances a WINNER (a real surviving side),
  // never a BYE — BYE cascades are dispatched through advanceDrawPosition's own
  // BYE branch below. If a BYE ever reaches here as the position to advance into an
  // already-populated matchUp, refuse rather than mis-place it. See the
  // never-advance-a-bye regression test (advanceWinnerNeverAdvancesBye.test.ts).
  if (existingDrawPositions?.length > 1 && drawPositionToAdvanceIsBye) {
    return decorateResult({ result: { error: DRAW_POSITION_ASSIGNED }, stack });
  }
  const pairedDrawPosition = existingDrawPositions?.find((drawPosition) => drawPosition !== drawPositionToAdvance);

  let drawPositionAssigned = false;
  // always ensure there are two drawPositions to iterate over
  const twoDrawPositions = [
    ...(noContextWinnerMatchUp.drawPositions ?? []).filter(Boolean),
    undefined,
    undefined,
  ].slice(0, 2);

  const drawPositions = twoDrawPositions
    .map((position) => {
      if ((!position && !drawPositionAssigned) || position === drawPositionToAdvance) {
        drawPositionAssigned = true;
        return drawPositionToAdvance;
      } else {
        return position;
      }
    })
    .sort(numericSort);

  if (!drawPositionAssigned) {
    return decorateResult({ result: { error: DRAW_POSITION_ASSIGNED }, stack });
  }

  const pairedDrawPositionIsBye = positionAssignments?.find(
    ({ drawPosition }) => drawPosition === pairedDrawPosition,
  )?.bye;

  // A CARRIER PASSING A BYE brings its exit into a matchUp where a produced exit stands pending: record it as it
  // arrives, so the branches below see the convergence (RULE 4). The record used to be here already: when the other
  // feeder's double exit produced onto this matchUp, the carrier's feeder (a single exit, undecided as to who would
  // come through) was stamped presumptively with its status, as though an exit were certain to arrive from it. An
  // arrival records no status (CA, 2026-10-07; F9), so the presumptive stamp is gone and the exit is written at the
  // moment it is true, and only there: a carrier passing a BYE into an undecided matchUp is left as it was.
  stampCarriedExitOnArrival({
    inContextDrawMatchUps,
    noContextWinnerMatchUp,
    drawPositionToAdvance,
    sourceRoundPosition,
    drawDefinition,
    drawPositions,
    winnerMatchUp,
    structureId,
  });
  const drawPositionIsBye = positionAssignments?.find(
    ({ drawPosition }) => drawPosition === drawPositionToAdvance,
  )?.bye;

  // AUTO-RESOLVE a pending propagated exit: a real participant is advancing into
  // the empty winning slot of a cascaded WALKOVER/DEFAULT (e.g. a consolation
  // walkover that was applied while awaiting the participant who falls through
  // later). They take the walkover — keep the exit status, make them the winner,
  // re-position the carried code onto the exiting participant's side, and advance
  // them onward. Without this the generic clear below reverts it to TO_BE_PLAYED.
  if (
    arrivalIntoProvenanceOnlyExit({
      holdsParticipant: !!drawPositionToAdvanceAssigment?.participantId,
      matchUp: noContextWinnerMatchUp,
      existingDrawPositions,
      drawPositionToAdvance,
      inContextDrawMatchUps,
      sourceRoundPosition,
      pairedDrawPositionIsBye,
      drawPositionIsBye,
      tournamentRecord,
      inContextMatchUp,
      drawDefinition,
      winnerMatchUp,
      matchUpsMap,
      event,
      stack,
    })
  ) {
    return;
  }

  // AN EMPTY POSITION RESOLVES NOTHING. A pending exit is awarded to whoever ARRIVES on its seat (CA 2026-09-20; #5158
  // for the arrival path); a position that holds nobody yet, advanced structurally ahead of a BYE being placed on it,
  // takes its seat and the exit stands, still awarded to that seat. Resolving it advanced the empty position onward as
  // the walkover's winner, where the BYE then landed, while the carrier who met the BYE stayed behind (census w2
  // 9100079, DE 16/13 `Backdraw|3|1`: BYE_ADVANCEMENT_MISSING).
  if (
    isExit(noContextWinnerMatchUp.matchUpStatus) &&
    noContextWinnerMatchUp.winningSide &&
    !drawPositionIsBye &&
    !pairedDrawPositionIsBye &&
    !drawPositionToAdvanceAssigment?.participantId &&
    !drawPositionToAdvanceAssigment?.qualifier
  ) {
    setMatchUpDrawPositions({
      structureId: winnerMatchUp?.structureId,
      matchUp: noContextWinnerMatchUp,
      drawDefinition,
      drawPositions,
    });
    modifyMatchUpNotice({
      tournamentId: tournamentRecord?.tournamentId,
      eventId: event?.eventId,
      matchUp: noContextWinnerMatchUp,
      drawDefinition,
      context: stack,
      event,
    });
    return;
  }

  // AN ARRIVAL ON THE EXITING SIDE TAKES NOTHING. The exit is already awarded to the seat opposite, which holds its
  // winner — who may have played on. The arrival is that matchUp's loser: seated, and nothing advances. Resolving it
  // advanced the arrival onward as the walkover's winner, into the seat the next round owed somebody else (census
  // 20037222, MODIFIED_FEED_IN_CHAMPIONSHIP 8/8 `Consolation|2|2`). The side is STRUCTURAL, read as
  // `arrivalIntoProvenanceOnlyExit` reads it: a fed round seats the advancing position on side 2, any other round by
  // its source's place. Ascending drawPosition order does not give sides in a fed structure (`draw-positions.md`).
  const arrivalSide = winnerMatchUp.feedRound ? 2 : sourceRoundPosition && (sourceRoundPosition % 2 === 1 ? 1 : 2);
  if (
    isExit(noContextWinnerMatchUp.matchUpStatus) &&
    noContextWinnerMatchUp.winningSide &&
    arrivalSide &&
    arrivalSide !== noContextWinnerMatchUp.winningSide &&
    pairedDrawPosition &&
    !drawPositionIsBye &&
    !pairedDrawPositionIsBye
  ) {
    setMatchUpDrawPositions({
      structureId: winnerMatchUp?.structureId,
      matchUp: noContextWinnerMatchUp,
      drawDefinition,
      drawPositions,
    });
    modifyMatchUpNotice({
      tournamentId: tournamentRecord?.tournamentId,
      eventId: event?.eventId,
      matchUp: noContextWinnerMatchUp,
      drawDefinition,
      context: stack,
      event,
    });
    return;
  }

  if (
    isExit(noContextWinnerMatchUp.matchUpStatus) &&
    noContextWinnerMatchUp.winningSide &&
    !drawPositionIsBye &&
    !pairedDrawPositionIsBye
  ) {
    resolvePropagatedExitOnAdvance({
      matchUp: noContextWinnerMatchUp,
      drawPositionToAdvance,
      inContextDrawMatchUps,
      tournamentRecord,
      drawDefinition,
      drawPositions,
      winnerMatchUp,
      matchUpsMap,
      event,
      stack,
    });
    return;
  }

  // A CONVERGENCE STANDS. When the matchUp already records an exit on BOTH sides, the position advancing in is a
  // carrier passing a BYE with its exit (a propagated exit meeting a BYE is advanced, CA 2026-09-20), beside an exit
  // produced for the other seat: the two collapse and nobody wins (RULE 4; #5161, "an arrival carrying an exit
  // converges, never takes"). Writing TO_BE_PLAYED here lost both while provenance still recorded them (census w2
  // 9100283, FRLC 32/30 `Consolation|2|3`; de 9301596, DE 16/13 `Backdraw|3|1`: ORIGIN_ON_UNDECIDED_MATCHUP).
  const standingExit = deriveExitStateFromProvenance(getSideExitProvenance({ matchUp: noContextWinnerMatchUp }));
  const convergence = standingExit && !standingExit.winningSide ? standingExit.matchUpStatus : undefined;
  const matchUpStatus = drawPositionIsBye || pairedDrawPositionIsBye ? BYE : (convergence ?? TO_BE_PLAYED);

  rekeySideFacts({
    structureId: winnerMatchUp?.structureId,
    matchUp: noContextWinnerMatchUp,
    rekeyWinningSide: false,
    drawDefinition,
    drawPositions,
  });
  Object.assign(noContextWinnerMatchUp, {
    matchUpStatus,
    score: undefined,
    winningSide: undefined,
    drawPositions: normalizeDrawPositions(drawPositions),
  });

  // The cascade carries the operator's decision rather than re-opening the question
  // per matchUp: an explicit release applies to everything this BYE reaches, and the
  // default (undefined / true) leaves downstream placements alone.
  if (matchUpStatus === BYE && preserveScheduling === false) {
    releaseByeScheduling({ matchUp: noContextWinnerMatchUp });
  }

  const changedDrawPosition = noContextWinnerMatchUp.drawPositions.find(
    (position) => !twoDrawPositions.includes(position),
  );

  pushGlobalLog({
    method: stack,
    color: 'brightyellow',
    changedDrawPosition,
    pairedDrawPositionIsBye,
    drawPositionIsBye,
  });

  modifyMatchUpNotice({
    tournamentId: tournamentRecord?.tournamentId,
    matchUp: noContextWinnerMatchUp,
    eventId: event?.eventId,
    event,
    context: stack,
    drawDefinition,
  });

  if (pairedDrawPositionIsBye || drawPositionIsBye) {
    const advancingDrawPosition = pairedDrawPositionIsBye ? drawPositionToAdvance : pairedDrawPosition;

    if (advancingDrawPosition) {
      advanceDrawPosition({
        drawPositionToAdvance: advancingDrawPosition,
        matchUpId: winnerMatchUp.matchUpId,
        inContextDrawMatchUps,
        preserveScheduling,
        tournamentRecord,
        drawDefinition,
        matchUpsMap,
      });
    } else if (drawPositionIsBye) {
      const result = assignByeToLoserTarget({
        matchUp: winnerMatchUp,
        byeFromPropagation,
        inContextDrawMatchUps,
        preserveScheduling,
        tournamentRecord,
        drawDefinition,
        matchUpsMap,
        event,
      });
      if (result?.error) return result;
    }
  }
}

/**
 * A BYE sits ALONE in `matchUp`, so whoever the loser link expects from it will never come: the
 * loser target gets a BYE now, whether or not the other side has arrived.
 *
 * This is the step `advanceWinner` takes when it advances a BYE into a matchUp with no partner yet.
 * `assignDrawPositionBye` needs the same step for a seat that is ALREADY in that matchUp — advanced
 * from generation over its opponent's draw BYE — and is now being made a BYE where it sits: its
 * furthest advancement is the matchUp itself, there is nothing to advance, and without this the
 * loser target stayed empty. Measured 2026-09-30 on `shuffleCompletion`'s byeLimit stress, 4 of 12
 * cases, once `positionClear` kept a BYE-advanced seat through a clear: `Consolation|2|4` of a
 * FIRST_MATCH_LOSER_CONSOLATION 16 read TO_BE_PLAYED against a Main matchUp whose loser was a BYE,
 * and the draw could not complete.
 */
function assignByeToLoserTarget({
  byeFromPropagation,
  inContextDrawMatchUps,
  preserveScheduling,
  tournamentRecord,
  drawDefinition,
  matchUpsMap,
  matchUp,
  event,
}) {
  const targetData = positionTargets({
    matchUpId: matchUp.matchUpId,
    inContextDrawMatchUps,
    drawDefinition,
  });
  if (targetData.error) return decorateResult({ result: targetData, stack: 'assignByeToLoserTarget' });
  const {
    targetLinks: { loserTargetLink },
    targetMatchUps: { loserMatchUp, loserTargetDrawPosition },
  } = targetData;
  // a loser target is only found from its link, and always with its drawPositions and target drawPosition
  if (!loserTargetLink || !loserMatchUp?.drawPositions || loserTargetDrawPosition === undefined) return { ...SUCCESS };

  if (loserMatchUp.feedRound) {
    return assignFedDrawPositionBye({
      byeFromPropagation,
      loserTargetDrawPosition,
      preserveScheduling,
      tournamentRecord,
      loserTargetLink,
      drawDefinition,
      loserMatchUp,
      matchUpsMap,
    });
  }

  const sourceStructureRoundPosition = matchUp.roundPosition;
  // loser drawPosition in target structure is determined bye even/odd
  const targetDrawPositionIndex = 1 - (sourceStructureRoundPosition % 2);
  const targetDrawPosition = getSideDrawPosition({
    structureId: loserTargetLink.target.structureId,
    sideNumber: targetDrawPositionIndex + 1,
    matchUp: loserMatchUp,
    drawDefinition,
  });
  // a non-feed loser target holds both positions from generation; refuse rather than place a BYE nowhere
  if (!targetDrawPosition)
    return decorateResult({ result: { error: MISSING_DRAW_POSITION }, stack: 'advanceByeToLoserMatchUp' });

  return assignDrawPositionBye({
    byeFromPropagation,
    structureId: loserTargetLink.target.structureId,
    drawPosition: targetDrawPosition,
    preserveScheduling,
    tournamentRecord,
    drawDefinition,
    event,
  });
}

/**
 * An arrival through a BYE into a pending exit that records only WHICH side exited.
 *
 * A double exit into a round whose other side is still to arrive produces a WALKOVER/DEFAULTED with
 * `sideExitProvenance` naming the exiting side and no winningSide — nobody has arrived to award it to.
 * The generic advancement below wrote TO_BE_PLAYED over it, undeciding a decided matchUp
 * (MONOTONIC_DECISION, census 9000223).
 *
 * THE SIDE IS STRUCTURAL. A lone arrival's side is not its array index — `advanceWinner` builds a lone
 * arrival as `[position, undefined]` whatever side it belongs on (`draw-positions.md` rule 4). In a
 * non-feed round it is the source matchUp's roundPosition (odd feeds side 1); in a feed round an
 * advancing position is side 2. Reading the index made an arrival on the EXITING side the winner of
 * its own walkover (DE window 9303412).
 *
 *  - nobody arrives (a reservation): the exit stays pending and records the position;
 *  - the exiting side's own participant arrives: it stays pending, awarded to the side still to
 *    arrive — the `progressExitStatus` RULE 2 shape, so that arrival resolves it the ordinary way;
 *  - a participant arrives on the other side: they take it and advance.
 */
function arrivalIntoProvenanceOnlyExit({
  existingDrawPositions,
  drawPositionToAdvance,
  pairedDrawPositionIsBye,
  sourceRoundPosition,
  drawPositionIsBye,
  holdsParticipant,
  inContextMatchUp,
  matchUp,
  ...context
}): boolean {
  // only entries that record an EXIT: provenance also holds a BYE's claim on its seat (`BYE>BYE`), which is not an
  // exit and must not make a lone pending exit look like a convergence (census w2 9100521, COMPASS 32/29: a produced
  // walkover beside a BYE claim at `South|3|1` was overwritten TO_BE_PLAYED when a participant advanced into it)
  const exitSides = Object.entries(getSideExitProvenance({ matchUp }) ?? {})
    .filter(([, entry]) => carriedExitStatus(entry))
    .map(([sideNumber]) => Number(sideNumber));
  const applies =
    isExit(matchUp.matchUpStatus) &&
    !matchUp.winningSide &&
    !drawPositionIsBye &&
    !pairedDrawPositionIsBye &&
    exitSides.length === 1 &&
    !existingDrawPositions?.length;
  if (!applies) return false;

  let side: number | undefined;
  if (inContextMatchUp?.feedRound) side = 2;
  else if (sourceRoundPosition) side = sourceRoundPosition % 2 === 1 ? 1 : 2;
  if (!side) return false;

  // stored alone, whatever its side (`normalizeDrawPositions`); the side travels as `advancingSide`
  const positional = [drawPositionToAdvance];

  if (holdsParticipant && side !== exitSides[0]) {
    resolvePropagatedExitOnAdvance({
      ...context,
      matchUp,
      drawPositionToAdvance,
      drawPositions: positional,
      advancingSide: side,
    } as any);
    return true;
  }

  matchUp.drawPositions = normalizeDrawPositions(positional);
  if (holdsParticipant) matchUp.winningSide = side === 1 ? 2 : 1;
  modifyMatchUpNotice({
    tournamentId: context.tournamentRecord?.tournamentId,
    eventId: context.event?.eventId,
    drawDefinition: context.drawDefinition,
    context: context.stack,
    event: context.event,
    matchUp,
  });
  return true;
}

// A participant advancing into the empty winning slot of a pending propagated
// exit takes the walkover: keep the exit status, set them as the winner, move the
// carried code onto the exiting participant's (re-sorted) side, then advance them.
function resolvePropagatedExitOnAdvance({
  matchUp,
  drawPositionToAdvance,
  inContextDrawMatchUps,
  tournamentRecord,
  drawDefinition,
  drawPositions,
  winnerMatchUp,
  matchUpsMap,
  event,
  stack,
  advancingSide = undefined as number | undefined,
}) {
  const advancingSideNumber =
    advancingSide ??
    getDrawPositionSideNumber({
      structureId: winnerMatchUp?.structureId ?? matchUp?.structureId,
      matchUp: { ...matchUp, drawPositions },
      drawPosition: drawPositionToAdvance,
      drawDefinition,
    });
  const exitSideNumber = advancingSideNumber === 1 ? 2 : 1;

  // the participant already here can change side as the advancing position arrives; what is recorded by side goes
  // with them, and `winningSide` is assigned below from the advancing side (`setMatchUpDrawPositions`)
  rekeySideFacts({
    structureId: winnerMatchUp?.structureId ?? matchUp?.structureId,
    rekeyWinningSide: false,
    drawDefinition,
    drawPositions,
    matchUp,
  });

  /**
   * THE POLICY CODE FOLLOWS THE EXITING SIDE — and the exit tenant is not here to be re-sided.
   *
   * **P37.** This site is `applyPositionToMatchUp`'s twin and it never got that site's narrowing
   * (#4996). Two things were wrong once the projection stopped being written:
   *
   *  - `find(Boolean)` took the first TRUTHY element, and a provenance-shaped element is an object, so
   *    on a projected array it re-sided an OBJECT — which is why the guard below had to exist at all.
   *  - the guard, `alreadySided`, skipped the re-siding whenever provenance named exactly the exiting
   *    side, on the stated grounds that *"the codes are already sided by it — they are projected from
   *    provenance"*. That is no longer true of anything in this array. Policy codes are NOT projected
   *    from provenance, so on a matchUp whose provenance happened to name the exiting side the guard
   *    left a policy code sitting on the wrong side.
   *
   * Filtering to the policy tenant removes both: there is no object to re-side, so no guard is needed,
   * and the code that belongs to the exiting participant follows them. Same rule, same reader as
   * `applyPositionToMatchUp`.
   */
  const matchUpStatusCodes: string[] = [];
  const existingCode = retainPolicyCodes(matchUp).map(policyCodeString).find(Boolean);
  if (existingCode) {
    for (let i = 0; i < exitSideNumber - 1; i++) matchUpStatusCodes[i] = '';
    matchUpStatusCodes[exitSideNumber - 1] = existingCode;
  }

  Object.assign(matchUp, {
    // keep the exit status (WALKOVER / DEFAULTED) already on the matchUp
    winningSide: advancingSideNumber,
    matchUpStatusCodes,
    score: undefined,
    drawPositions: normalizeDrawPositions(drawPositions),
  });

  modifyMatchUpNotice({
    tournamentId: tournamentRecord?.tournamentId,
    eventId: event?.eventId,
    event,
    context: stack,
    drawDefinition,
    matchUp,
  });

  // the walkover winner advances onward to the next round
  advanceDrawPosition({
    matchUpId: winnerMatchUp.matchUpId,
    drawPositionToAdvance,
    inContextDrawMatchUps,
    tournamentRecord,
    drawDefinition,
    matchUpsMap,
  });
}

type AssignFedDrawPositionByeType = {
  byeFromPropagation?: boolean;
  loserTargetDrawPosition: number;
  preserveScheduling?: boolean;
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  loserMatchUp: HydratedMatchUp;
  matchUpsMap: MatchUpsMap;
  loserTargetLink: any;
  event?: Event;
};

/**
 * Exported for `propagateUnfillableLoserBye`, which resolves an unfillable loser target in a CONNECTED
 * structure and must dispatch exactly as the BYE cascade above does — round 1 straight to
 * `assignDrawPositionBye`, any later round through here, where the fed position's own initial round is
 * what decides. Two spellings of that dispatch is how the two paths would drift.
 */
export function assignFedDrawPositionBye({
  byeFromPropagation,
  loserTargetDrawPosition,
  preserveScheduling,
  tournamentRecord,
  loserTargetLink,
  drawDefinition,
  loserMatchUp,
  matchUpsMap,
  event,
}: AssignFedDrawPositionByeType) {
  const { roundNumber } = loserMatchUp;

  const stack = 'assignFedDrawPositionBye';
  pushGlobalLog({ method: stack, color: 'cyan', loserTargetDrawPosition });

  const mappedMatchUps = matchUpsMap?.mappedMatchUps ?? {};
  const loserStructureMatchUps = mappedMatchUps[loserMatchUp.structureId].matchUps;
  const { initialRoundNumber } = getInitialRoundNumber({
    drawPosition: loserTargetDrawPosition,
    matchUps: loserStructureMatchUps,
  });
  if (initialRoundNumber === roundNumber) {
    const result = assignDrawPositionBye({
      byeFromPropagation,
      structureId: loserTargetLink.target.structureId,
      drawPosition: loserTargetDrawPosition,
      preserveScheduling,
      tournamentRecord,
      drawDefinition,
      event,
    });
    if (result.error) return result;
  }
}
