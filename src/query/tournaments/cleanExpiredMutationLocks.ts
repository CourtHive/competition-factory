import { addExtension } from '@Mutate/extensions/addExtension';
import { findExtension } from '@Acquire/findExtension';

// constants and types
import { ErrorType, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { MUTATION_LOCKS } from '@Constants/extensionConstants';
import { MutationLocksValue } from '@Types/mutationLockTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { Tournament } from '@Types/tournamentTypes';
import { nowIso } from '@Tools/clock';

type CleanExpiredArgs = {
  tournamentRecord: Tournament;
};

export function cleanExpiredMutationLocks(params: CleanExpiredArgs): {
  success?: boolean;
  error?: ErrorType;
  removedCount?: number;
} {
  const { tournamentRecord } = params;

  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  const now = nowIso();
  let removedCount = 0;

  const cleanElement = (element: any) => {
    const { extension } = findExtension({ element, name: MUTATION_LOCKS });
    if (!extension?.value?.locks?.length) return;

    const locksValue: MutationLocksValue = extension.value;
    const before = locksValue.locks.length;
    locksValue.locks = locksValue.locks.filter((lock) => lock.expiresAt === null || lock.expiresAt > now);
    const removed = before - locksValue.locks.length;

    if (removed > 0) {
      removedCount += removed;
      addExtension({
        element,
        extension: { name: MUTATION_LOCKS, value: locksValue },
        creationTime: false,
      });
    }
  };

  // Tournament
  cleanElement(tournamentRecord);

  // Events and draws
  const events = tournamentRecord.events ?? [];
  for (const event of events) {
    cleanElement(event);
    const drawDefinitions = event.drawDefinitions ?? [];
    for (const drawDefinition of drawDefinitions) {
      cleanElement(drawDefinition);
    }
  }

  // Venues
  const venues = tournamentRecord.venues ?? [];
  for (const venue of venues) {
    cleanElement(venue);
  }

  return { ...SUCCESS, removedCount };
}
