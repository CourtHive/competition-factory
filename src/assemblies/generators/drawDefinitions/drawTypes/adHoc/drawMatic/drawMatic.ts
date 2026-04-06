import { generateDrawMaticRound, DrawMaticRoundResult } from './generateDrawMaticRound';
import { isAdHocType } from '@Query/drawDefinition/isAdHocType';
import { getParticipantIds } from './getParticipantIds';
import { isAdHoc } from '@Query/drawDefinition/isAdHoc';
import { getAdHocRatings } from './getAdHocRatings';
import { generateRange } from '@Tools/arrays';

// types and constants
import { INVALID_DRAW_DEFINITION, INVALID_VALUES, STRUCTURE_NOT_FOUND } from '@Constants/errorConditionConstants';
import { stageOrder } from '@Constants/drawDefinitionConstants';
import { DrawMaticArgs, ResultType } from '@Types/factoryTypes';
import { Structure, MatchUp } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';

export function drawMatic(
  params: DrawMaticArgs,
): ResultType & { matchUps?: MatchUp[]; roundResults?: DrawMaticRoundResult[] } {
  const paramsCheck = checkParams(params);
  if (paramsCheck?.error) return paramsCheck;

  const idsResult = getParticipantIds(params);
  if (idsResult.error) return idsResult;

  const structureResult = getAdHocStructure(params);
  if (structureResult.error) return structureResult;

  let adHocRatings = getAdHocRatings(params);

  const isMock = params.tournamentRecord?.isMock ?? params.isMock;
  const eventType = params.eventType ?? params.event?.eventType;
  const matchUps: MatchUp[] = [];
  const roundResults: any = [];
  let roundNumber;

  for (const iteration of generateRange(1, (params.roundsCount ?? 1) + 1)) {
    const result = generateDrawMaticRound({
      ...params,
      participantIds: idsResult.participantIds,
      structure: structureResult.structure,
      ignoreLastRoundNumber: true,
      iterationMatchUps: matchUps,
      adHocRatings,
      roundNumber,
      eventType,
      isMock,
    });
    if (result.error) return result;

    const { matchUps: roundMatchUps, ...roundResult } = result;
    if (roundResult.modifiedScaleValues) adHocRatings = roundResult.modifiedScaleValues;
    roundResults.push({ ...roundResult, iteration, matchUpsCount: roundMatchUps?.length });
    roundNumber = (roundResult?.roundNumber ?? 1) + 1;
    if (roundMatchUps?.length) {
      matchUps.push(...roundMatchUps);
    }
  }

  return { ...SUCCESS, matchUps, roundResults };
}

function getAdHocStructure(params): ResultType & { structure?: Structure } {
  if (params.structureId) return params.structureId;

  const drawDefinition = params.drawDefinition;
  // if no structureId is specified find the latest AD_HOC stage which has matchUps
  const targetStructure = drawDefinition?.structures
    ?.filter((structure) => structure.stageSequence === 1)
    ?.reduce((targetStructure: any, structure: any) => {
      const orderNumber = structure.stage && stageOrder[structure.stage];
      const structureIsAdHoc = isAdHoc({ structure });

      return structureIsAdHoc && orderNumber > (stageOrder[targetStructure?.stage] || 1) ? structure : targetStructure;
    }, undefined);

  const structure = drawDefinition?.structures?.find(
    (structure) => structure.structureId === targetStructure?.structureId,
  );
  if (!structure) return { error: STRUCTURE_NOT_FOUND };

  // an AD_HOC structure is one that has no child structures and in which no matchUps have roundPosition
  const structureIsAdHoc = isAdHoc({ structure });
  if (!structureIsAdHoc) return { error: INVALID_DRAW_DEFINITION };

  return { structure };
}

function checkParams(params) {
  if (params.roundsCount && typeof params.roundsCount !== 'number') {
    return { error: INVALID_VALUES, info: 'roundsCount must be a number' };
  }

  if (typeof params.drawDefinition !== 'object') {
    return { error: INVALID_DRAW_DEFINITION };
  }

  // When structureId is provided, skip drawType check — the target structure
  // will be validated as ad-hoc later. This supports AD_HOC voluntary consolation
  // structures within non-AD_HOC draws (e.g., ROUND_ROBIN main + AD_HOC consolation).
  if (!params.structureId && params.drawDefinition.drawType && !isAdHocType(params.drawDefinition.drawType)) {
    return { error: INVALID_DRAW_DEFINITION };
  }

  if (
    !Array.isArray(params.drawDefinition?.entries) &&
    params.participantIds &&
    !Array.isArray(params.participantIds)
  ) {
    return { error: INVALID_VALUES, info: 'Missing Entries' };
  }

  return { error: undefined };
}
