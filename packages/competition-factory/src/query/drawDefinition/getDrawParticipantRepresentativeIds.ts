import { findExtension } from '@Helpers/extensions/findExtension';
import type { DrawDefinition } from '@Types/tournamentTypes';

type GetDrawParticipantRepresentativeIdsArgs = {
  drawDefinition?: DrawDefinition;
};
export function getDrawParticipantRepresentativeIds({ drawDefinition }: GetDrawParticipantRepresentativeIdsArgs) {
  const result = findExtension({
    name: 'participantRepresentatives',
    element: drawDefinition,
  });
  if (result.error) return result;

  const representativeParticipantIds = result.extension?.value ?? [];

  return { representativeParticipantIds };
}
