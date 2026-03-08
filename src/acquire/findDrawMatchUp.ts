import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { getContextContent } from '@Query/hierarchical/getContextContent';
import { getMatchUp } from '@Query/matchUps/getMatchUpFromMatchUps';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { getDrawStructures } from './findStructure';

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
    matchUpsMap,
    matchUpId,
    inContext,
    context,
    event,
  } = params;

  const { structures = [] } = getDrawStructures({ drawDefinition });

  const contextContent =
    params.contextContent || (contextProfile && getContextContent({ contextProfile, drawDefinition }));

  for (const structure of structures) {
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
