export const getFpMap = (participants, personPoints) =>
  participants
    .filter((p) => p.person)
    .map((participant) => [
      participant.draws[0].structureParticipation.map(({ winCount }) => winCount),
      participant.draws[0].finishingPositionRange.join('-'),
      personPoints[participant.person.personId]?.[0]?.points,
    ]);

export const finishingPositionSort = (a, b) =>
  a.draws[0].finishingPositionRange[0] - b.draws[0].finishingPositionRange[0];
