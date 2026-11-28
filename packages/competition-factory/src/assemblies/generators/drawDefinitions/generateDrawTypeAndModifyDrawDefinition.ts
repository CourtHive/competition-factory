import { addMatchUpsNotice, modifyDrawNotice } from '@Mutate/notifications/drawNotifications';
import { getStageDrawPositionsCount } from '@Query/drawDefinition/getStageDrawPositions';
import { resolveTieFormat } from '@Query/hierarchical/tieFormats/resolveTieFormat';
import { generateDrawStructuresAndLinks } from './generateDrawStructuresAndLinks';
import { generateTieMatchUps } from '@Helpers/drawTopology/templates/tieMatchUps';
import { copyTieFormat } from '@Query/hierarchical/tieFormats/copyTieFormat';
import { decorateResult } from '@Functions/global/decorateResult';
import { checkTieFormat } from '@Mutate/tieFormat/checkTieFormat';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { nonTeamTieFormatRefusal, storedNonTeamTieFormatRefusal } from '@Validators/nonTeamTieFormat';
import { validateTieFormat } from '@Validators/validateTieFormat';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { definedAttributes } from '@Tools/definedAttributes';
import { getMatchUpId } from '@Functions/global/extractors';
import { addGoesTo } from '@Query/matchUps/addGoesTo';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants and types
import { PolicyDefinitions, MatchUpsMap, ResultType } from '@Types/factoryTypes';
import { MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { MAIN } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { SINGLES } from '@Constants/matchUpTypes';
import { HydratedMatchUp } from '@Types/hydrated';
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
  uuids?: string[];
  policyDefinitions?: PolicyDefinitions;
  appliedPolicies?: PolicyDefinitions;
  finishingPositionLimit?: number;
  tournamentRecord?: Tournament;
  matchUpType?: EventTypeUnion;
  drawDefinition: DrawDefinition;
  drawTypeCoercion?: boolean;
  qualifyingOnly?: boolean;
  /** @deprecated in 8.0.0 the generator never modifies the drawDefinition it is given (see the 8.0.0 migration guide) */
  modifyOriginal?: boolean;
  qualifiersCount?: number;
  stageSequence?: number;
  matchUpFormat?: string;
  structureOptions?: { groupSize?: number; [key: string]: unknown };
  tieFormat?: TieFormat;
  drawType?: string;
  drawSize?: number;
  feedPolicy?: PolicyDefinitions['feedIn'];
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
  const { modifyOriginal = true, isMock } = params ?? {};

  const stack = 'generateDrawTypeAndModifyDrawDefinition';

  if (!params.drawDefinition)
    return decorateResult({
      result: { error: MISSING_DRAW_DEFINITION },
      stack,
    });

  // a tieFormat a 7.x record stored on a non-TEAM event or draw is refused, never used or silently ignored
  const storedRefusal = storedNonTeamTieFormatRefusal(params);
  if (storedRefusal) return decorateResult({ result: storedRefusal, stack });
  const drawDefinition = modifyOriginal ? params.drawDefinition : makeDeepCopy(params.drawDefinition, false, true);

  let { tieFormat, matchUpType } = params;
  const typeRefusal = nonTeamTieFormatRefusal(
    { tieFormat },
    undefined,
    matchUpType ?? drawDefinition.matchUpType ?? params.event?.eventType,
  );
  if (typeRefusal) return decorateResult({ result: typeRefusal, stack });
  if (tieFormat) {
    const result = validateTieFormat({ tieFormat, enforceValues: true });
    if (result.error) return result;
  }

  tieFormat = copyTieFormat(tieFormat ?? resolveTieFormat({ drawDefinition })?.tieFormat);

  // mint any missing collectionIds. A published tie format carries none — it cannot,
  // since a collectionId identifies a collection INSTANCE within a record — and without them every
  // generated line carries `collectionId: null`, cannot be attributed to its collection, and the tie
  // never scores. Safe to mint in place: `copyTieFormat` above already detached this from the caller.
  if (tieFormat) {
    // `params.uuids` is threaded in so the mint is identical on client and server — see
    // checkTieFormat's note. Without a pool it still mints, which is the pre-7.0.0 behaviour.
    const collectionIdResult = checkTieFormat({ tieFormat, uuids: params.uuids });
    if (collectionIdResult.error) return collectionIdResult;
  }
  matchUpType = matchUpType ?? (drawDefinition.matchUpType || SINGLES);
  params.tieFormat = tieFormat;
  params.matchUpType = matchUpType;

  const mainStageDrawPositionsCount = getStageDrawPositionsCount({
    drawDefinition,
    stage: MAIN,
  });
  params.drawSize = params.drawSize ?? mainStageDrawPositionsCount;

  // drawSize is now derived from generated structures, not entryProfile

  const existingMatchUpIds = new Set(
    getMatchUpsMap({
      drawDefinition,
    }).drawMatchUps.map(getMatchUpId),
  );

  const result = generateDrawStructuresAndLinks(params);
  if (result.error) {
    return decorateResult({ result, stack });
  }

  const { structures, links } = result;
  drawDefinition.structures = structures;
  drawDefinition.links = links;

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

  // a copy (modifyOriginal: false) changes no record and sends nothing
  if (modifyOriginal) {
    const tournamentId = params.tournamentRecord?.tournamentId;
    modifyDrawNotice({ tournamentId, drawDefinition });
    // a draw already stored in the event gains its matchUps here, and no later addDrawDefinition announces them
    const stored = params.event?.drawDefinitions?.includes(drawDefinition);
    const added = (matchUps ?? []).filter(({ matchUpId }) => !existingMatchUpIds.has(matchUpId));
    if (stored && added.length) {
      addMatchUpsNotice({ eventId: params.event?.eventId, matchUps: added, drawDefinition, tournamentId });
    }
  }

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
