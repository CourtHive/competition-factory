import { generateOutcomeFromScoreString } from '@Generators/mocks/generateOutcomeFromScoreString';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { setMatchUpStatus } from '@Mutate/matchUps/matchUpStatus/setMatchUpStatus';
import { allDrawMatchUps } from '@Query/matchUps/getAllDrawMatchUps';
import { intersection } from '@Tools/arrays';

// constants and types
import type { DrawDefinition, Event, MatchUpStatusUnion, StageTypeUnion, Tournament } from '@Types/tournamentTypes';
import { DRAW_DEFINITION, ERROR, VALIDATE } from '@Constants/attributeConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { BYE, COMPLETED } from '@Constants/matchUpStatusConstants';
import { MAIN } from '@Constants/drawDefinitionConstants';
import type { HydratedMatchUp } from '@Types/hydrated';
import type { ResultType } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';

/**
 * One outcome, located by draw coordinates rather than by matchUpId.
 *
 * Every coordinate given must match; those omitted match anything, except `stage` (MAIN) and
 * `stageSequence` (1), which default. When several matchUps match, `matchUpIndex` picks one (the
 * first by default), in the order `allDrawMatchUps` returns them.
 */
export type DrawOutcome = {
  stage?: StageTypeUnion;
  stageSequence?: number;
  /** the structure itself */
  structureId?: string;
  structureName?: string;
  /** the n-th structure (1-based) in draw order, counting each round robin group: for groups, the group number */
  structureOrder?: number;
  roundNumber?: number;
  roundPosition?: number;
  /** both positions, as they stand when this outcome is reached */
  drawPositions?: number[];
  matchUpIndex?: number;

  scoreString?: string;
  winningSide?: number;
  matchUpStatus?: MatchUpStatusUnion;
  matchUpStatusCodes?: unknown[];
  matchUpFormat?: string;
};

export type ApplyOutcomesArgs = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  outcomes: DrawOutcome[];
  event?: Event;
};

export type OutcomeSkip = { index: number; reason: 'NOT_FOUND' | 'BYE' };

/**
 * Records outcomes on a draw's matchUps by draw coordinates, each through `setMatchUpStatus`, in the
 * order given, so a later outcome can name a matchUp an earlier one filled.
 *
 * An outcome whose coordinates match nothing, or match a BYE, is not an error: it is reported in
 * `skipped` (by its index in `outcomes`) and the rest are applied. A refused outcome stops the call
 * and returns `setMatchUpStatus`'s error; the outcomes before it stay applied.
 */
export function applyOutcomes(
  params: ApplyOutcomesArgs,
): ResultType & { appliedMatchUpIds?: string[]; skipped?: OutcomeSkip[] } {
  const paramsCheck = checkRequiredParameters(params, [
    { [DRAW_DEFINITION]: true },
    { outcomes: true, [VALIDATE]: (value: unknown) => Array.isArray(value), [ERROR]: INVALID_VALUES },
  ]);
  if (paramsCheck.error) return paramsCheck;
  const { tournamentRecord, drawDefinition, outcomes, event } = params;

  const appliedMatchUpIds: string[] = [];
  const skipped: OutcomeSkip[] = [];

  // coordinates are fixed when a draw is generated, so one hydration serves every outcome; only a
  // `drawPositions` target reads what earlier outcomes changed, and it re-reads the draw first
  let matchUps = hydrate();
  let changed = false;

  for (const [index, outcomeDef] of outcomes.entries()) {
    if (outcomeDef.drawPositions && changed) {
      matchUps = hydrate();
      changed = false;
    }
    const targetMatchUp = locate(matchUps, outcomeDef);
    if (!targetMatchUp || targetMatchUp.matchUpStatus === BYE) {
      skipped.push({ index, reason: targetMatchUp ? 'BYE' : 'NOT_FOUND' });
      continue;
    }

    const result = recordOutcome({ tournamentRecord, drawDefinition, event, outcomeDef, targetMatchUp });
    if (result.error) return result;
    appliedMatchUpIds.push(targetMatchUp.matchUpId);
    changed = true;
  }

  return { ...SUCCESS, appliedMatchUpIds, skipped };

  function hydrate(): Located {
    const matchUps = allDrawMatchUps({ inContext: true, drawDefinition, event }).matchUps ?? [];
    const structureOrders: Record<string, number> = {};
    for (const { structureId } of matchUps) {
      if (!structureOrders[structureId]) structureOrders[structureId] = Object.keys(structureOrders).length + 1;
    }
    return { matchUps, structureOrders };
  }
}

type Located = { matchUps: HydratedMatchUp[]; structureOrders: Record<string, number> };

function locate({ matchUps, structureOrders }: Located, outcomeDef: DrawOutcome): HydratedMatchUp | undefined {
  const {
    stageSequence = 1,
    matchUpIndex = 0,
    structureOrder,
    structureName,
    roundPosition,
    drawPositions,
    structureId,
    stage = MAIN,
    roundNumber,
  } = outcomeDef;

  const matches = (matchUp: HydratedMatchUp) =>
    matchUp.stage === stage &&
    matchUp.stageSequence === stageSequence &&
    (!structureId || matchUp.structureId === structureId) &&
    (!structureName || matchUp.structureName === structureName) &&
    (!structureOrder || structureOrders[matchUp.structureId] === structureOrder) &&
    (!roundNumber || matchUp.roundNumber === roundNumber) &&
    (!roundPosition || matchUp.roundPosition === roundPosition) &&
    (!drawPositions || intersection(drawPositions, matchUp.drawPositions ?? []).length === 2);

  return matchUps.filter(matches)[matchUpIndex];
}

type RecordOutcomeArgs = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  targetMatchUp: HydratedMatchUp;
  outcomeDef: DrawOutcome;
  event?: Event;
};

function recordOutcome({ tournamentRecord, drawDefinition, event, outcomeDef, targetMatchUp }: RecordOutcomeArgs) {
  const { matchUpStatus = COMPLETED, matchUpStatusCodes, matchUpFormat, scoreString, winningSide } = outcomeDef;

  const { outcome } = generateOutcomeFromScoreString({ matchUpFormat, matchUpStatus, scoreString, winningSide });
  if (matchUpStatusCodes) outcome.matchUpStatusCodes = matchUpStatusCodes;

  return setMatchUpStatus({
    // optional here: `mocksEngine.generateEventWithDraw` applies a profile's outcomes to a draw that has no
    // tournament record yet, and recording a result on a draw reads none
    tournamentRecord: tournamentRecord as Tournament,
    matchUpId: targetMatchUp.matchUpId,
    drawDefinition,
    matchUpFormat,
    outcome,
    event,
  });
}
