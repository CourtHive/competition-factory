import { modifyRoundRobinMatchUpsStatus } from '@Mutate/matchUps/matchUpStatus/modifyRoundRobinMatchUpsStatus';
import { modifyPositionAssignmentsNotice, modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { getPositionAssignments, structureAssignedDrawPositions } from '@Query/drawDefinition/positionsGetter';
import { getDrawPositionSideNumber, getSideDrawPosition } from '@Query/matchUps/getDrawPositionSides';
import { getStructureDrawPositionProfiles } from '@Query/structure/getStructureDrawPositionProfiles';
import { setMatchUpDrawPositions } from '@Mutate/matchUps/drawPositions/setMatchUpDrawPositions';
import { cameDownLoserLink } from '@Mutate/matchUps/drawPositions/cameDownLoserLink';
import { bringCarryHome, carriedEntryAt } from '@Mutate/matchUps/drawPositions/carryHome';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { getInitialRoundNumber } from '@Query/matchUps/getInitialRoundNumber';
import { isAnyExit, isDoubleExit, isExit } from '@Validators/isExit';
import { getRoundMatchUps } from '@Query/matchUps/getRoundMatchUps';
import { decorateResult } from '@Functions/global/decorateResult';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { pushGlobalLog } from '@Functions/global/globalLog';
import { matchUpsOf } from '@Acquire/structureMembers';
import { findStructure } from '@Acquire/findStructure';
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
  getSideExitProvenance,
  carriedExitStatus,
  byeClaimSurvives,
  recordByeClaim,
} from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';

// constants and types
import { BYE, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { CONTAINER, DRAW } from '@Constants/drawDefinitionConstants';
import { MatchUpsMap, ResultType } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { HydratedMatchUp } from '@Types/hydrated';
import { TEAM } from '@Constants/matchUpTypes';
import {
  MatchUpStatusUnion,
  PositionAssignment,
  SideExitProvenance,
  DrawDefinition,
  Tournament,
  Structure,
  MatchUp,
  Event,
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
  const clearedAssignment = positionAssignments.find((assignment) => assignment.drawPosition === drawPosition);
  const clearedParticipantId = clearedAssignment?.participantId;
  const clearedBye = !!clearedAssignment?.bye;
  const drawPositionCleared = positionAssignments.some((assignment) => {
    if (assignment.drawPosition === drawPosition) {
      delete assignment.participantId;
      // a cleared position is no longer a qualifier's: the flag goes with the participant (see positionSwap)
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

  // THE SIDE EACH POSITION HOLDS IS READ BEFORE ANY TASK TAKES ANYTHING. A lone position's side is read through the
  // feeder that delivered it, and the tasks release feeders first; read later, a lone position read the wrong side or
  // none, and the removal dropped the exit standing on the OTHER side (census run 18, MODIFIED_FEED_IN_CHAMPIONSHIP
  // 32/27 seed 20715466, allow-change-propagation: dp 11, alone in `Consolation|3|1` beside `2|1`'s produced walkover,
  // was taken out of `2|2` first; `3|1` then lost the walkover too, and the next arrival passed it with nothing recorded).
  const sidesBefore = readSidesBefore({ matchUps: structureMatchUps, drawDefinition, structureId });

  // a removal that fails is returned, not dropped: a malformed round link refuses the clear (CA, 2026-10-06)
  for (const { roundNumber, targetDrawPosition, relevantPair } of tasks ?? []) {
    const targetMatchUp = roundMatchUps?.[roundNumber].find((matchUp) =>
      overlap(matchUp.drawPositions?.filter(Boolean), relevantPair.filter(Boolean)),
    );
    if (!targetMatchUp) continue;

    const subsequent = removeSubsequentRoundsParticipant({
      inContextDrawMatchUps,
      targetDrawPosition,
      sidesBefore,
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
      sidesBefore,
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

  // A BYE in the structure's LAST round advanced its pair out of the structure, across the WINNER link: the round walk
  // above takes back what a BYE advanced only into a next round of this structure, and here there is none. Census
  // run-17 20649692 (DOUBLE_ELIMINATION 8/5, allow-change-propagation): `Main|3|1`'s double walkover put a BYE in the
  // Backdraw final that carried its finalist into the Main final; re-scored to a result, its loser took the BYE's seat
  // and won the Backdraw final by the finalist's carried walkover, but the finalist stayed in the Main final
  // (WINNING_SIDE_ADVANCEMENT_MISMATCH, `aFinalByeTakesBackItsCrossing`).
  if (clearedBye) {
    for (const { roundNumber, pairedDrawPosition } of pairingDetails ?? []) {
      if (!pairedDrawPosition || roundProfile?.[roundNumber + 1]) continue;
      releaseLinkedWinnerAdvancement({
        drawPosition: pairedDrawPosition,
        tournamentRecord,
        drawDefinition,
        matchUpsMap,
        structureId,
        roundNumber,
        event,
      });
    }
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
  sidesBefore,
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
    const carry = carriedEntryAt({
      drawPosition: targetDrawPosition,
      positionAssignments,
      drawDefinition,
      structureId,
      matchUp,
    });
    const removed = removeDrawPosition({
      drawPosition: targetDrawPosition,
      targetMatchUp: matchUp,
      sidesBefore,
      inContextDrawMatchUps,
      positionAssignments,
      tournamentRecord,
      drawDefinition,
      matchUpsMap,
      structure,
    });
    if (removed?.error) return removed;
    if (carry)
      bringCarryHome({ carry, from: matchUp, drawPosition: targetDrawPosition, matchUps, drawDefinition, structureId });
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
  /** each matchUp's positions and the sides they held before the removal began (`readSidesBefore`) */
  sidesBefore?: SidesBefore;
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
  sidesBefore,
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

  let rekeyed = false;
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
    ({ sideChanged: rekeyed } = setMatchUpDrawPositions({
      drawPositions: (targetMatchUp.drawPositions ?? []).map((currentDrawPosition) =>
        currentDrawPosition === drawPosition ? undefined : currentDrawPosition,
      ),
      structureId: structure.structureId,
      matchUp: targetMatchUp,
      drawDefinition,
    }));

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
    sidesHeld: sidesBefore?.get(targetMatchUp.matchUpId),
    initialDrawPositions,
    rekeyed,
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

  if (
    loserMatchUp &&
    loserMatchUp.structureId !== targetData.matchUp?.structureId &&
    !matchUpContainsBye &&
    !reDerivedLoserStands({
      matchUpId: targetMatchUp.matchUpId,
      structureId: structure.structureId,
      loserMatchUpDrawPositionIndex,
      drawDefinition,
      loserMatchUp,
      matchUpsMap,
    })
  ) {
    const result = handleLoserMatchUpRemoval({
      sourceMatchUpId: targetMatchUp.matchUpId,
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

const isPosition = (drawPosition: unknown): boolean => typeof drawPosition === 'number' && drawPosition > 0;

/**
 * A HOLE'S CARRY GOES ON ONLY INTO THE MATCHUP ITS OWN MATCHUP FEEDS.
 *
 * A lone position's partner is nobody, but its matchUp can still have sent something on through that hole: a carried
 * exit that met the position's BYE passed it (RULE 1) into the next round with no drawPosition of its own. Clearing
 * the BYE takes that carry back ("a carry past a BYE a holder takes back comes back with it"), so the removal walks
 * on, into the matchUp the lone matchUp feeds and nowhere else. That matchUp is read structurally, the way
 * `getRoundMatchUps` chunks a round: a round that does not halve (a feed round) is fed one to one, any other by its
 * chunk. It is walked into only while it holds a hole too, for a seat a carry can stand on; one holding two positions
 * holds nothing that came through the hole. Census S8 FEED_IN_CHAMPIONSHIP_TO_SF 8/7 20650915 and COMPASS 32/27
 * 20611808: with no walk at all the carry stayed one round on beside the position that replaced it, the convergence
 * re-derived from it, and the matchUp's exit code sat on its winner. Asking the next round for ANY pair holding a hole
 * is what reset an unrelated matchUp (20806518, `aRemovalWalksOnlyThroughARealPartner`).
 */
type RoundPairs = { pairedDrawPositions?: (number | undefined)[][]; matchUpsCount?: number };
function holeCarriedOnto({
  nextRoundProfile,
  relevantPair,
  profile,
}: {
  relevantPair?: (number | undefined)[];
  nextRoundProfile?: RoundPairs;
  profile?: RoundPairs;
}): (number | undefined)[] | undefined {
  const pairs = profile?.pairedDrawPositions;
  const nextPairs = nextRoundProfile?.pairedDrawPositions;
  const index = relevantPair ? (pairs?.indexOf(relevantPair) ?? -1) : -1;
  if (index < 0 || !nextPairs?.length) return undefined;
  const chunkFactor = (profile?.matchUpsCount ?? 0) / (nextRoundProfile?.matchUpsCount ?? 0);
  if (!Number.isInteger(chunkFactor) || chunkFactor < 1) return undefined;
  const fedPair = nextPairs[Math.floor(index / chunkFactor)];
  return fedPair?.some((drawPosition: unknown) => !isPosition(drawPosition)) ? fedPair : undefined;
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
      // whether or not the pairedDrawPosition is present in the next round. A hole is not a drawPosition
      // (`draw-positions.md` § 5): a lone position's partner is nobody, and `includes(undefined)` matched every
      // next-round pair holding a hole, so the removal walked into a matchUp the position never reached and reset what
      // stood there (census run 19, FIRST_MATCH_LOSER_CONSOLATION 16/15 policy-off 20806518: a withdrawn reservation at
      // `Consolation` dp 4 reset `Consolation|3|1`'s produced walkover). What a hole carried on is looked for only in the
      // matchUp the lone matchUp feeds (`holeCarriedOnto`)
      const pairedDrawPositionInNextRound = isPosition(pairedDrawPosition)
        ? nextRoundProfile?.pairedDrawPositions?.find((pairedPositions: any) =>
            pairedPositions.includes(pairedDrawPosition),
          )
        : holeCarriedOnto({ profile, nextRoundProfile, relevantPair });
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
  // ...and a PENDING exit's reservation: "a pending exit's reservation goes with it" (exit-propagation.md). Read off the
  // award alone, a pending exit left undecided here kept the empty seat it had advanced (census A1 group R3: once a
  // cleared loser seat no longer leaves its award behind, FIRST_MATCH_LOSER_CONSOLATION 16/11 20704784 re-scored
  // `Main|1|5` and dp 4 stayed in `Consolation|4|1`, `aRemovalClearsItsSideInTheRecordsFrame`).
  if (!initialWinningSide && initialMatchUpStatus !== BYE && !isAnyExit(initialMatchUpStatus)) return;
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
  rekeyed,
  sidesHeld,
  event,
  stack,
}: {
  /** the side each position held before the removal began */
  sidesHeld?: Map<number, number | undefined>;
  initialMatchUpStatus?: MatchUpStatusUnion;
  positionAssignments: PositionAssignment[];
  initialDrawPositions?: number[];
  /** the removal moved the participant who stays to the other side, and what is recorded by side went with them */
  rekeyed?: boolean;
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
    sidesHeld?.get(sidePosition) ??
    // only for a position this matchUp actually held: one it never held (an FMLC fall-through winner) keeps the
    // long-standing reading, which clears the origins and takes the award back
    (initialDrawPositions?.includes(sidePosition)
      ? (sideFedFromPosition({ targetMatchUp, drawPosition: sidePosition, drawDefinition, structureId }) ??
        sideOfRemovedBye({ targetMatchUp, initialDrawPositions, initialMatchUpStatus }))
      : undefined) ??
    sideBesideHeldPosition({ targetMatchUp, initialDrawPositions, removedDrawPosition, drawDefinition, structureId });
  // a matchUp holding NO position, from which none was removed, has nothing a clear can take, so it loses no origin
  // either (census 20030617: a second pass over `West|2|1`, empty by then, erased the produced DEFAULTED kept above).
  // A matchUp that holds a position is still cleared as before: its winner can have arrived without a stored position
  // (an FMLC fall-through), and the clear of that winner's origin is what takes the award back.
  const touchedHere = !!initialDrawPositions?.filter(Boolean).length || !!removedDrawPosition;
  // The cleared side is read in the frame the matchUp stood in; the record was re-keyed as the position left, so when
  // the occupant crossed, the cleared seat is the other key now. Read across the two frames, the removed position's
  // exit was kept as the occupant's and the occupant's dropped (census run 18, FIRST_MATCH_LOSER_CONSOLATION 16/11
  // seed 20704784, policy off: `Consolation|3|2` [4, 9], awarded to the empty dp 4 by `Main|1|5`'s produced walkover
  // relayed in at dp 9; re-scoring `Main|1|5` took dp 9 out, dp 4 crossed to its bracket side 2, and the walkover was
  // kept on side 1 — a pending exit, so the award's advance of dp 4 into `4|1` was never released).
  const clearedSideNow = rekeyed && clearedSideNumber ? 3 - clearedSideNumber : clearedSideNumber;
  const retained = touchedHere
    ? retainProvenanceBesideRemoval(targetMatchUp.sideExitProvenance, clearedSideNow)
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
export function awardStands({
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
  // an exit that came straight down its source's LOSER link keeps its award to the seat that will receive the next
  // arrival, as direct entry writes it (`exitStatusClearing` 2.3; `removeDoubleExit`'s `producedAwardStands`). Taken
  // back here, a BYE withdrawn from that seat left the exit pending, and the held exit beside the next BYE read its
  // target's other feeder as delivering nobody (census run 19, COMPASS 32/32 policy-off 20834212: `Southeast|1|2`)
  if (cameDownLoserLink({ drawDefinition, targetMatchUp, sourceMatchUpId: exitEntry?.sourceMatchUpId })) return true;
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

// A position this matchUp never held, and none removed from it, says nothing about the side that HOLDS one: only the
// unheld side can be what the clear takes back (an FMLC fall-through winner arrived there without a stored position).
// Census 20490105 (DE 16/13, `on`): relabelling `Main|1|6` cleared dp 11 through `Backdraw|2|2`, which held only
// dp 5, and the blanket clear erased dp 5's carried WALKOVER; the produced exit that then arrived was awarded to the
// exit-carrier, who advanced into an occupied seat.
function sideBesideHeldPosition({
  targetMatchUp,
  initialDrawPositions,
  removedDrawPosition,
  drawDefinition,
  structureId,
}: {
  initialDrawPositions?: number[];
  removedDrawPosition?: number;
  drawDefinition: DrawDefinition;
  targetMatchUp: MatchUp;
  structureId?: string;
}): number | undefined {
  const held = initialDrawPositions?.filter(Boolean) ?? [];
  if (removedDrawPosition || held.length !== 1) return undefined;
  const heldSideNumber = getDrawPositionSideNumber({
    matchUp: { ...targetMatchUp, sides: undefined, drawPositions: initialDrawPositions },
    drawPosition: held[0],
    drawDefinition,
    structureId,
  });
  return heldSideNumber ? 3 - heldSideNumber : undefined;
}

type SidesBefore = Map<string, Map<number, number | undefined>>;

/** every matchUp's positions and the side each holds, read structurally as the draw stands */
function readSidesBefore({ matchUps, drawDefinition, structureId }): SidesBefore {
  const sides: SidesBefore = new Map();
  for (const matchUp of matchUps ?? []) {
    const held: number[] = (matchUp.drawPositions ?? []).filter(Boolean);
    if (!held.length) continue;
    const stored = { ...matchUp, sides: undefined };
    sides.set(
      matchUp.matchUpId,
      new Map(
        held.map((drawPosition) => [
          drawPosition,
          getDrawPositionSideNumber({ matchUp: stored, drawPosition, drawDefinition, structureId }),
        ]),
      ),
    );
  }
  return sides;
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

/**
 * THE LOSER LINK IS SERVED FROM THE MATCHUP AS IT RE-DERIVED, NOT FROM THE REMOVAL THAT RE-DERIVED IT.
 *
 * `handleLoserMatchUpRemoval` takes back what this matchUp sent over its loser link, and it used to run whenever the
 * link crossed into another structure. But the removal re-derives the matchUp first (`updateMatchUpStatusAfterRemoval`),
 * and what the re-derived matchUp sends over the link can be exactly what is already there:
 *
 *  - an exit side: decided, and its losing side holds nobody. Its loser seat is the BYE nobody can fill, as forward play
 *    leaves it ("a loser who is nobody holds no seat"); taking the BYE back left the loser structure owing a seat to an
 *    opponent who can never arrive (census A1 cases 10 and 13, COMPASS 32 under `doubleExitPropagateBye: false`: a
 *    probe's double walkover made `North|1|1` / `South|1|3` a BYE, and clearing it re-derived the produced exit and
 *    took `Northwest|dp1` / `Southeast|dp3` with it). The BYE stands on the account of the double exit whose produced exit the losing side holds, as forward play
 *    records it ("a BYE claimed further on goes the same way"), so its claim is recorded again where it is missing:
 *    kept without it, the next unwind could not tell the BYE had a reason to exist and took it (census F2 regression
 *    RUN16-ASSIGNMENT policyoff 20586104, COMPASS 32: `Northwest|dp2`, held for `East|2|4`'s produced exit in
 *    `North|1|2`);
 *  - an unchanged loser: decided, and its losing participant already stands in the loser matchUp, where `directLoser`
 *    would find them already directed. Taking them back removed a carrier the clear never touched (case 6, COMPASS 32:
 *    clearing a position advanced into `West|2|1` emptied `Southwest|dp1` though `West|2|1` still stood WALKOVER over
 *    the same loser).
 *
 * Otherwise, undecided or with a different loser, the removal proceeds as before.
 */
function reDerivedLoserStands({
  loserMatchUpDrawPositionIndex,
  drawDefinition,
  loserMatchUp,
  structureId,
  matchUpsMap,
  matchUpId,
}: {
  loserMatchUpDrawPositionIndex?: number;
  drawDefinition: DrawDefinition;
  loserMatchUp: HydratedMatchUp;
  matchUpsMap: MatchUpsMap;
  structureId: string;
  matchUpId: string;
}): boolean {
  const reDerived = matchUpsMap.drawMatchUps.find((matchUp) => matchUp.matchUpId === matchUpId);
  if (!reDerived?.winningSide) return false;
  const loserDrawPosition = getSideDrawPosition({
    sideNumber: 3 - reDerived.winningSide,
    matchUp: reDerived,
    drawDefinition,
    structureId,
  });
  const { positionAssignments } = getPositionAssignments({ drawDefinition, structureId });
  const loserParticipantId = positionAssignments?.find(
    (assignment) => loserDrawPosition && assignment.drawPosition === loserDrawPosition,
  )?.participantId;
  if (!loserParticipantId) {
    if (!isExit(reDerived.matchUpStatus)) return false;
    const origin = getSideExitProvenance({ matchUp: reDerived })?.[3 - reDerived.winningSide]?.sourceMatchUpId;
    keepByeOnItsOriginsAccount({ drawDefinition, loserMatchUp, loserMatchUpDrawPositionIndex, matchUpsMap, origin });
    return true;
  }

  const targetDrawPositions = (loserMatchUp.drawPositions ?? []).filter(Boolean);
  const { positionAssignments: targetAssignments } = getPositionAssignments({
    structureId: loserMatchUp.structureId,
    drawDefinition,
  });
  return !!targetAssignments?.some(
    (assignment) =>
      assignment.participantId === loserParticipantId && targetDrawPositions.includes(assignment.drawPosition),
  );
}

/** the seat `handleLoserMatchUpRemoval` reads: a first-round target's side by index, a fed round's fed position */
function loserSeatOf({ loserMatchUp, loserMatchUpDrawPositionIndex, drawDefinition }): number | undefined {
  if (loserMatchUp.roundNumber === 1)
    return getSideDrawPosition({
      sideNumber: (loserMatchUpDrawPositionIndex ?? 0) + 1,
      structureId: loserMatchUp.structureId,
      matchUp: loserMatchUp,
      drawDefinition,
    });
  const held = (loserMatchUp.drawPositions ?? []).filter(Boolean);
  return held.length ? Math.min(...held) : undefined;
}

function keepByeOnItsOriginsAccount({
  loserMatchUpDrawPositionIndex,
  drawDefinition,
  loserMatchUp,
  matchUpsMap,
  origin,
}: {
  loserMatchUpDrawPositionIndex?: number;
  drawDefinition: DrawDefinition;
  loserMatchUp: HydratedMatchUp;
  matchUpsMap: MatchUpsMap;
  origin?: string;
}): void {
  const claimant = matchUpsMap.drawMatchUps.find((matchUp) => matchUp.matchUpId === origin);
  if (!claimant || !isDoubleExit(claimant.matchUpStatus)) return;
  const seat = loserSeatOf({ loserMatchUp, loserMatchUpDrawPositionIndex, drawDefinition });
  const structureId = loserMatchUp.structureId;
  const { positionAssignments } = getPositionAssignments({ drawDefinition, structureId });
  if (!seat || !positionAssignments?.find((assignment) => assignment.drawPosition === seat)?.bye) return;
  const stored = matchUpsMap.drawMatchUps.find((matchUp) => matchUp.matchUpId === loserMatchUp.matchUpId);
  recordByeClaim({
    sideNumber: getDrawPositionSideNumber({ matchUp: stored, drawPosition: seat, structureId, drawDefinition }),
    claimantMatchUpId: claimant.matchUpId,
    matchUp: stored,
  });
}

/**
 * A BYE survives the removal while ANOTHER live claim still names it — the rule `removeDoubleExit` keeps at its own
 * loser target (`byeClaimSurvives`). The matchUp being cleared no longer claims it; a double exit that does still owes
 * it, and taking it back leaves that claimant's loser seat open to an opponent who can never arrive. Reached when the
 * matchUp re-derives undecided, so `reDerivedLoserStands` has no result to serve the link from: a BYE sent on beside a
 * double exit's produced walkover is withdrawn, and the BYE at the loser seat stands on that double exit's claim
 * (COMPASS 16, built by hand: `aClearedSeatKeepsTheByeALiveDoubleExitClaims`).
 */
function aLiveClaimHoldsTheBye({
  sourceMatchUpId,
  drawDefinition,
  drawPosition,
  loserMatchUp,
  matchUpsMap,
}: {
  drawDefinition: DrawDefinition;
  loserMatchUp: HydratedMatchUp;
  sourceMatchUpId?: string;
  matchUpsMap?: MatchUpsMap;
  drawPosition: number;
}): boolean {
  const structureId = loserMatchUp.structureId;
  const { positionAssignments } = getPositionAssignments({ drawDefinition, structureId });
  if (!positionAssignments?.find((assignment) => assignment.drawPosition === drawPosition)?.bye) return false;
  const drawMatchUps = matchUpsMap?.drawMatchUps ?? getMatchUpsMap({ drawDefinition }).drawMatchUps;
  const stored = drawMatchUps.find((matchUp) => matchUp.matchUpId === loserMatchUp.matchUpId);
  return byeClaimSurvives({
    sideNumber: getDrawPositionSideNumber({ matchUp: stored, drawPosition, structureId, drawDefinition }),
    isStillDoubleExit: (claimantMatchUpId) =>
      isDoubleExit(drawMatchUps.find((matchUp) => matchUp.matchUpId === claimantMatchUpId)?.matchUpStatus),
    withdrawnSourceIds: sourceMatchUpId ? new Set([sourceMatchUpId]) : undefined,
    matchUp: stored,
  });
}

function handleLoserMatchUpRemoval({
  loserMatchUpDrawPositionIndex,
  inContextDrawMatchUps,
  tournamentRecord,
  sourceMatchUpId,
  drawDefinition,
  loserMatchUp,
  matchUpsMap,
  event,
  stack,
}): ResultType | void {
  const { drawPositions, roundNumber } = loserMatchUp;
  const claimed = (drawPosition: number) =>
    aLiveClaimHoldsTheBye({ sourceMatchUpId, drawDefinition, drawPosition, loserMatchUp, matchUpsMap });

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
    if (claimed(loserMatchUpDrawPosition)) return;

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
  if (claimed(loserMatchUpDrawPosition)) return;

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
