import { addExtension } from '@Mutate/extensions/addExtension';
import { findExtension } from '@Acquire/findExtension';
import { findVenue } from '@Query/venues/findVenue';
import { UUID } from '@Tools/UUID';

// constants
import { MutationLock, MutationLockScope, MutationLocksValue } from '@Types/mutationLockTypes';
import { MUTATION_LOCKS } from '@Constants/extensionConstants';
import { Tournament } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';
import {
  ErrorType,
  INVALID_VALUES,
  MISSING_TOURNAMENT_RECORD,
  MISSING_VALUE,
  MUTATION_LOCK_EXISTS,
} from '@Constants/errorConditionConstants';

type AddMutationLockArgs = {
  tournamentRecord: Tournament;
  drawDefinition?: { drawId: string; extensions?: any[] };
  event?: { eventId: string; extensions?: any[] };
  venueId?: string;
  scope: MutationLockScope;
  lockToken: string;
  expiresAt?: string | null;
  methods?: string[];
};

export function addMutationLock(params: AddMutationLockArgs): {
  success?: boolean;
  error?: ErrorType;
  lockId?: string;
  info?: string;
} {
  const { tournamentRecord, drawDefinition, event, venueId, scope, lockToken, methods } = params;
  const expiresAt = params.expiresAt ?? null;

  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  if (!scope || !lockToken) return { error: MISSING_VALUE, info: !scope ? 'Missing scope' : 'Missing lockToken' };

  if (expiresAt !== null && isNaN(Date.parse(expiresAt))) {
    return { error: INVALID_VALUES, info: 'Invalid expiresAt; must be ISO 8601 or null' };
  }

  // Resolve target element: draw > event > venue > tournament
  let element: any;
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

  // Read existing locks on this element
  const { extension } = findExtension({ element, name: MUTATION_LOCKS });
  const locksValue: MutationLocksValue = extension?.value ?? { locks: [] };
  const now = new Date().toISOString();

  // Filter out expired locks
  locksValue.locks = locksValue.locks.filter((lock) => lock.expiresAt === null || lock.expiresAt > now);

  // Check for existing lock on same scope with overlapping methods
  const conflicting = locksValue.locks.find((lock) => {
    if (lock.scope !== scope) return false;
    // If either lock has no methods array, they fully overlap on scope
    if (!lock.methods || !methods) return true;
    // Both have methods arrays — check for intersection
    return lock.methods.some((m) => methods.includes(m));
  });

  if (conflicting) {
    if (conflicting.lockToken === lockToken) {
      // Same token → upsert: update existing lock
      conflicting.expiresAt = expiresAt;
      if (methods) {
        conflicting.methods = methods;
      } else {
        delete conflicting.methods;
      }

      addExtension({
        element,
        extension: { name: MUTATION_LOCKS, value: locksValue },
        creationTime: false,
      });

      return { ...SUCCESS, lockId: conflicting.lockId };
    }

    return { error: MUTATION_LOCK_EXISTS };
  }

  // DELIBERATELY unconditional, unlike the caller-supplied-id convention applied
  // across mutate/ in 2026-08. A lockId identifies an ephemeral operational
  // claim, not tournament data — it is not replayed, mirrored, or referenced by
  // any later mutation, so there is nothing for a caller to keep stable.
  const lockId = UUID();
  const newLock: MutationLock = {
    lockId,
    lockToken,
    scope,
    expiresAt,
    createdAt: now,
    ...(methods && { methods }),
  };

  locksValue.locks.push(newLock);

  addExtension({
    element,
    extension: { name: MUTATION_LOCKS, value: locksValue },
    creationTime: false,
  });

  // Ensure tournament-level feature gate is enabled
  ensureFeatureGate(tournamentRecord, element);

  return { ...SUCCESS, lockId };
}

// When a lock is added at any level, ensure the tournament-level MUTATION_LOCKS
// extension exists with enabled: true so the interceptor knows to check.
function ensureFeatureGate(tournamentRecord: Tournament, element: any) {
  if (element === tournamentRecord) {
    // Lock was added to tournament record — set enabled on its own value
    const { extension } = findExtension({ element: tournamentRecord, name: MUTATION_LOCKS });
    if (extension?.value && !extension.value.enabled) {
      extension.value.enabled = true;
      addExtension({
        element: tournamentRecord,
        extension: { name: MUTATION_LOCKS, value: extension.value },
        creationTime: false,
      });
    }
    return;
  }

  // Lock was added to a child element — ensure tournament-level extension exists with enabled
  const { extension } = findExtension({ element: tournamentRecord, name: MUTATION_LOCKS });
  if (extension?.value) {
    if (!extension.value.enabled) {
      extension.value.enabled = true;
      addExtension({
        element: tournamentRecord,
        extension: { name: MUTATION_LOCKS, value: extension.value },
        creationTime: false,
      });
    }
  } else {
    addExtension({
      element: tournamentRecord,
      extension: { name: MUTATION_LOCKS, value: { enabled: true, locks: [] } },
      creationTime: false,
    });
  }
}
