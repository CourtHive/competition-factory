import { DOUBLES } from '@Constants/matchUpTypes';

export function getIndividualParticipantIds(matchUp) {
  const { sides, matchUpType } = matchUp ?? {};
  const potentialIndividualParticipantIds = matchUp.potentialParticipants?.length
    ? matchUp.potentialParticipants
        .flat()
        .map((participant) => {
          return matchUpType === DOUBLES ? participant?.individualParticipantIds ?? [] : participant.participantId;
        })
        .flat()
    : [];
  const enteredIndividualParticipantIds = (sides ?? [])
    .map((side) => {
      return (
        (matchUpType === DOUBLES && (side?.participant?.individualParticipantIds ?? [])) ||
        (side?.participantId && [side.participantId]) ||
        []
      );
    })
    .flat();

  const individualParticipantIds = enteredIndividualParticipantIds.concat(potentialIndividualParticipantIds).flat();

  return {
    individualParticipantIds,
    enteredIndividualParticipantIds,
    potentialIndividualParticipantIds,
  };
}
