import { getStructureMatchUps } from '@Query/structure/getStructureMatchUps';
import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { decorateResult } from '@Functions/global/decorateResult';
import { getDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { getMatchUpId } from '@Functions/global/extractors';
import { mustBeAnArray } from '@Tools/mustBeAnArray';
import { isConvertableInteger } from '@Tools/math';
import { uniqueValues } from '@Tools/arrays';

// constants and types
import { INVALID_MATCHUP_STATUS, INVALID_VALUES, MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { DrawDefinition, Tournament } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';

type SetOrderOfFinishArgs = {
  finishingOrder: { matchUpId: string; orderOfFinish: number }[];
  tournamentRecord: Tournament;
  drawDefinition: DrawDefinition;
};

export function setOrderOfFinish({ tournamentRecord, drawDefinition, finishingOrder }: SetOrderOfFinishArgs) {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  const stack = 'setOrderOfFinish';

  if (!Array.isArray(finishingOrder))
    return decorateResult({
      info: mustBeAnArray('finishingOrder'),
      result: { error: INVALID_VALUES },
      stack,
    });

  const { completedMatchUps, matchUpsMap } = getDrawMatchUps({
    inContext: true,
    drawDefinition,
  });

  const matchUpIds: string[] = completedMatchUps?.map(getMatchUpId) ?? [];
  const targetMatchUpIds = finishingOrder.map(getMatchUpId);

  const { matchUpTypes, roundNumbers, structureIds, matchUpTieIds } = (completedMatchUps ?? [])
    .filter(({ matchUpId }) => targetMatchUpIds.includes(matchUpId))
    .reduce(
      (aggregator: any, matchUp) => {
        const { matchUpTieId, matchUpType, roundNumber, structureId } = matchUp;
        if (!aggregator.matchUpTypes.includes(matchUpType)) aggregator.matchUpTypes.push(matchUpType);
        if (!aggregator.roundNumbers.includes(roundNumber)) aggregator.roundNumbers.push(roundNumber);
        if (!aggregator.structureIds.includes(structureId)) aggregator.structureIds.push(structureId);
        if (!aggregator.matchUpTieIds.includes(matchUpTieId)) aggregator.matchUpTieIds.push(matchUpTieId);
        return aggregator;
      },
      {
        matchUpTypes: [],
        roundNumbers: [],
        structureIds: [],
        matchUpTieIds: [],
      },
    );

  // targeted matchUps must all be of the same matchUpType and have the same roundNumber and structureId
  if (matchUpTypes.length > 1 || matchUpTieIds.length > 1 || roundNumbers.length > 1 || structureIds.length > 1) {
    return decorateResult({
      info: 'matchUpType, structureId and roundNumber must be equivalent',
      result: { error: INVALID_VALUES },
      stack,
    });
  }

  // targetedMatchUps must all be in draws completedMatchUps and orderOfFinish values must be integers
  let validMatchUpId, validOrderOfFinish;
  const valuesMap = {};
  const targetedMatchUpIds: string[] = [];
  const orderOfFinishValues: number[] = [];
  const validValues = finishingOrder.every(({ orderOfFinish, matchUpId }) => {
    targetedMatchUpIds.push(matchUpId);
    if (orderOfFinish) orderOfFinishValues.push(orderOfFinish);
    valuesMap[matchUpId] = orderOfFinish;
    validMatchUpId = matchUpIds.includes(matchUpId);
    validOrderOfFinish =
      orderOfFinish === undefined || (isConvertableInteger(orderOfFinish) && Math.floor(orderOfFinish) > 0);
    return validMatchUpId && validOrderOfFinish;
  });

  if (!validValues) {
    return decorateResult({
      result: {
        error: !validMatchUpId ? INVALID_MATCHUP_STATUS : INVALID_VALUES,
      },
      info:
        (!validMatchUpId && 'matchUps must be completed') ||
        (!validOrderOfFinish && 'orderOfFinish must be integer > 0 or undefined') ||
        undefined,
      stack,
    });
  }

  // get other matchUps in the same logical grouping
  const otherCohortMatchUps = completedMatchUps?.filter(
    (matchUp) =>
      matchUp.structureId === structureIds[0] &&
      matchUp.roundNumber === roundNumbers[0] &&
      matchUp.matchUpType === matchUpTypes[0] &&
      matchUp.matchUpTieId === matchUpTieIds[0] &&
      !targetedMatchUpIds.includes(matchUp.matchUpId),
  );

  // throw an error if an existing matchUp has an invalid orderOfFinish value
  for (const matchUp of otherCohortMatchUps ?? []) {
    const { orderOfFinish } = matchUp ?? {};
    if (orderOfFinish) {
      if (!isConvertableInteger(orderOfFinish))
        return decorateResult({
          context: { orderOfFinish, matchUp },
          result: { error: INVALID_VALUES },
          stack,
        });
      orderOfFinishValues.push(orderOfFinish);
    }
  }

  // order of finish values must be unique and no value greater than the number of values
  if (
    uniqueValues(orderOfFinishValues).length !== orderOfFinishValues.length ||
    Math.max(...orderOfFinishValues) > orderOfFinishValues.length
  ) {
    return decorateResult({
      info: 'Values not unique or greater than expected number of values',
      result: { error: INVALID_VALUES },
      stack,
    });
  }

  if (structureIds.length) {
    // get the matchUp objects to modify (not inContext)
    const result = getStructureMatchUps({
      matchUpFilters: { matchUpIds: targetMatchUpIds },
      structureId: structureIds[0],
      drawDefinition,
      matchUpsMap,
    });
    if (result.error) return decorateResult({ result, stack });

    // apply the new values to targeted matchUps
    result.completedMatchUps?.forEach((matchUp) => {
      matchUp.orderOfFinish = valuesMap[matchUp.matchUpId];
      modifyMatchUpNotice({
        tournamentId: tournamentRecord.tournamentId,
        context: 'setOrderOfFinish',
        drawDefinition,
        matchUp,
      });
    });
  }

  return { ...SUCCESS };
}
