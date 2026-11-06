import { modifiedOutsideDraws, UNNAMED_TOURNAMENT } from '@Global/state/noticeIdentity';
import { updateFactoryExtension } from '@Mutate/extensions/updateFactoryExtension';
import { factoryVersion } from '@Functions/global/factoryVersion';
import {
  cycleModifiedTournamentIds,
  cycleModifiedTopics,
  cycleMutationStatus,
  getCapturedStamps,
  getStampScope,
  getTournamentRecords,
} from '@Global/state/globalState';

// constants and types
import { STAMP_SCOPE_MODIFIED } from '@Constants/stampScopeConstants';
import { Tournament } from '@Types/tournamentTypes';

export function getMutationStatus({ timeStamp }): boolean {
  const tournamentRecords = getTournamentRecords();
  const mutationStatus = cycleMutationStatus();
  // only the records the call modified are stamped: a record that was merely loaded beside them is not (it was, with a
  // version and an instant that said it had been written). A provider without the hook stamps every loaded record.
  const modifiedIds = cycleModifiedTournamentIds();
  const modified = (tournamentRecord: unknown) =>
    !modifiedIds ||
    modifiedIds.has(UNNAMED_TOURNAMENT) ||
    modifiedIds.has((tournamentRecord as Tournament)?.tournamentId);
  // read on every call, so a call's topics never reach the next one's
  const modifiedTopics = cycleModifiedTopics();
  if (mutationStatus) {
    const value = { version: factoryVersion(), timeStamp };
    const byScope = getStampScope() === STAMP_SCOPE_MODIFIED;
    Object.values(tournamentRecords)
      .filter(modified)
      .forEach((tournamentRecord) => {
        const drawsStamped = byScope ? stampModifiedDraws(tournamentRecord as Tournament, value) : 0;
        // the tournament too when something outside its draws changed, or no draw can be named as the change
        if (!byScope || !drawsStamped || modifiedOutsideDraws(modifiedTopics))
          updateFactoryExtension({ tournamentRecord, value });
      });
  }
  return mutationStatus;
}

/**
 * Under `stampScope('modified')`: stamps each drawDefinition the call modified, which the call's `updatedAt` ledger
 * names (a drawDefinition is entered there when its `updatedAt` is stamped). Returns how many; 0 when the provider keeps
 * no ledger, and the tournament is then stamped instead.
 */
function stampModifiedDraws(tournamentRecord: Tournament, value: { version: string; timeStamp: number }) {
  const stamped = getCapturedStamps();
  if (!stamped) return 0;
  let count = 0;
  for (const event of tournamentRecord?.events ?? []) {
    for (const drawDefinition of event.drawDefinitions ?? []) {
      if (!stamped.has(drawDefinition)) continue;
      updateFactoryExtension({ element: drawDefinition, value });
      count += 1;
    }
  }
  return count;
}
