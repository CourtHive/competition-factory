import { modifyPositionAssignmentsNotice, modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { getLuckyDrawRoundStatus } from '@Query/drawDefinition/getLuckyDrawRoundStatus';
import { isLuckyBasedDraw } from '@Query/drawDefinition/isLuckyBasedDraw';
import { decorateResult } from '@Functions/global/decorateResult';
import { getDevContext } from '@Global/state/globalState';
import { isAdHoc } from '@Query/drawDefinition/isAdHoc';
import { isLucky } from '@Query/drawDefinition/isLucky';
import { findStructure } from '@Acquire/findStructure';

// constants
import { INVALID_VALUES, MISSING_DRAW_DEFINITION, MISSING_PARTICIPANT_ID } from '@Constants/errorConditionConstants';
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { LOSER, WIN_RATIO } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';

type LuckyDrawAdvancementArgs = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  /** Single lucky-loser participantId (legacy LUCKY_DRAW path, single LL per transition). */
  participantId?: string;
  /** Array of lucky-loser participantIds; required when a transition needs more than one LL
   *  (LUCKY_DRAW with an explicit `roundProfile` that stretches a round). */
  participantIds?: string[];
  structureId?: string;
  random?: () => number;
  roundNumber: number;
  event?: Event;
};

const stack = 'luckyDrawAdvancement';

/**
 * Advances participants from a completed round into the next round of a lucky draw.
 *
 * For pre-feed rounds: advances all winners + the selected lucky loser.
 * For non-pre-feed rounds: advances all winners (no loser selection needed).
 *
 * Works by assigning virtual drawPositions to next-round matchUps and creating
 * corresponding positionAssignment entries, which enables the standard scoring
 * flow to work for those matchUps.
 */
export function luckyDrawAdvancement({
  tournamentRecord,
  drawDefinition,
  participantId,
  participantIds,
  structureId,
  roundNumber,
  random,
  event,
}: LuckyDrawAdvancementArgs): ResultType {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  structureId = structureId || drawDefinition.structures?.[0]?.structureId;
  if (!structureId) return { error: INVALID_VALUES };

  const { structure } = findStructure({ drawDefinition, structureId });
  if (!structure) return { error: INVALID_VALUES };

  if (!isLuckyBasedDraw(drawDefinition.drawType) && !isLucky({ drawDefinition, structure })) {
    return decorateResult({ result: { error: INVALID_VALUES }, info: 'Not a lucky draw' });
  }

  // Get round status with participant info
  const statusResult = getLuckyDrawRoundStatus({ tournamentRecord, drawDefinition, structureId });
  if (statusResult.error) return statusResult;

  const roundStatus = statusResult.rounds?.find((r) => r.roundNumber === roundNumber);
  if (!roundStatus?.isComplete) {
    return decorateResult({ result: { error: INVALID_VALUES }, info: 'Round is not complete' });
  }

  // Normalize the lucky-loser selection: array form preferred; fall back to the
  // legacy scalar participantId. Profile-driven transitions can require 2+ LL.
  const luckyLoserIds = participantIds ?? (participantId ? [participantId] : []);

  // Validate count + eligibility when this round is a source of lucky losers
  if (roundStatus.needsLuckySelection) {
    if (!luckyLoserIds.length) return { error: MISSING_PARTICIPANT_ID };

    if (luckyLoserIds.length !== roundStatus.requiredLuckyLoserCount) {
      return decorateResult({
        result: { error: INVALID_VALUES },
        info: `Expected ${roundStatus.requiredLuckyLoserCount} lucky loser(s), got ${luckyLoserIds.length}`,
      });
    }

    if (new Set(luckyLoserIds).size !== luckyLoserIds.length) {
      return decorateResult({
        result: { error: INVALID_VALUES },
        info: 'Duplicate lucky loser participantIds',
      });
    }

    const eligibleIds = new Set((roundStatus.eligibleLosers ?? []).map((l) => l.participantId));
    const ineligible = luckyLoserIds.find((id) => !eligibleIds.has(id));
    if (ineligible) {
      return decorateResult({
        result: { error: INVALID_VALUES },
        info: `Participant ${ineligible} is not an eligible loser from this round`,
      });
    }
  }

  // Find next round matchUps sorted by roundPosition
  const nextRoundNumber = roundNumber + 1;
  const nextRoundMatchUps = (structure.matchUps ?? [])
    .filter((m) => m.roundNumber === nextRoundNumber)
    .sort((a, b) => (a.roundPosition || 0) - (b.roundPosition || 0));

  // Collect advancing participant IDs: winners in roundPosition order + lucky losers
  const winners = roundStatus.advancingWinners ?? [];
  const advancingParticipantIds = winners.map((w) => w.participantId);

  if (roundStatus.isPreFeedRound && luckyLoserIds.length) {
    placeLuckyLosers({
      advancingParticipantIds,
      nextRoundMatchUps,
      roundStatus,
      luckyLoserIds,
      winners,
      random,
    });
  }

  if (!nextRoundMatchUps.length) {
    return decorateResult({ result: { error: INVALID_VALUES }, info: 'No matchUps found in next round' });
  }

  const expectedCount = nextRoundMatchUps.length * 2;
  if (advancingParticipantIds.length !== expectedCount) {
    return decorateResult({
      result: { error: INVALID_VALUES },
      info: `Expected ${expectedCount} advancing participants, got ${advancingParticipantIds.length}`,
    });
  }

  let positionAssignments = structure.positionAssignments ?? [];
  positionAssignments = cleanupStalePositionAssignments({
    positionAssignments,
    nextRoundMatchUps,
    structure,
    roundNumber,
  });
  structure.positionAssignments = positionAssignments;

  const prepError = prepareNextRoundMatchUps({ nextRoundMatchUps, positionAssignments });
  if (prepError) return prepError;

  const tournamentId = tournamentRecord?.tournamentId;

  assignNextRoundPositions({
    advancingParticipantIds,
    positionAssignments,
    nextRoundMatchUps,
    drawDefinition,
    roundNumber,
    roundStatus,
    luckyLoserIds,
    tournamentId,
    structureId,
    structure,
  });

  modifyPositionAssignmentsNotice({
    drawDefinition,
    tournamentId,
    structure,
    event,
  });

  if (roundStatus.isPreFeedRound && luckyLoserIds.length) {
    handleDiscardedLosers({
      drawDefinition,
      tournamentRecord,
      roundStatus,
      luckyLoserIds,
      structureId,
      roundNumber,
      event,
    });
  }

  return { ...SUCCESS };
}

/**
 * Places discarded losers from a lucky draw pre-feed round into a linked
 * consolidation/playoff structure at the specified target round.
 */
function placeDiscardedLosers({
  drawDefinition,
  tournamentRecord,
  targetStructureId,
  targetRoundNumber,
  feedProfile,
  participantIds,
  event,
}: {
  drawDefinition: DrawDefinition;
  tournamentRecord?: Tournament;
  targetStructureId: string;
  targetRoundNumber: number;
  feedProfile?: string;
  participantIds: string[];
  event?: Event;
}): ResultType | undefined {
  const { structure: targetStructure } = findStructure({ drawDefinition, structureId: targetStructureId });
  if (!targetStructure) return { error: INVALID_VALUES };

  // AD_HOC target structures (finishingPosition=WIN_RATIO) don't use matchUps
  // or position assignments. Participants are already in drawDefinition.entries
  // and available for ad-hoc round generation.
  if (isAdHoc({ structure: targetStructure }) && targetStructure.finishingPosition === WIN_RATIO) {
    return { ...SUCCESS };
  }

  let targetMatchUps = (targetStructure.matchUps ?? [])
    .filter((m) => m.roundNumber === targetRoundNumber)
    .sort((a, b) => (a.roundPosition || 0) - (b.roundPosition || 0));

  let targetPositionAssignments = targetStructure.positionAssignments ?? [];
  const unfilledPositions: number[] = [];

  targetStructure.matchUps ??= [];
  if (targetMatchUps.length === 0) {
    createVirtualMatchUps({
      targetStructure,
      targetStructureId,
      targetRoundNumber,
      participantIds,
      unfilledPositions,
    });

    targetMatchUps = targetStructure.matchUps
      .filter((m) => m.roundNumber === targetRoundNumber)
      .sort((a, b) => (a.roundPosition || 0) - (b.roundPosition || 0));
  } else {
    findUnfilledPositions({
      targetMatchUps,
      targetPositionAssignments,
      targetStructure,
      unfilledPositions,
    });
  }

  // Order positions based on feedProfile
  if (feedProfile === 'BOTTOM_UP') {
    unfilledPositions.sort((a, b) => b - a);
  } else {
    unfilledPositions.sort((a, b) => a - b);
  }

  const tournamentId = tournamentRecord?.tournamentId;

  // Place each discarded loser into the next available position
  for (let i = 0; i < participantIds.length && i < unfilledPositions.length; i++) {
    const drawPosition = unfilledPositions[i];
    const participantId = participantIds[i];

    // Update existing empty assignment if present, otherwise append
    const existingAssignment = targetPositionAssignments.find(
      (a) => a.drawPosition === drawPosition && !a.participantId,
    );
    if (existingAssignment) {
      existingAssignment.participantId = participantId;
    } else {
      targetPositionAssignments.push({ drawPosition, participantId });
    }

    // Find which matchUp this position belongs to and notify
    const matchUp = targetMatchUps.find((m) => m.drawPositions?.includes(drawPosition));
    if (matchUp) {
      modifyMatchUpNotice({
        context: stack,
        drawDefinition,
        tournamentId,
        structureId: targetStructureId,
        matchUp,
      });
    }
  }

  targetStructure.positionAssignments = targetPositionAssignments;

  modifyPositionAssignmentsNotice({
    drawDefinition,
    tournamentId,
    structure: targetStructure,
    event,
  });

  return { ...SUCCESS };
}

function handleDiscardedLosers({
  drawDefinition,
  tournamentRecord,
  roundStatus,
  luckyLoserIds,
  structureId,
  roundNumber,
  event,
}) {
  const advancedSet = new Set<string>(luckyLoserIds);
  const discardedLosers = (roundStatus.eligibleLosers ?? [])
    .filter((l) => !advancedSet.has(l.participantId))
    .map((l) => l.participantId);

  if (!discardedLosers.length) return;

  const loserLinks = (drawDefinition.links ?? []).filter(
    (link) =>
      link.linkType === LOSER &&
      link.source.structureId === structureId &&
      (link.source.roundNumber || 1) === roundNumber,
  );

  for (const link of loserLinks) {
    const result = placeDiscardedLosers({
      drawDefinition,
      tournamentRecord,
      targetStructureId: link.target.structureId,
      targetRoundNumber: link.target.roundNumber,
      feedProfile: link.target.feedProfile,
      participantIds: discardedLosers,
      event,
    });
    if (result?.error && getDevContext()) {
      console.warn('Failed to place discarded losers in consolidation structure:', result.error);
    }
  }
}

function prepareNextRoundMatchUps({ nextRoundMatchUps, positionAssignments }): ResultType | undefined {
  for (const matchUp of nextRoundMatchUps) {
    const dps = matchUp.drawPositions;
    if (!dps?.length) continue;

    const assignedPositions = dps.filter((dp) => {
      if (!dp) return false;
      return positionAssignments.some((a) => a.drawPosition === dp && a.participantId);
    });

    if (assignedPositions.length) {
      return decorateResult({
        result: { error: INVALID_VALUES },
        info: 'Next round already has participants assigned',
      });
    }

    if (dps.some(Boolean)) {
      matchUp.drawPositions = [];
    }
    if (matchUp.matchUpStatus && matchUp.matchUpStatus !== 'TO_BE_PLAYED') {
      matchUp.matchUpStatus = undefined;
      matchUp.winningSide = undefined;
      matchUp.score = undefined;
    }
  }

  return undefined;
}

/**
 * Places one or more lucky losers into `advancingParticipantIds` (which starts
 * as the winners array in roundPosition order). Each LL is scored against
 * candidate insertion positions to (1) avoid the same half as the winner who
 * beat them, (2) prefer a different quarter, and (3) spread multiple LL across
 * halves rather than clustering. LL are placed sequentially; for the K-th LL,
 * the "working bracket size" is the array length after this insertion, which
 * is an approximation when later LL still need placement.
 */
function placeLuckyLosers({
  advancingParticipantIds,
  nextRoundMatchUps,
  roundStatus,
  luckyLoserIds,
  winners,
  random,
}: {
  advancingParticipantIds: string[];
  nextRoundMatchUps: any[];
  roundStatus: any;
  luckyLoserIds: string[];
  winners: any[];
  random?: () => number;
}) {
  const rng = random ?? Math.random;
  const numMatchUps = nextRoundMatchUps.length;
  const winnerIds = new Set(winners.map((w) => w.participantId));

  for (const llId of luckyLoserIds) {
    placeOneLuckyLoser({
      advancingParticipantIds,
      numMatchUps,
      roundStatus,
      winnerIds,
      winners,
      llId,
      rng,
    });
  }
}

function placeOneLuckyLoser({
  advancingParticipantIds,
  numMatchUps,
  roundStatus,
  winnerIds,
  winners,
  llId,
  rng,
}: {
  advancingParticipantIds: string[];
  numMatchUps: number;
  roundStatus: any;
  winnerIds: Set<string>;
  winners: any[];
  llId: string;
  rng: () => number;
}) {
  const luckyLoserInfo = roundStatus.eligibleLosers?.find((l: any) => l.participantId === llId);
  if (!luckyLoserInfo || numMatchUps <= 1) {
    advancingParticipantIds.push(llId);
    return;
  }

  const defeatingWinner = winners.find((w) => w.matchUpId === luckyLoserInfo.matchUpId);
  if (!defeatingWinner) {
    advancingParticipantIds.push(llId);
    return;
  }

  const defeatingWinnerIdx = advancingParticipantIds.indexOf(defeatingWinner.participantId);
  if (defeatingWinnerIdx < 0) {
    advancingParticipantIds.push(llId);
    return;
  }

  // working size = array length after this insertion; used for half/quarter math
  const workingMatchUps = (advancingParticipantIds.length + 1) / 2;
  const halfSplit = Math.ceil(workingMatchUps / 2);
  const quarterSplit = Math.max(1, Math.ceil(workingMatchUps / 4));

  const scored = scoreCandidatePositions({
    advancingParticipantIds,
    defeatingWinnerIdx,
    winnerIds,
    halfSplit,
    quarterSplit,
  });

  let minScore = Infinity;
  for (const c of scored) if (c.score < minScore) minScore = c.score;
  const bestPositions = scored.filter((c) => c.score === minScore).map((c) => c.p);
  const chosenP = bestPositions[Math.floor(rng() * bestPositions.length)];
  advancingParticipantIds.splice(chosenP, 0, llId);
}

function scoreCandidatePositions({
  advancingParticipantIds,
  defeatingWinnerIdx,
  winnerIds,
  halfSplit,
  quarterSplit,
}: {
  advancingParticipantIds: string[];
  defeatingWinnerIdx: number;
  winnerIds: Set<string>;
  halfSplit: number;
  quarterSplit: number;
}): { p: number; score: number }[] {
  const candidates: { p: number; score: number }[] = [];
  for (let p = 0; p <= advancingParticipantIds.length; p++) {
    const llMatchUp = Math.floor(p / 2);
    const winnerShifted = defeatingWinnerIdx + (p <= defeatingWinnerIdx ? 1 : 0);
    const winnerMatchUp = Math.floor(winnerShifted / 2);

    const llHalf = llMatchUp < halfSplit ? 0 : 1;
    const winnerHalf = winnerMatchUp < halfSplit ? 0 : 1;
    const llQuarter = Math.floor(llMatchUp / quarterSplit);
    const winnerQuarter = Math.floor(winnerMatchUp / quarterSplit);

    let score = 0;
    if (llHalf === winnerHalf) score += 100; // hard: same half as defeating winner
    if (llQuarter === winnerQuarter) score += 10; // soft: same quarter
    score +=
      countPriorLLsInHalf({ advancingParticipantIds, winnerIds, insertAtP: p, halfSplit, targetHalf: llHalf }) * 2;
    candidates.push({ p, score });
  }
  return candidates;
}

function countPriorLLsInHalf({
  advancingParticipantIds,
  winnerIds,
  insertAtP,
  halfSplit,
  targetHalf,
}: {
  advancingParticipantIds: string[];
  winnerIds: Set<string>;
  insertAtP: number;
  halfSplit: number;
  targetHalf: number;
}): number {
  let count = 0;
  for (let i = 0; i < advancingParticipantIds.length; i++) {
    if (winnerIds.has(advancingParticipantIds[i])) continue;
    const shiftedIdx = i < insertAtP ? i : i + 1;
    const otherMatchUp = Math.floor(shiftedIdx / 2);
    const otherHalf = otherMatchUp < halfSplit ? 0 : 1;
    if (otherHalf === targetHalf) count++;
  }
  return count;
}

function cleanupStalePositionAssignments({ positionAssignments, nextRoundMatchUps, structure, roundNumber }) {
  const nextRoundDrawPositions = new Set(nextRoundMatchUps.flatMap((m) => (m.drawPositions ?? []).filter(Boolean)));

  if (nextRoundDrawPositions.size) {
    const stalePositions: number[] = [];
    for (const dp of nextRoundDrawPositions) {
      const entries = positionAssignments.filter((a) => a.drawPosition === dp);
      const hasEmpty = entries.some((a) => !a.participantId && !a.bye);
      if (entries.length > 1 || hasEmpty) {
        stalePositions.push(dp as any);
      }
    }

    if (stalePositions.length) {
      const staleSet = new Set(stalePositions);
      positionAssignments = positionAssignments.filter((a) => !staleSet.has(a.drawPosition));
    }
  }

  const completedRoundPositions = new Set(
    (structure.matchUps ?? [])
      .filter((m) => m.roundNumber && m.roundNumber <= roundNumber)
      .flatMap((m) => m.drawPositions ?? [])
      .filter(Boolean),
  );
  positionAssignments = positionAssignments.filter((a) => {
    if (a.participantId || a.bye) return true;
    return completedRoundPositions.has(a.drawPosition);
  });

  return positionAssignments;
}

function assignNextRoundPositions({
  advancingParticipantIds,
  positionAssignments,
  nextRoundMatchUps,
  drawDefinition,
  roundNumber,
  roundStatus,
  luckyLoserIds,
  tournamentId,
  structureId,
  structure,
}) {
  const allAssignedPositions = new Set(positionAssignments.map((a) => a.drawPosition));
  const allMatchUpPositions = (structure.matchUps ?? []).flatMap((m) => m.drawPositions ?? []).filter(Boolean);
  const allPositions = [...allAssignedPositions, ...allMatchUpPositions];
  const maxPosition = allPositions.length ? Math.max(...allPositions) : 0;
  let nextPosition = maxPosition + 1;

  const llSet: Set<string> = new Set(luckyLoserIds ?? []);
  const tagLL = roundStatus.isPreFeedRound && llSet.size > 0;
  const luckyExtension = () => ({ name: 'luckyAdvancement', value: { fromRoundNumber: roundNumber } });

  for (let i = 0; i < nextRoundMatchUps.length; i++) {
    const matchUp = nextRoundMatchUps[i];
    const pos1 = nextPosition++;
    const pos2 = nextPosition++;
    const pid1 = advancingParticipantIds[i * 2];
    const pid2 = advancingParticipantIds[i * 2 + 1];

    matchUp.drawPositions = [pos1, pos2];

    const assignment1: any = { drawPosition: pos1, participantId: pid1 };
    const assignment2: any = { drawPosition: pos2, participantId: pid2 };

    if (tagLL) {
      if (llSet.has(pid1)) assignment1.extensions = [luckyExtension()];
      if (llSet.has(pid2)) assignment2.extensions = [luckyExtension()];
    }

    positionAssignments.push(assignment1, assignment2);

    modifyMatchUpNotice({
      context: stack,
      drawDefinition,
      tournamentId,
      structureId,
      matchUp,
    });
  }

  structure.positionAssignments = positionAssignments;
}

function createVirtualMatchUps({
  targetStructure,
  targetStructureId,
  targetRoundNumber,
  participantIds,
  unfilledPositions,
}) {
  const matchUpCount = Math.ceil(participantIds.length / 2);
  let nextPosition = 1;

  for (let i = 0; i < matchUpCount; i++) {
    const pos1 = nextPosition++;
    const pos2 = nextPosition++;
    const matchUp: any = {
      matchUpId: `${targetStructureId}-mu-${i + 1}`,
      roundNumber: targetRoundNumber,
      roundPosition: i + 1,
      drawPositions: [pos1, pos2],
      matchUpStatus: 'TO_BE_PLAYED',
    };
    targetStructure.matchUps.push(matchUp);
    unfilledPositions.push(pos1, pos2);
  }
}

function findUnfilledPositions({ targetMatchUps, targetPositionAssignments, targetStructure, unfilledPositions }) {
  for (const matchUp of targetMatchUps) {
    for (const dp of matchUp.drawPositions ?? []) {
      if (!dp) continue;
      const assignment = targetPositionAssignments.find((a) => a.drawPosition === dp);
      if (!assignment?.participantId && !assignment?.bye) {
        unfilledPositions.push(dp);
      }
    }
  }

  if (!unfilledPositions.length) {
    const assignedDrawPositions = new Set(
      targetPositionAssignments.filter((a) => a.participantId).map((a) => a.drawPosition),
    );
    const livePositions = (targetStructure.matchUps ?? [])
      .flatMap((m) => m.drawPositions ?? [])
      .filter((dp) => dp && assignedDrawPositions.has(dp));
    const allLive = [...assignedDrawPositions, ...livePositions];
    let nextPosition = allLive.length ? Math.max(...allLive) + 1 : 1;

    for (const matchUp of targetMatchUps) {
      if (!matchUp.drawPositions?.length || !matchUp.drawPositions.some(Boolean)) {
        const pos1 = nextPosition++;
        const pos2 = nextPosition++;
        matchUp.drawPositions = [pos1, pos2];
        unfilledPositions.push(pos1, pos2);
      }
    }
  }
}
