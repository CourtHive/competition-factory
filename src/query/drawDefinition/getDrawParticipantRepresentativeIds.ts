import { findExtension } from '@Acquire/findExtension';

export function getDrawParticipantRepresentativeIds({ drawDefinition }) {
  const result = findExtension({
    name: 'participantRepresentatives',
    element: drawDefinition,
  });
  if (result.error) return result;

  const representativeParticipantIds = result.extension?.value ?? [];

  return { representativeParticipantIds };
}
