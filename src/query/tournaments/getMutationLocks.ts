import { findExtension } from '@Acquire/findExtension';

// constants and types
import { MutationLock, MutationLockScope, MutationLocksValue } from '@Types/mutationLockTypes';
import { ErrorType, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { MUTATION_LOCKS } from '@Constants/extensionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { Tournament } from '@Types/tournamentTypes';
import { nowIso } from '@Tools/clock';

type MutationLockEntry = MutationLock & {
  drawId?: string;
  eventId?: string;
  venueId?: string;
};

type GetMutationLocksArgs = {
  tournamentRecord: Tournament;
  scope?: MutationLockScope;
};

export function getMutationLocks(params: GetMutationLocksArgs): {
  success?: boolean;
  error?: ErrorType;
  mutationLocks?: MutationLockEntry[];
} {
  const { tournamentRecord, scope } = params;

  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  const now = nowIso();
  const result: MutationLockEntry[] = [];

  // Helper to extract active locks from an element
  const collectLocks = (element: any, context?: { drawId?: string; eventId?: string; venueId?: string }) => {
    const { extension } = findExtension({ element, name: MUTATION_LOCKS });
    const locksValue: MutationLocksValue = extension?.value ?? { locks: [] };

    for (const lock of locksValue.locks) {
      // Skip expired
      if (lock.expiresAt !== null && lock.expiresAt <= now) continue;
      // Filter by scope if specified
      if (scope && lock.scope !== scope) continue;
      result.push({ ...lock, ...context });
    }
  };

  // 1. Tournament-level locks
  collectLocks(tournamentRecord);

  // 2. Event and draw-level locks
  const events = tournamentRecord.events ?? [];
  for (const event of events) {
    collectLocks(event, { eventId: event.eventId });

    const drawDefinitions = event.drawDefinitions ?? [];
    for (const drawDefinition of drawDefinitions) {
      collectLocks(drawDefinition, { eventId: event.eventId, drawId: drawDefinition.drawId });
    }
  }

  // 3. Venue-level locks
  const venues = tournamentRecord.venues ?? [];
  for (const venue of venues) {
    collectLocks(venue, { venueId: venue.venueId });
  }

  return { ...SUCCESS, mutationLocks: result };
}
