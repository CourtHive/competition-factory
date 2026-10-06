import { addExtension } from '@Mutate/extensions/addExtension';
import { findExtension } from '@Acquire/findExtension';
import { findVenue } from '@Query/venues/findVenue';

// constants and types
import { MutationLockScope, MutationLocksValue } from '@Types/mutationLockTypes';
import { MUTATION_LOCKS } from '@Constants/extensionConstants';
import { Extension, Tournament } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';
import {
  ErrorType,
  MISSING_TOURNAMENT_RECORD,
  MISSING_VALUE,
  MUTATION_LOCK_NOT_FOUND,
  UNAUTHORIZED_LOCK_OPERATION,
} from '@Constants/errorConditionConstants';

type RemoveMutationLockArgs = {
  tournamentRecord: Tournament;
  drawDefinition?: { drawId: string; extensions?: any[] };
  event?: { eventId: string; extensions?: any[] };
  venueId?: string;
  lockId?: string;
  scope?: MutationLockScope;
  lockToken?: string;
  forceRelease?: boolean;
};

export function removeMutationLock(params: RemoveMutationLockArgs): {
  success?: boolean;
  error?: ErrorType;
  info?: string;
} {
  const { tournamentRecord, drawDefinition, event, venueId, lockId, scope, lockToken, forceRelease } = params;

  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  if (!lockId && !scope) return { error: MISSING_VALUE, info: 'Provide lockId or scope to identify the lock' };

  // Resolve target element: draw > event > venue > tournament
  let element: { extensions?: Extension[] } | undefined;
  if (drawDefinition) {
    element = drawDefinition;
  } else if (event) {
    element = event;
  } else if (venueId) {
    const venueResult = findVenue({ tournamentRecord, venueId });
    if (venueResult.error) return { error: venueResult.error };
    element = venueResult.venue;
  } else {
    element = tournamentRecord;
  }

  const { extension } = findExtension({ element, name: MUTATION_LOCKS });
  const locksValue: MutationLocksValue = extension?.value ?? { locks: [] };

  const lockIndex = locksValue.locks.findIndex((lock) => {
    if (lockId) return lock.lockId === lockId;
    return lock.scope === scope;
  });

  if (lockIndex === -1) return { error: MUTATION_LOCK_NOT_FOUND };

  const lock = locksValue.locks[lockIndex];

  if (!forceRelease && lock.lockToken !== lockToken) {
    return { error: UNAUTHORIZED_LOCK_OPERATION };
  }

  locksValue.locks.splice(lockIndex, 1);

  addExtension({
    element,
    extension: { name: MUTATION_LOCKS, value: locksValue },
    creationTime: false,
  });

  return { ...SUCCESS };
}
