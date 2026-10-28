import { generateOutcomeFromScoreString } from '@Generators/simulation/generateOutcomeFromScoreString';
import { automatedPlayoffPositioning } from '@Mutate/drawDefinitions/automatedPlayoffPositioning';
import { getLuckyDrawRoundStatus } from '@Query/drawDefinition/getLuckyDrawRoundStatus';
import { generateLineUps } from '@Assemblies/generators/participants/generateLineUps';
import { setMatchUpStatus } from '@Mutate/matchUps/matchUpStatus/setMatchUpStatus';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { generateOutcome } from '@Generators/simulation/generateOutcome';
import { recordSetMatchUpStatus, recorded } from './scenarioRecorder';
import { matchUpsOf, structuresOf } from '@Acquire/structureMembers';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { structureSort } from '@Functions/sorters/structureSort';
import { matchUpSort } from '@Functions/sorters/matchUpSort';
import { getMatchUpId } from '@Functions/global/extractors';
import { intersection } from '@Tools/arrays';

// writes logged when a scenario is recorded (see scenarioRecorder)
const automatedPlayoffPositioningRecorded = recorded('automatedPlayoffPositioning', automatedPlayoffPositioning);
const generateLineUpsRecorded = recorded('generateLineUps', generateLineUps);

// constants and types
import { MAIN, PLAY_OFF, QUALIFYING, WIN_RATIO } from '@Constants/drawDefinitionConstants';
import { ErrorType, INVALID_VALUES, MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import type { DrawDefinition, Structure } from '@Types/tournamentTypes';
import { DOUBLES, SINGLES, TEAM } from '@Constants/matchUpTypes';
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

/**
 * A TEAM draw's lineUps, through the public `generateLineUps` with `attach`: each team's players from its own
 * roster (by the event category's ranking when it has one, else in roster order), by collection gender, at most
 * one singles position each, and never a player who belongs to another team of the event. The lineUps are written
 * to the draw (with its change notice) and the pairs they need are added.
 *
 * Before, a draw without a category assigned players per first-round tieMatchUp instead (CA 2026-10-29: through
 * the public method; the record changes shape, part of the one regeneration of seeded records).
 */
function assignDrawLineUps({ event, tournamentRecord, drawDefinition }) {
  const categoryName = event?.category?.ageCategoryCode || event?.category?.categoryName;
  const scaleAccessor = categoryName ? { scaleName: categoryName, sortOrder: ASCENDING, scaleType: RANKING } : {};
  const result = generateLineUpsRecorded({
    exclusiveSingles: true,
    singlesOnly: true,
    tournamentRecord,
    drawDefinition,
    scaleAccessor,
    attach: true,
    event,
  });
  return result.error ? result : undefined;
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
    const result = assignDrawLineUps({ event, tournamentRecord, drawDefinition });
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
        maxRoundNumber: roundBounds.maxRoundNumbers?.get(structureId),
        leafStructureIds: getLeafStructureIds(structure),
        random,
      });
      if (result?.error) return result;

      if (isRoundRobinWithPlayoff && structure.finishingPosition === WIN_RATIO && params.completeRoundRobinPlayoffs) {
        automatedPlayoffPositioningRecorded({
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
  maxRoundNumbers?: Map<string, number>;
  error?: ErrorType;
} {
  if (roundsToComplete === undefined) return {};
  if (!Number.isInteger(roundsToComplete) || roundsToComplete < 1) return { error: INVALID_VALUES };

  const maxRoundNumbers = new Map<string, number>();
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
    maxRoundNumbers.set(structure.structureId, openRounds.length ? Math.min(...openRounds) + roundsToComplete - 1 : -1);
  }
  return { maxRoundNumbers };
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

  recordSetMatchUpStatus({ policyDefinitions, drawDefinition, matchUpFormat, matchUpId, outcome });
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

  recordSetMatchUpStatus({ policyDefinitions, drawDefinition, matchUpFormat: resolvedFormat, matchUpId, outcome });
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
