import { findExtension } from '@Acquire/findExtension';

// constants and types
import { ENTRY_PROFILE } from '@Constants/extensionConstants';
import { DrawDefinition } from '@Types/tournamentTypes';

type GetEntryProfileArgs = {
  drawDefinition: DrawDefinition;
};
export function getEntryProfile({ drawDefinition }: GetEntryProfileArgs) {
  const { extension } = findExtension({
    element: drawDefinition,
    name: ENTRY_PROFILE,
  });
  const entryProfile = extension?.value ?? {};
  return { entryProfile };
}
