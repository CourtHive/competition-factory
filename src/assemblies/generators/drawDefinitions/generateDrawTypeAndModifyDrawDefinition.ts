import { setStageDrawSize, setStageQualifiersCount } from '@Mutate/drawDefinitions/entryGovernor/stageEntryCounts';
import { getStageDrawPositionsCount } from '@Query/drawDefinition/getStageDrawPositions';
import { resolveTieFormat } from '@Query/hierarchical/tieFormats/resolveTieFormat';
import { generateDrawStructuresAndLinks } from './generateDrawStructuresAndLinks';
import { copyTieFormat } from '@Query/hierarchical/tieFormats/copyTieFormat';
import { modifyDrawNotice } from '@Mutate/notifications/drawNotifications';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { validateTieFormat } from '@Validators/validateTieFormat';
import { decorateResult } from '@Functions/global/decorateResult';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { getMatchUpId } from '@Functions/global/extractors';
import { definedAttributes } from '@Tools/definedAttributes';
import { addGoesTo } from '@Query/matchUps/addGoesTo';
import { generateTieMatchUps } from './tieMatchUps';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants and types
import { PolicyDefinitions, MatchUpsMap, ResultType } from '@Types/factoryTypes';
import { MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { HydratedMatchUp } from '@Types/hydrated';
import { SINGLES } from '@Constants/matchUpTypes';
import {
  DrawDefinition,
  DrawLink,
  Event,
  MatchUp,
  Structure,
  TieFormat,
  Tournament,
  EventTypeUnion,
} from '@Types/tournamentTypes';

type GenerateDrawTypeAndModify = {
  policyDefinitions?: PolicyDefinitions;
  appliedPolicies?: PolicyDefinitions;
  finishingPositionLimit?: number;
  tournamentRecord?: Tournament;
  matchUpType?: EventTypeUnion;
  drawDefinition: DrawDefinition;
  drawTypeCoercion?: boolean;
  qualifyingOnly?: boolean;
  modifyOriginal?: boolean;
  qualifiersCount?: number;
  stageSequence?: number;
  matchUpFormat?: string;
  structureOptions?: any;
  tieFormat?: TieFormat;
  drawType?: string;
  drawSize?: number;
  feedPolicy?: any;
  isMock?: boolean;
  event?: Event;
};

export function generateDrawTypeAndModifyDrawDefinition(params: GenerateDrawTypeAndModify): ResultType & {
  inContextDrawMatchUps?: HydratedMatchUp[];
  drawDefinition?: DrawDefinition;
  matchUpsMap?: MatchUpsMap;
  structures?: Structure[];
  matchUps?: MatchUp[];
  links?: DrawLink[];
  success?: boolean;
} {
  const { modifyOriginal = true, stageSequence = 1, isMock } = params ?? {};

  const stack = 'generateDrawTypeAndModifyDrawDefinition';

  if (!params.drawDefinition)
    return decorateResult({
      result: { error: MISSING_DRAW_DEFINITION },
      stack,
    });

  const drawDefinition = modifyOriginal ? params.drawDefinition : makeDeepCopy(params.drawDefinition, false, true);

  let { tieFormat, matchUpType } = params;
  if (tieFormat) {
    const result = validateTieFormat({ tieFormat });
    if (result.error) return result;
  }

  tieFormat = copyTieFormat(tieFormat ?? resolveTieFormat({ drawDefinition })?.tieFormat);
  matchUpType = matchUpType ?? (drawDefinition.matchUpType || SINGLES);
  params.tieFormat = tieFormat;
  params.matchUpType = matchUpType;

  const mainStageDrawPositionsCount = getStageDrawPositionsCount({
    drawDefinition,
    stage: MAIN,
  });
  params.drawSize = params.drawSize ?? mainStageDrawPositionsCount;

  if (!mainStageDrawPositionsCount && params.drawSize) {
    setStageDrawSize({
      drawSize: params.drawSize,
      drawDefinition,
      stageSequence,
      stage: MAIN,
    });
  }

  const existingMatchUpIds = new Set(
    getMatchUpsMap({
      drawDefinition,
    }).drawMatchUps.map(getMatchUpId),
  );

  const result = generateDrawStructuresAndLinks(params);
  if (result.error) {
    return decorateResult({ result, stack });
  }

  const { structures, links, qualifyingResult } = result;
  drawDefinition.structures = structures;
  drawDefinition.links = links;

  const qualifiersCount = Math.max(params.qualifiersCount ?? 0, qualifyingResult?.qualifiersCount || 0);

  if (qualifyingResult?.qualifyingDrawPositionsCount) {
    const qualifyingStageDrawPositionsCount = getStageDrawPositionsCount({
      stage: QUALIFYING,
      drawDefinition,
    });

    if (!qualifyingStageDrawPositionsCount) {
      const result = setStageDrawSize({
        drawSize: qualifyingResult.qualifyingDrawPositionsCount,
        stage: QUALIFYING,
        drawDefinition,
      });
      if (result.error) return result;
    }
  }

  if (qualifiersCount) {
    const result = setStageQualifiersCount({
      qualifiersCount,
      drawDefinition,
      stage: MAIN,
    });
    if (result.error) return result;
  }

  const drawSize = params.drawSize ?? mainStageDrawPositionsCount;

  Object.assign(params, definedAttributes({ drawSize, matchUpType, tieFormat }));

  const { matchUps, matchUpsMap } = getAllDrawMatchUps({ drawDefinition });

  if (tieFormat) {
    // if there were exiting matchUps, exclude them from this step
    matchUps?.forEach((matchUp) => {
      if (!existingMatchUpIds.has(matchUp.matchUpId)) {
        const { tieMatchUps } = generateTieMatchUps({ tieFormat, matchUp, isMock });
        Object.assign(matchUp, { tieMatchUps, matchUpType });
      }
    });
  }

  const { inContextDrawMatchUps } = addGoesTo({ drawDefinition, matchUpsMap });

  modifyDrawNotice({
    tournamentId: params.tournamentRecord?.tournamentId,
    drawDefinition,
  });

  return {
    inContextDrawMatchUps,
    drawDefinition,
    matchUpsMap,
    ...SUCCESS,
    structures,
    matchUps,
    links,
  };
}
