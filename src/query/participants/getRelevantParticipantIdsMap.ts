import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { INDIVIDUAL } from '@Constants/participantConstants';
import { isFunction } from '@Tools/objects';

// types
import { Tournament } from '@Types/tournamentTypes';

type GetRelevantParticipantIdsArgs = {
  tournamentRecords?: { [key: string]: Tournament };
  tournamentRecord?: Tournament;
  processParticipantId: any;
};

export function getRelevantParticipantIdsMap({
  processParticipantId, // optional method which is passed each participantId
  tournamentRecords,
  tournamentRecord,
}: GetRelevantParticipantIdsArgs) {
  if (typeof tournamentRecord !== 'object' && typeof tournamentRecords !== 'object')
    return { error: MISSING_TOURNAMENT_RECORD };

  // build up a mapping of all participantIds to all of the individualParticipantIds that they reference
  // this map includes the key participantId as a value of the array of relevantParticipantIds
  const allParticipants = tournamentRecords
    ? Object.values(tournamentRecords)
        .map((tournamentRecord: any) => tournamentRecord?.participants ?? [])
        .flat()
    : (tournamentRecord?.participants ?? []);

  const relevantParticipantIdsMap = Object.assign(
    {},
    ...allParticipants.map(({ participantId, participantType, individualParticipantIds }) => {
      isFunction(processParticipantId) && processParticipantId(participantId);

      const individualParticipantIdObjects = (individualParticipantIds ?? []).map((relevantParticipantId) => ({
        participantType: INDIVIDUAL,
        relevantParticipantId,
      }));

      return {
        [participantId]: individualParticipantIdObjects.concat({
          relevantParticipantId: participantId,
          participantType,
        }),
      };
    }),
  );

  return { relevantParticipantIdsMap };
}
