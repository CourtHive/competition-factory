import { generateOutcomeFromScoreString } from '@Assemblies/generators/mocks/generateOutcomeFromScoreString';
import { assignTieMatchUpParticipantId } from '@Mutate/matchUps/lineUps/assignTieMatchUpParticipant';
import { automatedPlayoffPositioning } from '@Mutate/drawDefinitions/automatedPlayoffPositioning';
import { getLuckyDrawRoundStatus } from '@Query/drawDefinition/getLuckyDrawRoundStatus';
import { generateLineUps } from '@Assemblies/generators/participants/generateLineUps';
import { isMatchUpEventType } from '@Helpers/matchUpEventTypes/isMatchUpEventType';
import { setMatchUpStatus } from '@Mutate/matchUps/matchUpStatus/setMatchUpStatus';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { getParticipants } from '@Query/participants/getParticipants';
import { matchUpsOf, structuresOf } from '@Acquire/structureMembers';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { structureSort } from '@Functions/sorters/structureSort';
import { matchUpSort } from '@Functions/sorters/matchUpSort';
import { getMatchUpId } from '@Functions/global/extractors';
import { coercedGender } from '@Helpers/coercedGender';
import { generateOutcome } from './generateOutcome';
import { isGendered } from '@Validators/isGendered';
import { isMixed } from '@Validators/isMixed';
import { intersection } from '@Tools/arrays';

// constants and types
import { MAIN, PLAY_OFF, QUALIFYING, WIN_RATIO } from '@Constants/drawDefinitionConstants';
import { ErrorType, INVALID_VALUES, MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { setFirstClassOrExtension } from '@Mutate/extensions/setFirstClassOrExtension';
import { addParticipants } from '@Mutate/participants/addParticipants';
import { DOUBLES, SINGLES, TEAM } from '@Constants/matchUpTypes';
import type { DrawDefinition, Structure } from '@Types/tournamentTypes';
import { FEMALE, MALE } from '@Constants/genderConstants';
import { LINEUPS } from '@Constants/extensionConstants';
import { ASCENDING } from '@Constants/sortingConstants';
import type { HydratedMatchUp } from '@Types/hydrated';
import { SUCCESS } from '@Constants/resultConstants';
import { RANKING } from '@Constants/scaleConstants';
import {
  ABANDONED,
  BYE,
  CANCELLED,
  COMPLETED,
  DEAD_RUBBER,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
} from '@Constants/matchUpStatusConstants';

// Helper to assign participants for dual matchups
function assignParticipantsToDualMatchUps({ firstRoundDualMatchUps, event, tournamentRecord, drawDefinition }) {
  const categoryName = event?.category?.ageCategoryCode || event?.category?.categoryName;
  if (categoryName) {
    const scaleAccessor = {
      scaleName: categoryName,
      sortOrder: ASCENDING,
      scaleType: RANKING,
    };
    const result = generateLineUps({
      singlesOnly: true,
      tournamentRecord,
      drawDefinition,
      scaleAccessor,
      event,
    });
    if (result.error) return result;
    const { lineUps, participantsToAdd } = result;
    addParticipants({ tournamentRecord, participants: participantsToAdd });
    setFirstClassOrExtension({ element: drawDefinition, attribute: 'lineUps', name: LINEUPS, value: lineUps });
    return undefined;
  }
  const structureId = firstRoundDualMatchUps[0]?.structureId;
  const { positionAssignments } = getPositionAssignments({
    drawDefinition,
    structureId,
  });

  if (!positionAssignments?.length) return;
  const { participants: teamParticipants } = getParticipants({
    participantFilters: { participantTypes: [TEAM] },
    tournamentRecord,
  });

  function findTeamParticipantByDrawPosition(drawPosition) {
    return teamParticipants?.find((teamParticipant) => {
      const { participantId } = teamParticipant;
      const assignment = positionAssignments.find((assignment) => assignment.participantId === participantId);
      return assignment?.drawPosition === drawPosition;
    });
  }

  // persons, to choose each collection's players by its gender
  const sexByParticipantId = new Map<string, string | undefined>(
    (tournamentRecord.participants ?? []).map((participant) => [participant.participantId, participant.person?.sex]),
  );

  // an inContext tieMatchUp does not always carry its collection's gender; the definition does
  const collectionGenders = new Map<string, string | undefined>(
    (drawDefinition.tieFormat ?? event?.tieFormat)?.collectionDefinitions?.map((collectionDefinition) => [
      collectionDefinition.collectionId,
      collectionDefinition.gender,
    ]) ?? [],
  );

  for (const dualMatchUp of firstRoundDualMatchUps) {
    // per side and matchUpType, the individuals already placed in this dual: a player is used once in
    // its singles and once in its doubles, which is the index rule this replaces for ungendered formats
    const placed = new Map<string, Set<string>>();
    const tieMatchUps = [
      ...dualMatchUp.tieMatchUps.filter(isMatchUpEventType(SINGLES)),
      ...dualMatchUp.tieMatchUps.filter(isMatchUpEventType(DOUBLES)),
    ];

    for (const tieMatchUp of tieMatchUps) {
      const result = assignTieMatchUpSides({
        gender: tieMatchUp.gender ?? collectionGenders.get(tieMatchUp.collectionId),
        findTeamParticipantByDrawPosition,
        sexByParticipantId,
        tournamentRecord,
        drawDefinition,
        tieMatchUp,
        placed,
        event,
      });
      if (result?.error) return result;
    }
  }
  return undefined;
}

function assignTieMatchUpSides({
  findTeamParticipantByDrawPosition,
  gender,
  sexByParticipantId,
  tournamentRecord,
  drawDefinition,
  tieMatchUp,
  placed,
  event,
}) {
  const isDoubles = isMatchUpEventType(DOUBLES)(tieMatchUp.matchUpType);
  for (const side of tieMatchUp.sides ?? []) {
    const teamParticipant = findTeamParticipantByDrawPosition(side.drawPosition);
    if (!teamParticipant) continue;

    const key = `${side.drawPosition}|${isDoubles ? DOUBLES : SINGLES}`;
    if (!placed.has(key)) placed.set(key, new Set());
    const used = placed.get(key);

    const participantIds = chooseLineUpIndividuals({
      individualParticipantIds: teamParticipant.individualParticipantIds ?? [],
      needed: isDoubles ? 2 : 1,
      gender,
      sexByParticipantId,
      used,
    });

    for (const participantId of participantIds) {
      const result = assignTieMatchUpParticipantId({
        teamParticipantId: teamParticipant.participantId,
        tieMatchUpId: tieMatchUp.matchUpId,
        tournamentRecord,
        drawDefinition,
        participantId,
        event,
      });
      if (result?.error) return result;
      used.add(participantId);
    }
  }
  return undefined;
}

/**
 * The team members a tieMatchUp side gets: as many as it `needed`, of the collection's gender, one of
 * each sex for MIXED, and not already `used` by this side in the dual's matchUps of the same type.
 *
 * Before, singles took the i-th member and doubles the i-th pair BY INDEX, whatever the collection's
 * gender; the engine refused every mismatch ("Gender mismatch", "Mixed doubles pair requires one
 * participant of each gender") and the refusal was discarded, so gendered TEAM fixtures carried
 * first-round tieMatchUps with unassigned sides (182 refusals across the suite, 2026-10-17). For an
 * ungendered collection this chooses exactly what the index rule chose.
 */
function chooseLineUpIndividuals({
  individualParticipantIds,
  sexByParticipantId,
  needed,
  gender,
  used,
}: {
  sexByParticipantId: Map<string, string | undefined>;
  individualParticipantIds: string[];
  gender?: string;
  used: Set<string>;
  needed: number;
}): string[] {
  const sexOf = (participantId: string) => coercedGender(sexByParticipantId.get(participantId));
  const unused = individualParticipantIds.filter((participantId) => !used.has(participantId));
  const ofSex = (sex) => unused.filter((participantId) => sexOf(participantId) === sex);

  if (isGendered(gender)) return ofSex(coercedGender(gender)).slice(0, needed);
  if (isMixed(gender) && needed === 2) {
    const [male] = ofSex(MALE);
    const [female] = ofSex(FEMALE);
    return male && female ? [male, female] : [];
  }
  return unused.slice(0, needed);
}

// played, or settled without being played: anything else is still to play
const SETTLED_STATUSES = new Set<string>([BYE, DOUBLE_WALKOVER, DOUBLE_DEFAULT, DEAD_RUBBER, ABANDONED, CANCELLED]);

function remainingMatchUps(drawDefinition: DrawDefinition): number {
  return (getAllDrawMatchUps({ drawDefinition, inContext: true }).matchUps ?? []).filter(
    (matchUp) =>
      !matchUp.winningSide && !SETTLED_STATUSES.has(matchUp.matchUpStatus as string) && !matchUp.collectionId,
  ).length;
}

// Helper to complete matchups for a structure
function completeStructureMatchUps({
  structure,
  matchUpsMap,
  drawDefinition,
  tournamentRecord,
  event,
  matchUpStatusProfile,
  matchUpFormat,
  matchUpStatus,
  scoreString,
  randomWinningSide,
  completionGoal,
  completedCount,
  roundNumber: roundNumberFilter,
  maxRoundNumber,
  leafStructureIds,
  random,
}) {
  const matchUps = getAllStructureMatchUps({
    contextFilters: { matchUpTypes: [DOUBLES, SINGLES] },
    afterRecoveryTimes: false,
    tournamentRecord,
    inContext: true,
    drawDefinition,
    matchUpsMap,
    structure,
    event,
  }).matchUps;

  const sortedMatchUpIds = matchUps
    .filter(
      ({ winningSide, roundNumber, structureId }) =>
        !winningSide &&
        (!roundNumberFilter || roundNumber === roundNumberFilter) &&
        (!maxRoundNumber || (roundNumber ?? 0) <= maxRoundNumber) &&
        (!leafStructureIds || leafStructureIds.includes(structureId)),
    )
    .sort(matchUpSort)
    .map(getMatchUpId);

  /**
   * The structure is re-read (hydrated) once per ROUND, not once per matchUp. Within a structure a round's
   * matchUps do not depend on one another: completing one advances its winner into the NEXT round, so the
   * readiness and sides of its siblings read before it are the readiness and sides they still have.
   * Re-reading per matchUp made completion quadratic (measured 2026-10-18: 1.8 s at 32, 7.7 s at 64, 32 s at
   * 128). The exception is a TEAM dual's tieMatchUps, where one result can decide the dual for the
   * others: those are still read one by one. The outcome draws keep their order, so the record is the same.
   */
  const roundKeyOf = new Map(
    matchUps.map((matchUp) => [matchUp.matchUpId, matchUp.matchUpTieId ? undefined : String(matchUp.roundNumber)]),
  );
  let readRound: string | undefined;
  let roundMatchUps: HydratedMatchUp[] = [];

  for (const matchUpId of sortedMatchUpIds) {
    if (!Number.isNaN(Number(completionGoal)) && completedCount.value >= completionGoal) break;

    const roundKey = roundKeyOf.get(matchUpId);
    if (roundKey === undefined || roundKey !== readRound) {
      roundMatchUps = getAllStructureMatchUps({
        matchUpFilters: { matchUpTypes: [DOUBLES, SINGLES] },
        afterRecoveryTimes: false,
        tournamentRecord,
        inContext: true,
        drawDefinition,
        matchUpsMap,
        structure,
        event,
      }).matchUps;
      readRound = roundKey;
    }

    const targetMatchUp = roundMatchUps.find((matchUp) => matchUp.matchUpId === matchUpId);

    const isDoubleExit =
      targetMatchUp?.matchUpStatus !== undefined &&
      [DOUBLE_WALKOVER, DOUBLE_DEFAULT].includes(targetMatchUp.matchUpStatus);

    if (targetMatchUp?.readyToScore && !isDoubleExit) {
      const winningSide = !randomWinningSide && 1;
      const result = smartComplete({
        matchUpStatusProfile,
        tournamentRecord,
        drawDefinition,
        targetMatchUp,
        matchUpFormat,
        matchUpStatus,
        scoreString,
        winningSide,
        random,
        event,
      });

      if (result?.error) return result;

      completedCount.value += 1;
    }
  }
  return undefined;
}

export function completeDrawMatchUps(params): {
  awaitingLuckySelection?: LuckySelection[];
  completeRoundRobinPlayoffs?: boolean;
  completedCount?: number;
  remainingCount?: number;
  success?: boolean;
  error?: ErrorType;
} {
  const {
    matchUpStatusProfile,
    completeAllMatchUps,
    roundsToComplete,
    randomWinningSide,
    tournamentRecord,
    completionGoal,
    drawDefinition,
    roundNumber,
    stageSequence,
    random,
    stage,
    event,
  } = params;

  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  const matchUpFormat = params.matchUpFormat || drawDefinition.matchUpFormat || event?.matchUpFormat;
  const sortedStructures = drawDefinition.structures.slice().sort(structureSort);
  const completedCount = { value: 0 };

  const { matchUps: firstRoundDualMatchUps } = getAllDrawMatchUps({
    matchUpFilters: { matchUpTypes: [TEAM], roundNumbers: [1] },
    contextFilters: { stages: [MAIN, QUALIFYING] },
    inContext: true,
    drawDefinition,
  });

  if (firstRoundDualMatchUps?.length) {
    const result = assignParticipantsToDualMatchUps({
      firstRoundDualMatchUps,
      event,
      tournamentRecord,
      drawDefinition,
    });
    if (result?.error) return result;
  }

  const scoreString = typeof completeAllMatchUps === 'string' && completeAllMatchUps;
  const matchUpStatus = scoreString && COMPLETED;

  const isRoundRobinWithPlayoff = roundRobinWithPlayoff(sortedStructures);

  /**
   * `structureIds` narrows completion to named structures. Omitted, every structure is completed,
   * which is the long-standing behaviour and the default.
   *
   * Added for TMX's "Complete all matchUps" control, which is scoped to the STRUCTURE a director is
   * looking at. TMX had its own loop for that, and that loop filtered incomplete matchUps as
   * `!winningSide && matchUpStatus !== BYE` — so a DOUBLE_WALKOVER, which has no winningSide, was
   * OVERWRITTEN with an ordinary result. This function already excludes double exits (see
   * `isDoubleExit` below), so giving it the one thing it lacked lets that duplicate go away rather
   * than be repaired.
   *
   * Filtered alongside the existing `stage` / `stageSequence` narrowing in the same loop, so the
   * three compose: an unknown id simply matches nothing.
   */
  const requestedStructureIds = params.structureIds;
  /**
   * A requested id matches a top-level structure EITHER by its own id OR by one of its CHILD
   * structure ids.
   *
   * Round-robin matchUps belong to the child groups, not to the CONTAINER, so a caller holding a
   * group's id is holding the id of the thing it actually wants to complete. Matching only
   * top-level ids made that silently complete NOTHING — measured: ROUND_ROBIN 16, container id ->
   * 24 completed, the four child ids -> 0. A filter whose wrong answer is silence is the worst
   * shape available, and TMX's own loop resolves containers to children exactly this way, so the
   * first port of it would have hit this.
   */
  const structureIds = sortedStructures
    .filter(
      (structure) =>
        !requestedStructureIds?.length ||
        requestedStructureIds.includes(structure.structureId) ||
        (structure.structures ?? []).some((child) => requestedStructureIds.includes(child.structureId)),
    )
    .map(({ structureId }) => structureId);

  /**
   * ...but matching a container BY a child id must not widen the request to the whole container.
   * Completion reads every matchUp of the container, so without a leaf scope one round-robin group
   * completed all of them — measured: ROUND_ROBIN 16, one child id -> 24 completed across four
   * groups. Named by its own id, a container still completes every group; named by child ids, only
   * those children's matchUps (inContext they carry the CHILD's structureId) are completed.
   */
  const getLeafStructureIds = (structure: {
    structureId: string;
    structures?: { structureId: string }[];
  }): string[] | undefined => {
    if (!requestedStructureIds?.length || requestedStructureIds.includes(structure.structureId)) return undefined;
    return (structure.structures ?? [])
      .map((child) => child.structureId)
      .filter((childId) => requestedStructureIds.includes(childId));
  };

  // fixed before anything is played, so the rounds a call completes are counted from where it started
  const roundBounds = roundBoundsOf({ sortedStructures, structureIds, roundsToComplete, getLeafStructureIds });
  if (roundBounds.error) return roundBounds;

  // Multi-pass loop: after each pass, cross-structure advancement (via directParticipants)
  // may populate positions in downstream structures, making new matchUps ready to complete.
  // This is necessary for DOUBLE_ELIMINATION where the main final and decider depend on
  // participants advancing from the consolation/backdraw structure.
  // The matchUpsMap must be refreshed each pass to reflect updated draw positions.
  const maxPasses = 10;
  let passCount = 0;
  let previousCompleted = -1;
  while (
    completedCount.value > previousCompleted &&
    (completionGoal === undefined || completedCount.value < completionGoal) &&
    passCount < maxPasses
  ) {
    passCount++;
    previousCompleted = completedCount.value;

    // Refresh matchUpsMap to reflect cross-structure position assignments from prior pass
    const { matchUpsMap: refreshedMap } = getAllDrawMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM], roundNumbers: [1] },
      contextFilters: { stages: [MAIN, QUALIFYING] },
      inContext: true,
      drawDefinition,
    });

    for (const structureId of structureIds) {
      if (completedCount.value >= completionGoal) break;
      const structure = drawDefinition.structures.find((structure) => structure.structureId === structureId);

      if (stage && structure.stage !== stage) continue;
      if (stageSequence && structure.stageSequence !== stageSequence) continue;

      const result = completeStructureMatchUps({
        structure,
        matchUpsMap: refreshedMap,
        drawDefinition,
        tournamentRecord,
        event,
        matchUpStatusProfile,
        matchUpFormat,
        matchUpStatus,
        scoreString,
        randomWinningSide,
        completionGoal,
        completedCount,
        roundNumber,
        maxRoundNumber: roundBounds.bounds?.get(structureId),
        leafStructureIds: getLeafStructureIds(structure),
        random,
      });
      if (result?.error) return result;

      if (isRoundRobinWithPlayoff && structure.finishingPosition === WIN_RATIO && params.completeRoundRobinPlayoffs) {
        automatedPlayoffPositioning({
          structureId: structure.structureId,
          applyPositioning: true,
          drawDefinition,
        });
      }
    }
  }

  // the certificate: what is still to play. `success` says the calls succeeded, not that the draw is done
  return {
    ...SUCCESS,
    completedCount: completedCount.value,
    remainingCount: remainingMatchUps(drawDefinition),
    ...luckySelections(drawDefinition, structureIds),
  };
}

type LuckySelection = { structureId: string; roundNumber: number };

function roundRobinWithPlayoff(sortedStructures: Structure[]): boolean {
  return (
    sortedStructures.length === 2 &&
    sortedStructures[0].finishingPosition === WIN_RATIO &&
    intersection(
      sortedStructures.map(({ stage }) => stage),
      [MAIN, PLAY_OFF],
    ).length === 2
  );
}

type RoundBoundsArgs = {
  getLeafStructureIds: (structure: Structure) => string[] | undefined;
  sortedStructures: Structure[];
  roundsToComplete?: number;
  structureIds: string[];
};

/**
 * `roundsToComplete`: per structure, the last round a call may complete, counted from the structure's
 * first round with a matchUp still to play (for a round robin, across the groups in scope). Rounds that
 * become playable during the call, in this structure or one it feeds, are completed up to that bound.
 */
function roundBoundsOf({ sortedStructures, structureIds, roundsToComplete, getLeafStructureIds }: RoundBoundsArgs): {
  bounds?: Map<string, number>;
  error?: ErrorType;
} {
  if (roundsToComplete === undefined) return {};
  if (!Number.isInteger(roundsToComplete) || roundsToComplete < 1) return { error: INVALID_VALUES };

  const bounds = new Map<string, number>();
  for (const structure of sortedStructures.filter(({ structureId }) => structureIds.includes(structureId))) {
    const leafStructureIds = getLeafStructureIds(structure);
    const children = structuresOf(structure);
    const scopes = children
      ? children.filter(({ structureId }) => !leafStructureIds || leafStructureIds.includes(structureId))
      : [structure];
    const openRounds = scopes
      .flatMap((scope) => matchUpsOf(scope) ?? [])
      .filter((matchUp) => !matchUp.winningSide && !SETTLED_STATUSES.has(matchUp.matchUpStatus as string))
      .map(({ roundNumber }) => roundNumber ?? 0);
    // a structure with nothing left to play gets a bound that admits nothing
    bounds.set(structure.structureId, openRounds.length ? Math.min(...openRounds) + roundsToComplete - 1 : -1);
  }
  return { bounds };
}

/**
 * Where completion stopped for a lucky loser choice: `{ awaitingLuckySelection }`, or nothing.
 *
 * Completion never makes that choice. A round fed by a lucky loser keeps an open position until one is
 * placed, so none of its matchUps is ready and the driver stops there by itself (measured across lucky
 * draws of 5 to 48). This names the round, so a caller can hand the choice to whoever makes it.
 */
function luckySelections(
  drawDefinition: DrawDefinition,
  structureIds: string[],
): { awaitingLuckySelection?: LuckySelection[] } {
  const awaitingLuckySelection: LuckySelection[] = structureIds.flatMap((structureId) => {
    const round = getLuckyDrawRoundStatus({ drawDefinition, structureId }).rounds?.find(
      ({ needsLuckySelection }) => needsLuckySelection,
    );
    return round ? [{ structureId, roundNumber: round.roundNumber }] : [];
  });
  return awaitingLuckySelection.length ? { awaitingLuckySelection } : {};
}

export function completeDrawMatchUp(params) {
  const {
    matchUpStatusCodes,
    policyDefinitions,
    tournamentRecord,
    drawDefinition,
    targetMatchUp,
    matchUpStatus,
    matchUpFormat,
    scoreString,
    winningSide,
    event,
  } = params;
  if (!targetMatchUp || targetMatchUp.matchUpStatus === BYE) {
    return;
  }
  const { matchUpId } = targetMatchUp ?? {};

  const { outcome } = generateOutcomeFromScoreString({
    matchUpFormat,
    matchUpStatus,
    scoreString,
    winningSide,
  });

  if (matchUpStatusCodes) outcome.matchUpStatusCodes = matchUpStatusCodes;

  return setMatchUpStatus({
    tournamentRecord,
    policyDefinitions,
    drawDefinition,
    matchUpFormat,
    matchUpId,
    outcome,
    event,
  });
}

// NOTE: matchUpFormat must come from collectionDefinition in TEAM events
function smartComplete(params) {
  const {
    matchUpStatusProfile = {},
    tournamentRecord,
    policyDefinitions,
    drawDefinition,
    matchUpStatus,
    matchUpFormat,
    targetMatchUp,
    scoreString,
    winningSide,
    random,
    event,
  } = params;

  const resolvedFormat = targetMatchUp?.matchUpFormat || matchUpFormat;

  if (scoreString || matchUpStatus) return completeDrawMatchUp({ ...params, matchUpFormat: resolvedFormat });

  const { matchUpId } = targetMatchUp ?? {};
  const generatedResult: any = generateOutcome({
    matchUpStatusProfile,
    matchUpFormat: resolvedFormat,
    winningSide,
    random,
  });
  // a refused outcome is the completion's error: passed on, `setMatchUpStatus` received `outcome:
  // undefined` and refused with an error that named the status rather than the format
  if (generatedResult.error) return generatedResult;
  const { outcome } = generatedResult;

  return setMatchUpStatus({
    policyDefinitions,
    tournamentRecord,
    drawDefinition,
    matchUpFormat: resolvedFormat,
    matchUpId,
    outcome,
    event,
  });
}
