import { modifyRoundRobinMatchUpsStatus } from '@Mutate/matchUps/matchUpStatus/modifyRoundRobinMatchUpsStatus';
import { modifyPositionAssignmentsNotice, modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { getPositionAssignments, structureAssignedDrawPositions } from '@Query/drawDefinition/positionsGetter';
import { getDrawPositionSideNumber, getSideDrawPosition } from '@Query/matchUps/getDrawPositionSides';
import { getStructureDrawPositionProfiles } from '@Query/structure/getStructureDrawPositionProfiles';
import { setMatchUpDrawPositions } from '@Mutate/matchUps/drawPositions/setMatchUpDrawPositions';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { getInitialRoundNumber } from '@Query/matchUps/getInitialRoundNumber';
import { getRoundMatchUps } from '@Query/matchUps/getRoundMatchUps';
import { decorateResult } from '@Functions/global/decorateResult';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { pushGlobalLog } from '@Functions/global/globalLog';
import { matchUpsOf } from '@Acquire/structureMembers';
import { findStructure } from '@Acquire/findStructure';
import { isAnyExit, isDoubleExit } from '@Validators/isExit';
import { ensureInt } from '@Tools/ensureInt';
import { overlap } from '@Tools/arrays';
import {
  releaseAdvancedDrawPositionAcrossLinks,
  releaseAcrossWinnerLinks,
  releaseLinkedWinnerAdvancement,
} from '@Mutate/matchUps/drawPositions/releaseLinkedWinnerAdvancement';
import {
  deriveExitStateFromProvenance,
  clearSideExitProvenance,
  withoutWinnersOrigins,
  retainByeClaimsOnly,
  carriedExitStatus,
} from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';

// constants and types
import { BYE, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { CONTAINER, DRAW } from '@Constants/drawDefinitionConstants';
import { MatchUpsMap, ResultType } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { HydratedMatchUp } from '@Types/hydrated';
import { TEAM } from '@Constants/matchUpTypes';
import {
  DrawDefinition,
  Event,
  MatchUp,
  MatchUpStatusUnion,
  PositionAssignment,
  SideExitProvenance,
  Structure,
  Tournament,
} from '@Types/tournamentTypes';

// constants
import {
  DRAW_POSITION_ACTIVE,
  MISSING_DRAW_POSITION,
  DRAW_POSITION_NOT_CLEARED,
  ErrorType,
  STRUCTURE_NOT_FOUND,
} from '@Constants/errorConditionConstants';

type ClearDrawPositionArgs = {
  inContextDrawMatchUps?: HydratedMatchUp[];
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  matchUpsMap?: MatchUpsMap;
  participantId?: string;
  drawPosition?: number;
  structureId: string;
  event?: Event;
};
export function clearDrawPosition(params: ClearDrawPositionArgs): ResultType & { participantId?: string } {
  let { inContextDrawMatchUps, participantId, drawPosition } = params;
  const { tournamentRecord, drawDefinition, structureId, matchUpsMap, event } = params;
  const { structure } = findStructure({ drawDefinition, structureId });
  const positionAssignments =
    structureAssignedDrawPositions({
      drawDefinition,
      structure,
    }).positionAssignments ?? [];

  const existingAssignment = positionAssignments.find(
    (assignment) =>
      (participantId && assignment.participantId === participantId) ||
      (drawPosition && assignment.drawPosition === drawPosition),
  );

  if (existingAssignment && participantId && !drawPosition) {
    drawPosition = existingAssignment?.drawPosition;
  }
  if (!drawPosition) return { error: MISSING_DRAW_POSITION };
  if (!participantId) participantId = existingAssignment?.participantId;

  const { activeDrawPositions } = getStructureDrawPositionProfiles({
    drawDefinition,
    structureId,
  });
  const drawPositionIsActive = activeDrawPositions.includes(drawPosition);

  // drawPosition may not be cleared if:
  // 1. drawPosition has been advanced by winning a matchUp
  // 2. drawPosition is paired with another drawPosition which has been advanced by winning a matchUp
  /**
   * A BYE is exempt, because a BYE cannot itself be active.
   *
   * "Active" means the drawPosition advanced by winning a matchUp, or is paired with one that did.
   * A BYE wins nothing — it holds no participant, no score and no winningSide. What is genuinely
   * active is the OPPONENT's advancement THROUGH the bye, and this function already knows how to
   * unwind precisely that: `buildRemovalTasks` emits a `byeAdvancedRemoval` task for the
   * bye-advanced pair a few lines below.
   *
   * So the guard was refusing the one operation that repairs the state it was guarding. Measured on
   * census seed 9000037 (FIRST_MATCH_LOSER_CONSOLATION 8/5): a placeholder BYE in the consolation
   * let its opponent advance and play; a winner flip then made a real loser eligible for that slot,
   * and the clear was refused because the position was "active" — active only through the very
   * advancement the removal tasks were about to take back.
   *
   * Scoped to the assignment being a BYE. A drawPosition holding a PARTICIPANT who has advanced is
   * still active and still refuses, which is the case the guard was written for.
   */
  if (drawPositionIsActive && !existingAssignment?.bye) {
    return { error: DRAW_POSITION_ACTIVE };
  }

  if (!inContextDrawMatchUps) {
    ({ matchUps: inContextDrawMatchUps } = getAllDrawMatchUps({
      inContext: true,
      drawDefinition,
      matchUpsMap,
    }));
  }

  const result = drawPositionRemovals({
    inContextDrawMatchUps,
    tournamentRecord,
    drawDefinition,
    structureId,
    drawPosition,
    matchUpsMap,
    event,
  });

  if (result.error) return result;
  if (!result.drawPositionCleared) return { error: DRAW_POSITION_NOT_CLEARED };

  modifyPositionAssignmentsNotice({
    tournamentId: tournamentRecord?.tournamentId,
    drawDefinition,
    structure,
    event,
  });

  return { ...SUCCESS, participantId };
}

type DrawPositionRemovalsArgs = {
  inContextDrawMatchUps?: HydratedMatchUp[];
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  matchUpsMap?: MatchUpsMap;
  drawPosition: number;
  structureId: string;
  event?: Event;
};
export function drawPositionRemovals({
  inContextDrawMatchUps,
  tournamentRecord,
  drawDefinition,
  drawPosition,
  matchUpsMap,
  structureId,
  event,
}: DrawPositionRemovalsArgs): ResultType & {
  positionAssignments?: PositionAssignment[];
  drawPositionCleared?: boolean;
  tasks?: unknown;
} {
  const { structure } = findStructure({ drawDefinition, structureId });
  if (!structure) return { error: STRUCTURE_NOT_FOUND };
  const positionAssignments =
    structureAssignedDrawPositions({
      drawDefinition,
      structure,
    }).positionAssignments ?? [];

  // read BEFORE the assignment is emptied: the link releases below must know who left (mode D)
  const clearedParticipantId = positionAssignments.find(
    (assignment) => assignment.drawPosition === drawPosition,
  )?.participantId;
  const drawPositionCleared = positionAssignments.some((assignment) => {
    if (assignment.drawPosition === drawPosition) {
      delete assignment.participantId;
      delete assignment.qualifier;
      delete assignment.bye;
      // A BYE removed by ANY route — cascade unwind, a position action, or a hand edit — takes
      // its provenance marker with it. A marker outliving the BYE it describes would make the
      // next propagated BYE at this drawPosition look already-accounted-for.
      delete assignment.byeFromPropagation;
      return true;
    }
    return undefined;
  });

  if (structure.structureType === CONTAINER) {
    modifyRoundRobinMatchUpsStatus({
      positionAssignments,
      tournamentRecord,
      drawDefinition,
      matchUpsMap,
      structure,
      event,
    });
    return { drawPositionCleared, ...SUCCESS };
  }

  const matchUpFilters = { isCollectionMatchUp: false };
  const { matchUps: structureMatchUps } = getAllStructureMatchUps({
    drawDefinition,
    matchUpFilters,
    matchUpsMap,
    structure,
    event,
  });
  const { roundProfile, roundMatchUps } = getRoundMatchUps({
    matchUps: structureMatchUps,
  });
  const profileKeys = roundProfile && Object.keys(roundProfile);
  const roundNumbers = profileKeys?.map((roundNumber) => ensureInt(roundNumber));

  const pairingDetails = buildPairingDetails({ roundNumbers, roundProfile, positionAssignments, drawPosition });

  const tasks: any = buildRemovalTasks(pairingDetails);

  // a removal that fails is returned, not dropped: a malformed round link refuses the clear (CA, 2026-10-06)
  for (const { roundNumber, targetDrawPosition, relevantPair } of tasks ?? []) {
    const targetMatchUp = roundMatchUps?.[roundNumber].find((matchUp) =>
      overlap(matchUp.drawPositions?.filter(Boolean), relevantPair.filter(Boolean)),
    );
    if (!targetMatchUp) continue;

    const subsequent = removeSubsequentRoundsParticipant({
      inContextDrawMatchUps,
      targetDrawPosition,
      tournamentRecord,
      drawDefinition,
      structureId,
      roundNumber,
      matchUpsMap,
    });
    if (subsequent?.error) return subsequent;

    const removed = removeDrawPosition({
      inContextDrawMatchUps,
      clearedParticipantId,
      positionAssignments,
      tournamentRecord,
      drawDefinition,
      targetMatchUp,
      drawPosition,
      matchUpsMap,
      structure,
      event,
    });
    if (removed?.error) return removed;
  }

  // The participant left this structure. Whatever a WINNER link carried for them out of it comes back, including
  // where their seat keeps its BYE advancement and the round walk above released nothing (mode D).
  if (clearedParticipantId) {
    releaseAcrossWinnerLinks({
      participantId: clearedParticipantId,
      tournamentRecord,
      drawDefinition,
      drawPosition,
      matchUpsMap,
      structureId,
      event,
    });
  }

  return { tasks, drawPositionCleared, positionAssignments };
}

function removeSubsequentRoundsParticipant({
  inContextDrawMatchUps,
  targetDrawPosition,
  tournamentRecord,
  drawDefinition,
  matchUpsMap,
  roundNumber,
  structureId,
}) {
  const { structure } = findStructure({ drawDefinition, structureId });
  if (!structure) return { error: STRUCTURE_NOT_FOUND };
  if (structure.structureType === CONTAINER) return;

  matchUpsMap = matchUpsMap || getMatchUpsMap({ drawDefinition });
  const mappedMatchUps = matchUpsMap?.mappedMatchUps ?? {};
  const matchUps = mappedMatchUps[structureId].matchUps;

  const { initialRoundNumber } = getInitialRoundNumber({
    drawPosition: targetDrawPosition,
    matchUps,
  });

  const relevantMatchUps = matchUps?.filter(
    (matchUp) =>
      matchUp.roundNumber >= roundNumber &&
      matchUp.roundNumber !== initialRoundNumber &&
      matchUp.drawPositions?.includes(targetDrawPosition),
  );

  const positionAssignments =
    getPositionAssignments({
      drawDefinition,
      structureId,
    }).positionAssignments ?? [];

  for (const matchUp of relevantMatchUps ?? []) {
    const removed = removeDrawPosition({
      drawPosition: targetDrawPosition,
      targetMatchUp: matchUp,
      inContextDrawMatchUps,
      positionAssignments,
      tournamentRecord,
      drawDefinition,
      matchUpsMap,
      structure,
    });
    if (removed?.error) return removed;
  }
  return { ...SUCCESS };
}

type RemoveDrawPositionArgs = {
  inContextDrawMatchUps?: HydratedMatchUp[];
  clearedParticipantId?: string;
  positionAssignments: PositionAssignment[];
  targetMatchUp: HydratedMatchUp;
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  matchUpsMap?: MatchUpsMap;
  drawPosition: number;
  structure: Structure;
  event?: Event;
};
function removeDrawPosition({
  inContextDrawMatchUps,
  clearedParticipantId,
  positionAssignments,
  tournamentRecord,
  drawDefinition,
  targetMatchUp,
  drawPosition,
  matchUpsMap,
  structure,
  event,
}: RemoveDrawPositionArgs) {
  const stack = 'removeDrawPosition';
  const initialDrawPositions = targetMatchUp.drawPositions?.slice();
  const initialMatchUpStatus = targetMatchUp.matchUpStatus;
  const initialWinningSide = targetMatchUp.winningSide;

  matchUpsMap = matchUpsMap ?? getMatchUpsMap({ drawDefinition });
  const mappedMatchUps = matchUpsMap.mappedMatchUps;
  const matchUps = mappedMatchUps[structure.structureId].matchUps;
  const { initialRoundNumber } = getInitialRoundNumber({
    drawPosition,
    matchUps,
  });

  /**
   * A SEAT THE DRAW ADVANCED BEFORE THE CASCADE ARRIVED KEEPS ITS ADVANCEMENT WHEN THE CASCADE LEAVES.
   *
   * A seat whose opponent is a BYE advances from generation, before anything is played. A double
   * exit upstream can later make that seat a propagated BYE, and correcting the double exit
   * withdraws it again. Withdrawing the BYE must not take the seat's advancement with it: that
   * advancement never depended on the BYE, it depended on the OPPONENT's.
   *
   * Traced 2026-09-29 on MODIFIED_FEED_IN_CHAMPIONSHIP 8/5, `Main|1|2` a DOUBLE_WALKOVER then
   * corrected to a WALKOVER:
   *
   *     generated          Consolation|3|1  [2, _]     seat 2's opponent, seat 5, is a BYE
   *     double exit        Consolation|3|1  [1, 2]     seat 2 is now a propagated BYE
   *     corrected          Consolation|3|1  (nothing)  seat 2's advancement went with the BYE
   *
   * These are the 8 cells `correctionDivergence`'s DOWNGRADE arm had reported since it was written
   * — DOUBLE_ELIMINATION and MODIFIED_FEED_IN_CHAMPIONSHIP at 8/5 — and they do not depend on
   * `doubleExitPropagateBye`. `releaseAdvancedDrawPosition` has carried the same rule since
   * 2026-09-21 (*"a position advanced by a BYE is never released"*); this file has its own removal
   * and had never been given it.
   *
   * WHATEVER is withdrawn — a propagated BYE, a participant, a director's BYE. The first version of
   * this rule (2026-09-29) kept the advancement only for a propagated BYE, on the theory that
   * clearing a participant is followed by a position action that re-derives it. CA ruled otherwise
   * on 2026-10-01 (P46), on two FIRST_MATCH_LOSER_CONSOLATION 8/5 files that differed only in route:
   *
   *     generated          Consolation|3|1  [2, _]     seat 2's opponent, seat 5, is a BYE
   *     walkover entered   Consolation|3|1  [2, 4]     the loser arrives on seat 2, already advanced
   *     corrected          Consolation|3|1  [4, 5]     this removal took seat 2 out; seat 5 advanced instead
   *     entered directly   Consolation|3|1  [2, 4]     *"A is clearly correct"*
   *
   * The advancement never depended on the occupant, so the occupant leaving cannot take it. The
   * generated draw is exactly this state — an advanced seat with nobody on it — and a participant
   * arriving onto it later is the ordinary case, not a double seating. What made the narrower rule
   * necessary was `assignDrawPositionBye`: on a seat that was already advanced and alone it found
   * nothing to advance and skipped the loser feed, so a BYE placed on such a seat left the loser
   * target empty (4 of `shuffleCompletion`'s 12 byeLimit cases). `assignByeToLoserTarget` closes
   * that, and the rule can be what it says.
   */
  const keepsByeAdvancement = advancedByOpponentsBye({
    matchUps: matchUps ?? [],
    positionAssignments,
    targetMatchUp,
    drawPosition,
  });

  if (
    !keepsByeAdvancement &&
    targetMatchUp.roundNumber &&
    initialRoundNumber &&
    targetMatchUp.roundNumber > initialRoundNumber
  ) {
    // Removal, not substitution: preserves ascending order. See `getOrderedDrawPositions`.
    // Settled through `normalizeDrawPositions`, which stores the positions present (a lone survivor
    // alone, its side read structurally) and an empty result as `[]`.
    // The participant who stays can change side as the seat empties; what is recorded by side goes with them.
    setMatchUpDrawPositions({
      drawPositions: (targetMatchUp.drawPositions ?? []).map((currentDrawPosition) =>
        currentDrawPosition === drawPosition ? undefined : currentDrawPosition,
      ),
      structureId: structure.structureId,
      matchUp: targetMatchUp,
      drawDefinition,
    });

    // AND ACROSS THE LINK. This removal walked the rounds of one structure and stopped at its edge.
    // Measured 2026-09-30 by `correctionDivergenceDeep` on DOUBLE_ELIMINATION 8/5: a double exit's
    // BYE let the other Backdraw finalist advance through the Backdraw final and across the winner
    // link into the Main final; correcting the double exit to a single took them out of the Backdraw
    // final here and left them in the Main final, where the direct entry never had them.
    // `participantId` is passed because the assignment it would be read from was emptied before this ran.
    releaseLinkedWinnerAdvancement({
      participantId: clearedParticipantId,
      roundNumber: targetMatchUp.roundNumber,
      structureId: structure.structureId,
      tournamentRecord,
      drawDefinition,
      drawPosition,
      matchUpsMap,
      event,
    });
  }

  handleTeamPositionRemoval({
    inContextDrawMatchUps,
    tournamentRecord,
    drawDefinition,
    targetMatchUp,
    drawPosition,
    event,
    stack,
  });

  const targetData = positionTargets({
    matchUpId: targetMatchUp.matchUpId,
    inContextDrawMatchUps,
    drawDefinition,
  });
  if (targetData.error) return decorateResult({ result: targetData, stack });

  const {
    targetLinks: { winnerTargetLink },
    targetMatchUps: {
      loserMatchUp,
      winnerMatchUp,
      loserMatchUpDrawPositionIndex,
      // winnerMatchUpDrawPositionIndex,
    },
  } = targetData;

  const matchUpContainsBye = updateMatchUpStatusAfterRemoval({
    initialDrawPositions,
    initialMatchUpStatus,
    initialWinningSide,
    positionAssignments,
    tournamentRecord,
    structureId: structure.structureId,
    drawDefinition,
    targetMatchUp,
    drawPosition,
    event,
    stack,
  });

  releaseUndecidedAdvancements({
    initialMatchUpStatus,
    initialDrawPositions,
    initialWinningSide,
    tournamentRecord,
    drawDefinition,
    targetMatchUp,
    drawPosition,
    matchUpsMap,
    structure,
    event,
  });

  if (loserMatchUp && loserMatchUp.structureId !== targetData.matchUp?.structureId && !matchUpContainsBye) {
    const result = handleLoserMatchUpRemoval({
      loserMatchUpDrawPositionIndex,
      inContextDrawMatchUps,
      tournamentRecord,
      drawDefinition,
      loserMatchUp,
      matchUpsMap,
      event,
      stack,
    });
    if (result?.error) return result;
  }

  if (
    winnerMatchUp &&
    winnerMatchUp.structureId !== targetData.matchUp?.structureId &&
    // does not apply to traversals that are based on QUALIFYING
    winnerTargetLink?.target.feedProfile !== DRAW
  ) {
    /*
    const { structure } = findStructure({
      structureId: targetData.matchUp.structureId,
      drawDefinition,
    });

    if (/* is not a qualifying structure *?)
      console.log('linked structure winnerMatchUp removal', {
        winnerMatchUpDrawPositionIndex,
        winnerTargetLink,
      });
      */
  }

  return { ...SUCCESS };
}

function buildPairingDetails({ roundNumbers, roundProfile, positionAssignments, drawPosition }) {
  let targetDrawPosition: any = drawPosition;
  return roundNumbers
    ?.map((roundNumber) => {
      // find the pair of drawPositions which includes the targetDrawPosition
      const profile = roundProfile?.[roundNumber];
      const relevantPair = profile?.pairedDrawPositions?.find((drawPositions) =>
        drawPositions.includes(targetDrawPosition),
      );
      // find the drawPosition which is paired with the targetDrawPosition
      const pairedDrawPosition: any = relevantPair?.find(
        (currentDrawPosition) => currentDrawPosition !== targetDrawPosition,
      );
      // find the assignment for the paired drawPosition
      const pairedDrawPositionAssignment = positionAssignments.find(
        (assignment) => assignment.drawPosition === pairedDrawPosition,
      );
      const nextRoundProfile = roundProfile?.[roundNumber + 1];
      // whether or not the pairedDrawPosition is a BYE
      const pairedDrawPositionIsBye = pairedDrawPositionAssignment?.bye;
      // whether or not the pairedDrawPosition is present in the next round
      const pairedDrawPositionInNextRound = nextRoundProfile?.pairedDrawPositions?.find((pairedPositions: any) =>
        pairedPositions.includes(pairedDrawPosition),
      );
      // pairedDrawPosition is a transitiveBye if it is a BYE and if it is present in next round
      const isTransitiveBye =
        pairedDrawPositionIsBye &&
        pairedDrawPositionInNextRound &&
        nextRoundProfile?.drawPositions?.includes(pairedDrawPosition);
      const pairedDrawPositionByeAdvancedPair = !isTransitiveBye && pairedDrawPositionInNextRound;

      const result = relevantPair && {
        pairedDrawPositionByeAdvancedPair,
        pairedDrawPosition,
        targetDrawPosition,
        relevantPair,
        roundNumber,
      };

      // if the pairedDrawPosition is a BYE, continue search with pairedDrawPoaition as targetDrawPosition
      if (isTransitiveBye) targetDrawPosition = pairedDrawPosition;

      return result;
    })
    .filter((f) => f?.targetDrawPosition);
}

function buildRemovalTasks(pairingDetails) {
  return pairingDetails?.reduce((tasks, pairingDetail: any) => {
    const { roundNumber, relevantPair, targetDrawPosition, pairedDrawPosition, pairedDrawPositionByeAdvancedPair } =
      pairingDetail;
    const roundRemoval = { roundNumber, targetDrawPosition, relevantPair };
    const byeAdvancedRemoval = pairedDrawPositionByeAdvancedPair && {
      roundNumber: roundNumber + 1,
      targetDrawPosition: pairedDrawPosition,
      relevantPair: pairedDrawPositionByeAdvancedPair,
      subsequentRoundRemoval: true,
    };
    const newTasks = [roundRemoval, byeAdvancedRemoval].filter(Boolean);
    return tasks.concat(...newTasks);
  }, []);
}

function handleTeamPositionRemoval({
  inContextDrawMatchUps,
  tournamentRecord,
  drawDefinition,
  targetMatchUp,
  drawPosition,
  event,
  stack,
}) {
  if (targetMatchUp.matchUpType !== TEAM) return;

  const inContextTargetMatchUp = inContextDrawMatchUps?.find(
    (matchUp) => matchUp.matchUpId === targetMatchUp.matchUpId,
  );
  const sides: any[] = inContextTargetMatchUp?.sides ?? [];
  const drawPositionSideIndex = sides.reduce(
    (index, side, i) => (side.drawPosition === drawPosition ? i : index),
    undefined,
  );

  if (drawPositionSideIndex !== undefined && targetMatchUp.sides?.[drawPositionSideIndex]?.lineUp) {
    delete targetMatchUp.sides?.[drawPositionSideIndex].lineUp;

    modifyMatchUpNotice({
      tournamentId: tournamentRecord?.tournamentId,
      context: `${stack}-TEAM`,
      eventId: event?.eventId,
      matchUp: targetMatchUp,
      drawDefinition,
      event,
    });
  }
}

/**
 * A matchUp this removal left UNDECIDED advances nobody, so what it had advanced comes back.
 *
 * The removed position's own advancements are taken by the caller, which walks every round holding it. The other
 * position's are not, and it stayed one round on, advanced out of an undecided matchUp (`ADVANCED_FROM_UNDECIDED`):
 *
 *  - as the WINNER of a result the removal voided. Census w1 9000562 (FEED_IN_CHAMPIONSHIP 16/11): a walkover carried
 *    past a propagated BYE decided `Consolation|3|1` and its winner advanced to `4|1`; undoing the double exit that
 *    had made the BYE took the carrier back out of `3|1`, which reverted to TO_BE_PLAYED with the winner left in `4|1`.
 *  - past a BYE the removal took away. Census de 9301695 (DOUBLE_ELIMINATION 16/15): undoing a double exit cleared the
 *    propagated BYE opposite `Backdraw|2|3`'s occupant, who had passed it into `3|2` and `4|2` and stayed there.
 *
 * A matchUp left a BYE keeps its advancement: a BYE advancement is structural (P46, `advancedByOpponentsBye`).
 */
function releaseUndecidedAdvancements({
  initialMatchUpStatus,
  initialDrawPositions,
  initialWinningSide,
  tournamentRecord,
  drawDefinition,
  targetMatchUp,
  drawPosition,
  matchUpsMap,
  structure,
  event,
}: {
  initialMatchUpStatus?: MatchUpStatusUnion;
  initialDrawPositions?: number[];
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  initialWinningSide?: number;
  targetMatchUp: MatchUp;
  matchUpsMap?: MatchUpsMap;
  structure: Structure;
  drawPosition: number;
  event?: Event;
}) {
  const roundNumber = targetMatchUp.roundNumber;
  if (!roundNumber || targetMatchUp.winningSide || targetMatchUp.matchUpStatus !== TO_BE_PLAYED) return;
  if (!initialWinningSide && initialMatchUpStatus !== BYE) return;
  for (const advanced of initialDrawPositions ?? []) {
    if (!advanced || advanced === drawPosition) continue;
    releaseAdvancedDrawPositionAcrossLinks({
      structureId: structure.structureId,
      fromRoundNumber: roundNumber + 1,
      drawPosition: advanced,
      withdrawingExit: true,
      tournamentRecord,
      drawDefinition,
      matchUpsMap,
      event,
    });
  }
}

function updateMatchUpStatusAfterRemoval({
  initialDrawPositions,
  initialMatchUpStatus,
  initialWinningSide,
  positionAssignments,
  tournamentRecord,
  drawDefinition,
  targetMatchUp,
  drawPosition,
  structureId,
  event,
  stack,
}: {
  initialMatchUpStatus?: MatchUpStatusUnion;
  positionAssignments: PositionAssignment[];
  initialDrawPositions?: number[];
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  initialWinningSide?: number;
  targetMatchUp: MatchUp;
  drawPosition: number;
  structureId: string;
  event?: Event;
  stack: string;
}) {
  const matchUpAssignments = positionAssignments.filter(({ drawPosition }) =>
    targetMatchUp.drawPositions?.includes(drawPosition),
  );
  const matchUpContainsBye = matchUpAssignments.filter((assignment) => assignment.bye).length;

  // Collapse to BYE (when a BYE remains) or TO_BE_PLAYED. Exit-status REDUCTION on
  // removal (DOUBLE_WALKOVER -> WALKOVER) lives elsewhere — removeDoubleExit and the
  // sibling removeSubsequentRoundsParticipant. What CAN reach here is the removal of a
  // still-pending propagated exit (its exit participant is cleared while its winner slot
  // is still empty): the matchUp collapses to TO_BE_PLAYED, so drop the leftover
  // winningSide and carried exit codes — neither a BYE nor a TO_BE_PLAYED matchUp is
  // decided.
  targetMatchUp.matchUpStatus = (matchUpContainsBye && BYE) || TO_BE_PLAYED;
  targetMatchUp.winningSide = undefined;
  if (targetMatchUp.matchUpStatusCodes?.length) targetMatchUp.matchUpStatusCodes = [];
  // THE CLAIM LEDGER IS NOT PART OF WHAT IS BEING REMOVED. Clearing the origins is right — the exit
  // they described is gone — but this took the BYE claim ledger with them, and a ledger can hold
  // ANOTHER claimant's entry. Two double exits can each claim a BYE on one matchUp, on different
  // sides; withdrawing one reached here and erased the other's, so the BYE it still owed stood with
  // nobody recorded as owing it. Measured 2026-09-29 with `doubleExitPropagateBye` on: 52 of 192
  // `correctionDivergence` DOWNGRADE cells. A claim leaves when its claimant withdraws it
  // (`withdrawByeClaim`), never as a side effect of a position being cleared.
  //
  // AND NEITHER IS THE OTHER SIDE'S ORIGIN. A carried exit on the side that is NOT being cleared
  // describes an arrival from elsewhere — it did not come through the removed position and does
  // not leave with it. Measured 2026-09-30 by `correctionDivergenceDeep` on
  // FIRST_MATCH_LOSER_CONSOLATION 16/15 (8 cells): `Consolation|1|3`'s double exit had carried its
  // WALKOVER onto `Consolation|2|3` side 2; unwinding `Main|2|3`'s double exit withdrew the BYE on
  // side 1, reached here, and side 2's origin went with it. The direct entry keeps it.
  const removedDrawPosition = initialDrawPositions?.find(
    (position) => !targetMatchUp.drawPositions?.includes(position),
  );
  // The side being cleared is the one `drawPosition` occupied as the matchUp stood: on the position's initial round
  // the seat stays in the array (only its assignment is emptied), so the position removed from the array is not the
  // whole story. Read STRUCTURALLY. `indexOf + 1` is a side only while both positions are present; a lone position
  // is stored at index 0 whatever its side (draw-positions.md § 2), so a lone side-2 position was cleared as side 1,
  // taking the OTHER side's origin and keeping its own (census de 9302775, DE 16/11 `Backdraw|3|2`: a produced
  // DEFAULTED from `Backdraw|2|3` erased, a BYE claim left on an undecided matchUp).
  //
  // And it is the position REMOVED FROM THIS MATCHUP, which need not be `drawPosition`. Clearing one of two BYEs that
  // met in a matchUp takes back the BYE THAT matchUp advanced, under its own number: census 20030617 (OLYMPIC 8/8),
  // `West|1|1`'s dp 2 claim withdrawn removed dp 1 from `West|2|1`. Asked about dp 2, the side read undefined, and the
  // other side's produced DEFAULTED from `West|1|2` was dropped with it, so the loser who then arrived met nobody.
  const sidePosition =
    initialDrawPositions?.includes(drawPosition) || !removedDrawPosition ? drawPosition : removedDrawPosition;
  const clearedSideNumber =
    getDrawPositionSideNumber({
      matchUp: { ...targetMatchUp, sides: undefined, drawPositions: initialDrawPositions },
      drawPosition: sidePosition,
      drawDefinition,
      structureId,
    }) ??
    // only for a position this matchUp actually held: one it never held (an FMLC fall-through winner) keeps the
    // long-standing reading, which clears the origins and takes the award back
    (initialDrawPositions?.includes(sidePosition)
      ? (sideFedFromPosition({ targetMatchUp, drawPosition: sidePosition, drawDefinition, structureId }) ??
        sideOfRemovedBye({ targetMatchUp, initialDrawPositions, initialMatchUpStatus }))
      : undefined);
  // a matchUp holding NO position, from which none was removed, has nothing a clear can take, so it loses no origin
  // either (census 20030617: a second pass over `West|2|1`, empty by then, erased the produced DEFAULTED kept above).
  // A matchUp that holds a position is still cleared as before: its winner can have arrived without a stored position
  // (an FMLC fall-through), and the clear of that winner's origin is what takes the award back.
  const touchedHere = !!initialDrawPositions?.filter(Boolean).length || !!removedDrawPosition;
  const retained = touchedHere
    ? retainProvenanceBesideRemoval(targetMatchUp.sideExitProvenance, clearedSideNumber)
    : targetMatchUp.sideExitProvenance && { ...targetMatchUp.sideExitProvenance };
  clearSideExitProvenance(targetMatchUp);
  if (retained) targetMatchUp.sideExitProvenance = retained;

  /**
   * AND THE STATUS SAYS WHAT SURVIVES. With no BYE left and the other side still carrying an exit,
   * the matchUp is a PENDING exit, not TO_BE_PLAYED — the state a direct entry leaves. Measured
   * 2026-09-30 on the census's seed 6341103 (MODIFIED_FEED_IN_CHAMPIONSHIP 8/6): a walkover loser
   * held `Consolation|2|2` side 2 with their walkover; `Main|2|1`'s double exit was corrected to a
   * single one, the unwind took the BYE off side 1 and left TO_BE_PLAYED, and the single exit's
   * loser then arrived to no convergence — `WALKOVER ws=2`, the exit-carrying side winning, where
   * the direct entry converges to DOUBLE_WALKOVER. Same derivation `removeDoubleExit` applies to
   * what it retains; a BYE-held matchUp stays BYE, because a BYE is a fact about the draw.
   */
  const exitsRetained =
    retained && withoutWinnersOrigins({ provenance: retained, matchUp: targetMatchUp, structureId, drawDefinition });
  const rederived = !matchUpContainsBye && exitsRetained ? deriveExitStateFromProvenance(exitsRetained) : undefined;
  if (rederived) {
    targetMatchUp.matchUpStatus = rederived.matchUpStatus;
    targetMatchUp.winningSide = awardStands({
      rederived,
      retained,
      positionAssignments,
      targetMatchUp,
      drawDefinition,
      structureId,
    })
      ? rederived.winningSide
      : undefined;
  } else if (!matchUpContainsBye && retained) {
    // Undecided, so no origin stands on it either; a winner's origin rides only on a matchUp that is an exit or a
    // BYE (ORIGIN_ON_UNDECIDED_MATCHUP). `removeDoubleExit`'s withdrawal clears it the same way. The claims stay.
    clearSideExitProvenance(targetMatchUp);
    const claims = retainByeClaimsOnly(retained);
    if (claims) targetMatchUp.sideExitProvenance = claims;
  }
  const noChange =
    initialDrawPositions?.includes(drawPosition) &&
    initialMatchUpStatus === targetMatchUp.matchUpStatus &&
    initialWinningSide === targetMatchUp.winningSide;

  if (!noChange) {
    if (removedDrawPosition) {
      pushGlobalLog({
        method: stack,
        color: 'brightyellow',
        removedDrawPosition,
      });
    }

    modifyMatchUpNotice({
      tournamentId: tournamentRecord?.tournamentId,
      context: `${stack}-${drawPosition}`,
      eventId: event?.eventId,
      matchUp: targetMatchUp,
      drawDefinition,
      event,
    });
  }

  return matchUpContainsBye;
}

/**
 * A PRODUCED exit has no winningSide until a participant arrives (CA, 2026-09-20); a CARRIED exit keeps its
 * winningSide on an empty seat (exit-propagation.md). `deriveExitStateFromProvenance` awards the other side either
 * way, so the award stands here only for a carried exit or a seat that holds a participant. Census de 9302775
 * (DE 16/11): a produced DEFAULTED retained on `Backdraw|3|2` side 1 was otherwise won by an empty dp 7.
 */
function awardStands({
  rederived,
  retained,
  positionAssignments,
  targetMatchUp,
  drawDefinition,
  structureId,
}: {
  rederived: { matchUpStatus: MatchUpStatusUnion; winningSide?: number };
  positionAssignments: PositionAssignment[];
  retained?: SideExitProvenance;
  drawDefinition: DrawDefinition;
  targetMatchUp: MatchUp;
  structureId: string;
}): boolean {
  const { winningSide } = rederived;
  if (!winningSide) return true;
  const exitEntry = retained?.[3 - winningSide];
  if (!isDoubleExit(exitEntry?.previousMatchUpStatus)) return true;
  const drawPosition = getSideDrawPosition({
    matchUp: { ...targetMatchUp, sides: undefined },
    sideNumber: winningSide,
    drawDefinition,
    structureId,
  });
  const assignment = positionAssignments.find((candidate) => candidate.drawPosition === drawPosition);
  return !!(assignment?.participantId || assignment?.qualifier);
}

/**
 * What survives a position's clear: every claim on either side, and the origin on the side that
 * was NOT cleared. With no identifiable cleared side (the position was not in the array), only the
 * claims survive — the behaviour this call had before the other side's origin was retained.
 */
/**
 * The side `drawPosition` held, read from the previous-round matchUp that holds it. The structural reader orders
 * positions from the round profile as it stands, and by the time a removal reaches here the position can already be
 * gone from this round, so it cannot be placed (census 20030617, OLYMPIC 8/8: dp 1 out of `West|2|1`). The feeder's
 * place in its round answers the question.
 */
function sideFedFromPosition({
  drawDefinition,
  targetMatchUp,
  drawPosition,
  structureId,
}: {
  drawDefinition: DrawDefinition;
  targetMatchUp: MatchUp;
  drawPosition?: number;
  structureId: string;
}): number | undefined {
  const { roundNumber, roundPosition } = targetMatchUp;
  if (!drawPosition || !roundNumber || !roundPosition || roundNumber < 2) return undefined;
  const { structure } = findStructure({ drawDefinition, structureId });
  const matchUps = matchUpsOf(structure) ?? [];
  const feeder = matchUps.find(
    (matchUp) => matchUp.roundNumber === roundNumber - 1 && matchUp.drawPositions?.includes(drawPosition),
  );
  if (!feeder?.roundPosition) return undefined;

  // a round half the size of the one before pairs its feeders 2p-1 (side 1) and 2p (side 2). Any other shape (a feed
  // round, a lucky draw's odd round) is not read here and keeps the long-standing answer: no side, origins cleared
  const previousCount = matchUps.filter((matchUp) => matchUp.roundNumber === roundNumber - 1).length;
  const currentCount = matchUps.filter((matchUp) => matchUp.roundNumber === roundNumber).length;
  if (previousCount !== 2 * currentCount || Math.ceil(feeder.roundPosition / 2) !== roundPosition) return undefined;
  return feeder.roundPosition % 2 ? 1 : 2;
}

/**
 * The side of a lone BYE being removed, read from the BYE's own arrival record when the structure can no longer say.
 *
 * A BYE advanced into a matchUp holds it alone, and is recorded on its side (`{ matchUpStatus: BYE }`). When it is
 * taken back, the feeder it came through may already have lost the position, so neither the stored array nor the
 * feeder reads a side; with no side, every origin was cleared, the OTHER side's produced exit with it. Census 20090234
 * (CURTIS_CONSOLATION 16/13): `Consolation 1|3|2` held the BYE on dp 9 beside `Consolation 1|2|4`'s produced DEFAULTED;
 * re-scoring `Main|1|6` from a double walkover took the BYE back and the DEFAULTED with it, so the participant who
 * then arrived was moved on unawarded and the matchUp stalled. Only for a matchUp that was a BYE holding one position,
 * and only when exactly one side records the BYE's arrival.
 *
 * Or when exactly one side records an EXIT. An exit owns no position — a produced or carried exit is an empty side —
 * so a BYE holding the lone position sat on the other side. Census 20209866 (FIRST_MATCH_LOSER_CONSOLATION 8/7): the
 * BYE's own arrival record had not survived a re-write of the double exit that advanced it, the feeder had already
 * lost the position, and with no side the produced walkover waiting beside the BYE was cleared; the loser who then
 * arrived through the BYE chain met an undecided, empty final that nothing could ever fill.
 */
function sideOfRemovedBye({
  initialMatchUpStatus,
  initialDrawPositions,
  targetMatchUp,
}: {
  initialMatchUpStatus?: MatchUpStatusUnion;
  initialDrawPositions?: number[];
  targetMatchUp: MatchUp;
}): number | undefined {
  if (initialMatchUpStatus !== BYE || initialDrawPositions?.filter(Boolean).length !== 1) return undefined;
  const byeSides = ([1, 2] as const).filter(
    (sideNumber) => targetMatchUp.sideExitProvenance?.[sideNumber]?.matchUpStatus === BYE,
  );
  if (byeSides.length === 1) return byeSides[0];
  const exitSides = ([1, 2] as const).filter((sideNumber) => {
    const entry = targetMatchUp.sideExitProvenance?.[sideNumber];
    return !!entry && (isAnyExit(entry.matchUpStatus) || !!carriedExitStatus(entry));
  });
  if (exitSides.length !== 1) return undefined;
  return exitSides[0] === 1 ? 2 : 1;
}

function retainProvenanceBesideRemoval(provenance: any, clearedSideNumber?: number) {
  if (!provenance) return undefined;
  if (!clearedSideNumber) return retainByeClaimsOnly(provenance);
  const retained: any = {};
  for (const sideNumber of [1, 2]) {
    const entry = provenance[sideNumber];
    if (!entry) continue;
    if (sideNumber !== clearedSideNumber) retained[sideNumber] = { ...entry };
    else if (entry.byeClaims?.length) retained[sideNumber] = { byeClaims: [...entry.byeClaims] };
  }
  return Object.keys(retained).length ? retained : undefined;
}

function handleLoserMatchUpRemoval({
  loserMatchUpDrawPositionIndex,
  inContextDrawMatchUps,
  tournamentRecord,
  drawDefinition,
  loserMatchUp,
  matchUpsMap,
  event,
  stack,
}): ResultType | void {
  const { drawPositions, roundNumber } = loserMatchUp;

  if (roundNumber === 1) {
    // the side's position, read structurally: index 0 is side 1
    const loserMatchUpDrawPosition = getSideDrawPosition({
      sideNumber: loserMatchUpDrawPositionIndex + 1,
      structureId: loserMatchUp.structureId,
      matchUp: loserMatchUp,
      drawDefinition,
    });
    // a first-round loser target holds both positions from generation
    if (!loserMatchUpDrawPosition) return decorateResult({ result: { error: MISSING_DRAW_POSITION }, stack });

    const removals = drawPositionRemovals({
      structureId: loserMatchUp.structureId,
      drawPosition: loserMatchUpDrawPosition,
      inContextDrawMatchUps,
      tournamentRecord,
      drawDefinition,
      matchUpsMap,
    });
    if (removals.error) return decorateResult({ result: removals, stack });

    return;
  }

  // for fed rounds the loserMatchUpDrawPosiiton is always the fed drawPosition
  // which is always the lowest numerical drawPosition
  const loserMatchUpDrawPosition = Math.min(...drawPositions.filter(Boolean));

  const result = consolationCleanup({
    loserMatchUpDrawPosition,
    inContextDrawMatchUps,
    tournamentRecord,
    drawDefinition,
    loserMatchUp,
    matchUpsMap,
    event,
  });
  if (result.error) return decorateResult({ result, stack });

  const mappedMatchUps = matchUpsMap?.mappedMatchUps ?? {};
  const loserStructureMatchUps = mappedMatchUps[loserMatchUp.structureId].matchUps;

  const { initialRoundNumber } = getInitialRoundNumber({
    drawPosition: loserMatchUpDrawPosition,
    matchUps: loserStructureMatchUps,
  });

  // if clearing a drawPosition from a feed round the initialRoundNumber for the drawPosition must be { roundNumber: 1 }
  if (initialRoundNumber === 1) {
    pushGlobalLog({
      method: stack,
      color: 'brightyellow',
      loserMatchUpDrawPosition,
    });

    const removals = drawPositionRemovals({
      structureId: loserMatchUp.structureId,
      drawPosition: loserMatchUpDrawPosition,
      inContextDrawMatchUps,
      tournamentRecord,
      drawDefinition,
      matchUpsMap,
    });
    if (removals.error) return decorateResult({ result: removals, stack });
  }
}

function consolationCleanup({
  loserMatchUpDrawPosition,
  inContextDrawMatchUps,
  tournamentRecord,
  drawDefinition,
  loserMatchUp,
  matchUpsMap,
  event,
}): { error?: ErrorType; success?: boolean } {
  const { structure } = findStructure({
    structureId: loserMatchUp.structureId,
    drawDefinition,
  });
  const { positionAssignments } = getPositionAssignments({ structure });
  const assignment = positionAssignments?.find((assignment) => assignment.drawPosition === loserMatchUpDrawPosition);

  if (assignment?.bye) {
    const result = clearDrawPosition({
      drawPosition: loserMatchUpDrawPosition,
      structureId: loserMatchUp.structureId,
      inContextDrawMatchUps,
      tournamentRecord,
      drawDefinition,
      matchUpsMap,
      event,
    });
    if (result.error) return result;
  }

  return { ...SUCCESS };
}

/**
 * Did this drawPosition reach `targetMatchUp` because its OPPONENT in the feeding matchUp is a BYE?
 *
 * The feeder is the latest earlier round in the structure that holds the position — derived from
 * round containment, as `releaseAdvancedDrawPosition.advancedByBye` derives it, because the raw
 * matchUps mutated here carry no `winnerMatchUpId`. The BYE has to be on ANOTHER seat of that
 * feeder: the position's own assignment has just been emptied and proves nothing either way.
 */
function advancedByOpponentsBye({
  positionAssignments,
  targetMatchUp,
  drawPosition,
  matchUps,
}: {
  positionAssignments: PositionAssignment[];
  targetMatchUp: HydratedMatchUp;
  drawPosition: number;
  matchUps: any[];
}): boolean {
  const roundNumber = targetMatchUp.roundNumber ?? 0;
  const feeders = matchUps.filter(
    (candidate) =>
      candidate.roundNumber !== undefined &&
      candidate.roundNumber < roundNumber &&
      candidate.drawPositions?.includes(drawPosition),
  );
  if (!feeders.length) return false;

  const feeder = feeders.reduce((latest, candidate) =>
    candidate.roundNumber > latest.roundNumber ? candidate : latest,
  );
  return (feeder.drawPositions ?? []).some(
    (position: number) =>
      position !== drawPosition &&
      positionAssignments.some((assignment) => assignment.drawPosition === position && assignment.bye),
  );
}
