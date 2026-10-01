import { getMappedStructureMatchUps, getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { getContextContent } from '@Query/hierarchical/getContextContent';
import { getMatchUp } from '@Query/matchUps/getMatchUpFromMatchUps';
import { getDrawStructures } from './findStructure';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants and types
import { ContextContent, ContextProfile, MatchUpsMap, ParticipantsProfile } from '@Types/factoryTypes';
import { DrawDefinition, Event, Participant, Structure } from '@Types/tournamentTypes';
import { ErrorType, MATCHUP_NOT_FOUND } from '@Constants/errorConditionConstants';
import { DRAW_DEFINITION, MATCHUP_ID } from '@Constants/attributeConstants';
import { HydratedMatchUp } from '@Types/hydrated';

/*
  public version of findMatchUp
*/
export function publicFindDrawMatchUp(params) {
  Object.assign(params, { inContext: true });
  return {
    matchUp: makeDeepCopy(findDrawMatchUp(params).matchUp, false, true),
  };
}

type FindDrawMatchUpArgs = {
  tournamentParticipants?: Participant[];
  participantsProfile?: ParticipantsProfile;
  context?: { [key: string]: any };
  contextContent?: ContextContent;
  contextProfile?: ContextProfile;
  afterRecoveryTimes?: boolean;
  drawDefinition: DrawDefinition;
  matchUpsMap?: MatchUpsMap;
  inContext?: boolean;
  matchUpId: string;
  event?: Event;
};

export function findDrawMatchUp(params: FindDrawMatchUpArgs): {
  matchUp?: HydratedMatchUp;
  structure?: Structure;
  error?: ErrorType;
} {
  const paramsCheck = checkRequiredParameters(params, [{ [DRAW_DEFINITION]: true, [MATCHUP_ID]: true }]);
  if (paramsCheck.error) return paramsCheck;

  const {
    tournamentParticipants,
    participantsProfile,
    afterRecoveryTimes,
    contextProfile,
    drawDefinition,
    matchUpId,
    inContext,
    context,
    event,
  } = params;

  const { structures = [] } = getDrawStructures({ drawDefinition });

  const contextContent =
    params.contextContent ?? (contextProfile && getContextContent({ contextProfile, drawDefinition }));

  /**
   * ONLY THE STRUCTURE THAT HOLDS THE MATCHUP IS READ.
   *
   * This walked the draw's structures in order and asked each for ALL its matchUps until one of them
   * turned out to hold the id — so finding a matchUp in the eighth structure of a COMPASS read seven
   * structures to no purpose, and IN CONTEXT that is seven hydrations. Measured 2026-10-01
   * (`pipelineCost.test.ts`, 2,026 `setMatchUpStatus` calls): 5,432 structures read to find 3,938
   * matchUps, 258 of the surplus in context.
   *
   * Which structure holds it is asked of the SAME map the read below uses, so the two cannot
   * disagree; a structure the map does not place the matchUp in would not have returned it either.
   * The map is built once here rather than once per structure inside `getAllStructureMatchUps`.
   */
  const matchUpsMap = params.matchUpsMap ?? getMatchUpsMap({ drawDefinition });

  for (const structure of structures) {
    if (!structureHoldsMatchUp({ structureId: structure.structureId, matchUpsMap, matchUpId })) continue;

    const { matchUps } = getAllStructureMatchUps({
      tournamentParticipants,
      participantsProfile,
      afterRecoveryTimes,
      contextContent,
      drawDefinition,
      contextProfile,
      matchUpsMap,
      inContext,
      structure,
      context,
      event,
    });
    const { matchUp } = getMatchUp({ matchUps, matchUpId });

    if (matchUp) return { matchUp, structure };
  }

  return { error: MATCHUP_NOT_FOUND };
}

/** The matchUp itself, or the dual it is a line of, among the structure's own and its groups' matchUps. */
function structureHoldsMatchUp({
  matchUpsMap,
  structureId,
  matchUpId,
}: {
  matchUpsMap: MatchUpsMap;
  structureId: string;
  matchUpId: string;
}): boolean {
  return getMappedStructureMatchUps({ matchUpsMap, structureId }).some(
    (matchUp: any) =>
      matchUp.matchUpId === matchUpId ||
      matchUp.tieMatchUps?.some((tieMatchUp: any) => tieMatchUp.matchUpId === matchUpId),
  );
}
