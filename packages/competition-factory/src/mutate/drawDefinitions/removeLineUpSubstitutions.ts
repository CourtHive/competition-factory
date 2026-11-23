import { getCollectionPositionAssignments } from '@Query/hierarchical/tieFormats/getCollectionPositionAssignments';
import { unique } from '@Tools/arrays';

// types
import { LineUp } from '@Types/factoryTypes';

export function removeLineUpSubstitutions({ lineUp }: { lineUp: LineUp }) {
  if (!Array.isArray(lineUp)) return;

  const participantAssignments = {};

  const permutations = unique(
    lineUp
      .flatMap(({ collectionAssignments }) =>
        collectionAssignments?.map(({ collectionId, collectionPosition }) =>
          [collectionId, collectionPosition].join('|'),
        ),
      )
      .filter(Boolean),
  );

  permutations.forEach((permutation) => {
    const [collectionId, position] = permutation.split('|');
    const collectionPosition = parseInt(position);
    const { assignedParticipantIds } = getCollectionPositionAssignments({
      collectionPosition,
      collectionId,
      lineUp,
    });

    assignedParticipantIds.forEach((participantId) => {
      if (!participantAssignments[participantId]) participantAssignments[participantId] = [];
      participantAssignments[participantId].push({
        collectionId,
        collectionPosition,
      });
    });
  });

  return Object.keys(participantAssignments).map((participantId) => ({
    participantId,
    collectionAssignments: participantAssignments[participantId],
  }));
}
