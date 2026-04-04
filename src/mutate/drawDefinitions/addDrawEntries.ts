import { addDrawEntries as addEntries } from '@Mutate/drawDefinitions/entryGovernor/addDrawEntries';
import { refreshEntryPositions } from '@Mutate/entries/refreshEntryPositions';
import { getParticipantId } from '@Functions/global/extractors';
import { getFlightProfile } from '@Query/event/getFlightProfile';

// constants and types
import { VOLUNTARY_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { LUCKY_LOSER } from '@Constants/entryStatusConstants';
import { EntryStatusUnion } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';
import {
  EVENT_NOT_FOUND,
  MISSING_DRAW_ID,
  MISSING_ENTRIES,
  MISSING_PARTICIPANT_IDS,
} from '@Constants/errorConditionConstants';

export function addDrawEntries({
  suppressDuplicateEntries = true,
  autoEntryPositions = true,
  entryStageSequence,
  ignoreStageSpace,
  participantIds,
  drawDefinition,
  entryStatus,
  roundTarget,
  entryStage,
  extension,
  drawId,
  event,
}) {
  if (!participantIds?.length) return { error: MISSING_PARTICIPANT_IDS };
  if (!event) return { error: EVENT_NOT_FOUND };
  if (!drawId) return { error: MISSING_DRAW_ID };

  const eventEnteredParticipantIds = (event.entries ?? []).map(getParticipantId);
  const missingEventEntries = participantIds.filter(
    (participantId) => !eventEnteredParticipantIds.includes(participantId),
  );
  if (missingEventEntries.length) return { error: MISSING_ENTRIES };

  if (drawDefinition) {
    const result = addEntries({
      stageSequence: entryStageSequence,
      suppressDuplicateEntries,
      autoEntryPositions,
      stage: entryStage,
      ignoreStageSpace,
      participantIds,
      drawDefinition,
      entryStatus,
      roundTarget,
      extension,
    });
    if (result.error) return result;
  }

  const { flightProfile } = getFlightProfile({ event });
  const flight = flightProfile?.flights.find((flight) => flight.drawId === drawId);

  if (flight?.drawEntries) {
    participantIds.forEach((participantId) => {
      const invalidLuckyLoser =
        entryStatus === LUCKY_LOSER &&
        participantInFlightEntries({
          participantId,
          entryStatus,
          flight,
        });
      const invalidVoluntaryConsolation =
        entryStage === VOLUNTARY_CONSOLATION &&
        participantInFlightEntries({
          participantId,
          entryStage,
          flight,
        });
      const invalidEntry =
        entryStatus !== LUCKY_LOSER &&
        entryStage !== VOLUNTARY_CONSOLATION &&
        participantInFlightEntries({ flight, participantId });

      if (!invalidEntry && !invalidLuckyLoser && !invalidVoluntaryConsolation) {
        flight.drawEntries.push({
          participantId,
          entryStatus,
          entryStage,
        });
      }
    });

    if (autoEntryPositions) {
      flight.drawEntries = refreshEntryPositions({
        entries: flight.drawEntries,
      });
    }
  }

  return { ...SUCCESS };
}

type ParticipantInFlightEntriesArgs = {
  entryStatus?: EntryStatusUnion;
  participantId: string;
  entryStage?: string;
  flight: any;
};
function participantInFlightEntries({
  participantId,
  entryStatus,
  entryStage,
  flight,
}: ParticipantInFlightEntriesArgs) {
  const inEntries = flight.drawEntries?.find(
    (entry) =>
      entry.participantId === participantId &&
      (!entryStatus || entryStatus === entry.entryStatus) &&
      (!entryStage || entryStage === entry.entryStage),
  );
  return participantId && inEntries;
}
