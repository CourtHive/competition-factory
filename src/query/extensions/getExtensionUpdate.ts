import { findExtension } from '@Acquire/findExtension';

import { QueueMethod, TournamentRecords } from '@Types/factoryTypes';
import { ErrorType, MISSING_TOURNAMENT_RECORDS } from '@Constants/errorConditionConstants';

/**
 * Specific to deployments where both client and server are running competitionEngine.
 *
 * Supports execution model where client makes local updates which are not communicated to server and then...
 * ...when client is ready to communicate extension updates to server it requests an array of update methods
 * This method is "wrapped" by other methods which pass in `extensionName`
 */

type GetExtensionUpdateArgs = {
  tournamentRecords: TournamentRecords;
  extensionName: string;
  // CODES: when the extension has been promoted to a first-class group leaf
  // (e.g. SCHEDULE_TIMING → scheduling.timing) NATIVE records carry no legacy
  // extension. Pass the promoted location so the sync method is still emitted.
  firstClass?: { groupAttribute: string; leafAttribute: string };
};

export function getExtensionUpdate({
  tournamentRecords,
  extensionName,
  firstClass,
}: GetExtensionUpdateArgs): { error?: ErrorType } | { methods: QueueMethod[] } {
  if (typeof tournamentRecords !== 'object' || !Object.keys(tournamentRecords).length)
    return { error: MISSING_TOURNAMENT_RECORDS };

  const methods: any[] = [];
  let tournamentExtensionAdded;
  for (const tournamentRecord of Object.values(tournamentRecords)) {
    const { extension } = findExtension({
      element: tournamentRecord,
      name: extensionName,
    });

    // In NATIVE writeMode the promoted value lives first-class with no extension mirror;
    // synthesize the extension shape so the replay method is emitted in every writeMode.
    const firstClassValue = firstClass && tournamentRecord?.[firstClass.groupAttribute]?.[firstClass.leafAttribute];
    const tournamentExtension =
      extension ?? (firstClassValue !== undefined ? { name: extensionName, value: firstClassValue } : undefined);

    // only necessary to push this method once to cover both tournaments
    if (tournamentExtension && !tournamentExtensionAdded) {
      methods.push({
        params: { extension: tournamentExtension, discover: true },
        method: 'addExtension',
      });
      tournamentExtensionAdded = true;
    }
    const tournamentEvents = tournamentRecord.events ?? [];

    for (const event of tournamentEvents) {
      const { eventId } = event;
      const { extension } = findExtension({
        name: extensionName,
        element: event,
      });
      if (extension) {
        methods.push({
          params: { eventId, extension },
          method: 'addEventExtension',
        });
      }
    }
  }

  return { methods };
}
