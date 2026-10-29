import { cycleModifiedTournamentIds, cycleMutationStatus, getTournamentRecords } from '@Global/state/globalState';
import { updateFactoryExtension } from '@Mutate/extensions/updateFactoryExtension';
import { UNNAMED_TOURNAMENT } from '@Global/state/noticeIdentity';
import { factoryVersion } from '@Functions/global/factoryVersion';

// types
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
  if (mutationStatus) {
    Object.values(tournamentRecords)
      .filter(modified)
      .forEach((tournamentRecord) => {
        updateFactoryExtension({
          tournamentRecord,
          value: {
            version: factoryVersion(),
            timeStamp,
          },
        });
      });
  }
  return mutationStatus;
}
