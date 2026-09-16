import { buildIndividualIdsMap, getSharedIndividualConflicts } from '@Query/participants/individualParticipantIds';
import { addDrawEntries as addEntries } from '@Mutate/drawDefinitions/entryGovernor/addDrawEntries';
import { refreshEntryPositions } from '@Mutate/entries/refreshEntryPositions';
import { getFlightProfile } from '@Query/event/getFlightProfile';
import { getParticipantId } from '@Functions/global/extractors';
import { isAdHocType } from '@Query/drawDefinition/isAdHocType';

// constants and types
import { MAIN, VOLUNTARY_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { DIRECT_ACCEPTANCE, DIRECT_ENTRY_STATUSES, LUCKY_LOSER } from '@Constants/entryStatusConstants';
import { EntryStatusUnion } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';
import {
  SHARED_INDIVIDUAL_PARTICIPANT,
  MISSING_PARTICIPANT_IDS,
  EVENT_NOT_FOUND,
  MISSING_DRAW_ID,
  MISSING_ENTRIES,
} from '@Constants/errorConditionConstants';

export function addDrawEntries({
  suppressDuplicateEntries = true,
  tournamentRecord,
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

  // In a bracketed draw the entries of a stage are a committed field in which any two entrants may
  // be drawn against each other, so a PAIR sharing an individual with another entry in that stage
  // can produce a matchUp with one person on both sides. Checked against the entries already
  // present AND within this batch, since one call can introduce both halves of a conflict.
  //
  // Three exemptions, each for a different reason:
  //   - AD_HOC types: their entries are a roster, not a field, and one person partnering several
  //     others is the point. Generation there pairs only legal opponents instead.
  //   - VOLUNTARY_CONSOLATION and LUCKY_LOSER: these deliberately re-enter participants who are
  //     already entered elsewhere, which is why the duplicate-entry check exempts them too.
  //   - anything outside DIRECT_ENTRY_STATUSES: an ALTERNATE is a waiting list, not the field. It
  //     becomes a conflict only when promoted, which goes through this same guard.
  // Comparison is scoped to the same entryStage, because a participant in MAIN and the same
  // participant in a consolation stage are entrants in two different fields, not one conflict.
  const competing = DIRECT_ENTRY_STATUSES.includes(entryStatus ?? DIRECT_ACCEPTANCE);
  const stageExempt = entryStage === VOLUNTARY_CONSOLATION || entryStatus === LUCKY_LOSER || !competing;
  if (drawDefinition && !isAdHocType(drawDefinition.drawType) && !stageExempt) {
    const targetStage = entryStage ?? MAIN;
    const sameStageEntryIds = (drawDefinition.entries ?? [])
      .filter((entry) => (entry.entryStage ?? MAIN) === targetStage)
      .filter((entry) => DIRECT_ENTRY_STATUSES.includes(entry.entryStatus))
      .map(getParticipantId);

    const conflictingPairs = getSharedIndividualConflicts({
      individualIdsMap: buildIndividualIdsMap(tournamentRecord?.participants),
      participantIds: [...sameStageEntryIds, ...participantIds],
    }).filter(([a, b]) => participantIds.includes(a) || participantIds.includes(b));

    if (conflictingPairs.length) {
      return { error: SHARED_INDIVIDUAL_PARTICIPANT, context: { conflictingPairs } };
    }
  }

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
