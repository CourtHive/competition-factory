import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { matchUpsOf, structuresOf } from '@Acquire/structureMembers';

// constants and types
import { INVALID_STRUCTURE, MISSING_STRUCTURE_ID, STRUCTURE_NOT_FOUND } from '@Constants/errorConditionConstants';
import { STRUCTURE_SELECTED_STATUSES } from '@Constants/entryStatusConstants';
import { DrawDefinition, EntryStatusUnion } from '@Types/tournamentTypes';
import { ROUND_OUTCOME } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';

type GetAvailableMatchUpsCountArgs = {
  drawDefinition: DrawDefinition;
  structureId?: string;
  roundNumber?: number;
};

export function getAvailableMatchUpsCount(params: GetAvailableMatchUpsCountArgs): ResultType & {
  availableMatchUpsCount?: number;
  roundMatchUpsCount?: number;
  lastRoundNumber?: number;
} {
  const paramsCheck = checkRequiredParameters(params, [{ drawDefinition: true }]);
  if (paramsCheck.error) return paramsCheck;

  const { drawDefinition, roundNumber } = params;

  const structureId =
    params.structureId ?? (drawDefinition.structures?.length === 1 && drawDefinition.structures?.[0]?.structureId);

  if (typeof structureId !== 'string') return { error: MISSING_STRUCTURE_ID };

  // if drawDefinition and structureId are provided it is possible to infer roundNumber
  const structure = drawDefinition.structures?.find((structure) => structure.structureId === structureId);
  if (!structure) return { error: STRUCTURE_NOT_FOUND };

  let structureHasRoundPositions;
  const existingMatchUps = matchUpsOf(structure) ?? [];
  const lastRoundNumber = existingMatchUps?.reduce((roundNumber: number, matchUp: any) => {
    if (matchUp.roundPosition) structureHasRoundPositions = true;
    return (matchUp?.roundNumber || 0) > roundNumber ? matchUp.roundNumber : roundNumber;
  }, 0);

  // structure must not be a container of other structures
  // structure must not contain matchUps with roundPosition
  // structure must not determine finishingPosition by ROUND_OUTCOME
  if (structuresOf(structure) || structureHasRoundPositions || structure.finishingPosition === ROUND_OUTCOME) {
    return { error: INVALID_STRUCTURE };
  }

  const selectedEntries =
    drawDefinition?.entries?.filter((entry) => {
      const entryStatus = entry.entryStatus as EntryStatusUnion;
      return STRUCTURE_SELECTED_STATUSES.includes(entryStatus);
    }) ?? [];
  const roundMatchUpsCount = Math.floor(selectedEntries?.length / 2) || 1;
  const targetRoundNumber = roundNumber ?? lastRoundNumber ?? 1;
  const existingRoundMatchUps =
    matchUpsOf(structure)?.filter((matchUp) => matchUp.roundNumber === targetRoundNumber)?.length ?? 0;
  const maxRemaining = roundMatchUpsCount - existingRoundMatchUps;
  const availableMatchUpsCount = maxRemaining > 0 ? maxRemaining : 0;

  return { ...SUCCESS, availableMatchUpsCount, lastRoundNumber, roundMatchUpsCount };
}
