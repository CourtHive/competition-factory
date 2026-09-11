import { setFirstClassOrExtension } from '@Mutate/extensions/setFirstClassOrExtension';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';

// constants
import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { DISABLE_LINKS } from '@Constants/extensionConstants';

export function conditionallyDisableLinkPositioning({ drawPositions, structure }) {
  if ([QUALIFYING, MAIN].includes(structure.stage) && structure.stageSequence === 1) {
    // positionActions are not disabled for first stage QUALIFYING and MAIN structures
    return;
  }
  const { positionAssignments } = getPositionAssignments({ structure });
  const relevantAssignments = positionAssignments?.filter(({ drawPosition }) => drawPositions?.includes(drawPosition));
  relevantAssignments?.forEach((assignment) => {
    setFirstClassOrExtension({
      element: assignment,
      attribute: 'disableLinks',
      name: DISABLE_LINKS,
      value: true,
    });
  });
}
