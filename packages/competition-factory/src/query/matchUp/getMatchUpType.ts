import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';

// constants and types
import { TEAM, INDIVIDUAL, PAIR } from '@Constants/participantConstants';
import { SINGLES, DOUBLES } from '@Constants/matchUpTypes';
import { MATCHUP } from '@Constants/attributeConstants';
import { ResultType } from '@Types/factoryTypes';

// derive matchUpType from participants when not defined on matchUp
export function getMatchUpType(params: {
  matchUp: {
    sides?: { participant?: { participantType?: string } }[];
    matchUpType?: string;
  };
}): ResultType & { matchUpType?: string } {
  const paramCheck = checkRequiredParameters(params, [{ [MATCHUP]: true }]);
  if (paramCheck.error) return paramCheck;

  const matchUp = params?.matchUp;
  let matchUpType = matchUp?.matchUpType as string | undefined;

  if (!matchUpType && matchUp?.sides?.length) {
    const side = matchUp.sides.find(({ participant }) => participant);
    const participant = side?.participant;
    const participantType = participant?.participantType;
    matchUpType =
      (participantType === INDIVIDUAL && SINGLES) ||
      (participantType === PAIR && DOUBLES) ||
      (participantType === TEAM && TEAM) ||
      undefined;
  }

  return { matchUpType };
}
