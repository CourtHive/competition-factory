import { methodScopeMap } from '@Constants/mutationLockScopeMap';
import { addExtension } from '@Mutate/extensions/addExtension';
import { findExtension } from '@Acquire/findExtension';
import { findVenue } from '@Query/venues/findVenue';

// constants and types
import { MutationLock, MutationLocksValue } from '@Types/mutationLockTypes';
import { MUTATION_LOCKED } from '@Constants/errorConditionConstants';
import { MUTATION_LOCKS } from '@Constants/extensionConstants';

// Returns an error result if the method is blocked by a mutation lock, or undefined if allowed.
export function checkMutationLock(
  methodName: string,
  params: { [key: string]: any } | undefined,
  tournamentRecord: any,
): { error: typeof MUTATION_LOCKED; info?: string } | undefined {
  if (!params || !tournamentRecord) return undefined;

  // Fast gate: check if mutation locks are enabled on this tournament.
  // This is a direct in-memory array scan — no function call overhead.
  const gateLock = tournamentRecord.extensions?.find((ext) => ext?.name === MUTATION_LOCKS);
  if (!gateLock?.value?.enabled) return undefined;

  const scope = methodScopeMap[methodName];
  if (!scope) return undefined; // unmapped methods are never locked

  const lockToken = params.lockToken;
  const now = new Date().toISOString();

  // Build the hierarchy of elements to check (most specific first)
  const elements: { element: any; label: string }[] = [];

  if (params.drawDefinition) {
    elements.push({ element: params.drawDefinition, label: `draw:${params.drawDefinition.drawId}` });
  }
  if (params.event) {
    elements.push({ element: params.event, label: `event:${params.event.eventId}` });
  }
  // For venue-scoped methods, resolve the venue
  if (params.venueId) {
    const venueResult = findVenue({ tournamentRecord, venueId: params.venueId });
    if (venueResult.venue) {
      elements.push({ element: venueResult.venue, label: `venue:${params.venueId}` });
    }
  }
  // Always check tournament level (hierarchical: blocks all children)
  elements.push({ element: tournamentRecord, label: 'tournament' });

  for (const { element, label } of elements) {
    const blockResult = checkElementLocks({ element, scope, methodName, lockToken, now, label });
    if (blockResult) return blockResult;
  }

  return undefined;
}

function checkElementLocks({
  element,
  scope,
  methodName,
  lockToken,
  now,
  label,
}: {
  element: any;
  scope: string;
  methodName: string;
  lockToken?: string;
  now: string;
  label: string;
}): { error: typeof MUTATION_LOCKED; info?: string } | undefined {
  const { extension } = findExtension({ element, name: MUTATION_LOCKS });
  if (!extension?.value?.locks?.length) return undefined;

  const locksValue: MutationLocksValue = extension.value;
  let needsWrite = false;

  for (let i = locksValue.locks.length - 1; i >= 0; i--) {
    const lock: MutationLock = locksValue.locks[i];
    if (lock.scope !== scope) continue;

    // If lock has methods array, check whether this method is covered
    if (lock.methods && !lock.methods.includes(methodName)) continue;

    // Check expiry
    if (lock.expiresAt !== null && lock.expiresAt <= now) {
      // Expired — remove lazily
      locksValue.locks.splice(i, 1);
      needsWrite = true;
      continue;
    }

    // Active lock found — check token
    if (lockToken && lockToken === lock.lockToken) {
      // Token matches, allow
      if (needsWrite) {
        addExtension({ element, extension: { name: MUTATION_LOCKS, value: locksValue }, creationTime: false });
      }
      return undefined;
    }

    // Blocked
    if (needsWrite) {
      addExtension({ element, extension: { name: MUTATION_LOCKS, value: locksValue }, creationTime: false });
    }
    return { error: MUTATION_LOCKED, info: `Locked by ${label} (scope: ${lock.scope}, lockId: ${lock.lockId})` };
  }

  if (needsWrite) {
    addExtension({ element, extension: { name: MUTATION_LOCKS, value: locksValue }, creationTime: false });
  }

  return undefined;
}
