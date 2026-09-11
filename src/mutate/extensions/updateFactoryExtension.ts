import { setFirstClassOrExtension } from '@Mutate/extensions/setFirstClassOrExtension';
import { firstClassOrExtension } from '@Acquire/firstClassOrExtension';
import { extensionConstants } from '@Constants/extensionConstants';

const { FACTORY } = extensionConstants;

export function updateFactoryExtension({ tournamentRecord, value }) {
  const existing = firstClassOrExtension({ element: tournamentRecord, attribute: 'factory', name: FACTORY });
  setFirstClassOrExtension({
    element: tournamentRecord,
    attribute: 'factory',
    name: FACTORY,
    value: { ...existing, ...value },
  });
}
