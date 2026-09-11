import { firstClassOrExtension } from '@Acquire/firstClassOrExtension';
import { instanceCount } from '@Tools/arrays';
import { ensureInt } from '@Tools/ensureInt';
import { xa } from '@Tools/extractAttributes';

// constants
import { PARTICIPANT_ID } from '@Constants/attributeConstants';
import { SUB_ORDER } from '@Constants/extensionConstants';

export function createSubOrderMap({ positionAssignments }) {
  const subOrderArray = (positionAssignments ?? [])
    .filter(xa(PARTICIPANT_ID))
    .map((assignment) => {
      const value = ensureInt(
        firstClassOrExtension({
          element: assignment,
          attribute: 'subOrder',
          name: SUB_ORDER,
        }),
      );
      const subOrder = !isNaN(value) && value;
      return subOrder && { participantId: assignment.participantId, subOrder };
    })
    .filter(Boolean);

  // we only want subOrders that are unique, and we want them sorted and re-assigned to ordered values
  const subOrders = subOrderArray.map(({ subOrder }) => subOrder);
  const subOrdersCount = instanceCount(subOrders);

  const subOrderMap = Object.assign(
    {},
    ...subOrderArray
      .filter(({ subOrder }) => subOrdersCount[subOrder] === 1)
      .map(({ participantId, subOrder }) => ({
        [participantId]: subOrder,
      })),
  );

  return { subOrderMap };
}
