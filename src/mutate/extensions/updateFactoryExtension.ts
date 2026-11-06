import { setFirstClassOrExtension } from '@Mutate/extensions/setFirstClassOrExtension';
import { firstClassOrExtension } from '@Helpers/extensions/firstClassOrExtension';
import { extensionConstants } from '@Constants/extensionConstants';

// types
import { DrawDefinition, Tournament } from '@Types/tournamentTypes';

const { FACTORY } = extensionConstants;

type UpdateFactoryExtensionArgs = {
  element?: Tournament | DrawDefinition;
  value: { version?: string; timeStamp?: number };
  tournamentRecord?: unknown;
};

/** Stamps `value` onto an element's `factory`: the tournament record, or under `stampScope('modified')` a drawDefinition. */
export function updateFactoryExtension({ tournamentRecord, element, value }: UpdateFactoryExtensionArgs) {
  element ??= tournamentRecord as Tournament;
  const existing = firstClassOrExtension({ element, attribute: 'factory', name: FACTORY });
  setFirstClassOrExtension({
    element,
    attribute: 'factory',
    name: FACTORY,
    value: { ...existing, ...value },
  });
}
