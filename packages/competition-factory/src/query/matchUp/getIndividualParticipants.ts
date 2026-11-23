import { DOUBLES } from '@Constants/matchUpTypes';

export function getIndividualParticipants(matchUp) {
  const { sides, matchUpType } = matchUp ?? {};
  return (sides ?? [])
    .map((side) => {
      return (
        (matchUpType === DOUBLES && (side?.participant?.individualParticipants ?? [])) ||
        (side?.participant && [side.participant]) ||
        []
      );
    })
    .flat();
}
