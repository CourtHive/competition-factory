import { getAssignedParticipantIds } from '@Query/drawDefinition/getAssignedParticipantIds';
import { deleteParticipants } from '@Mutate/participants/deleteParticipants';
import { getFlightProfile } from '@Query/event/getFlightProfile';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { expect, it } from 'vitest';

// constants and types
import { EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT } from '@Constants/errorConditionConstants';
import { ALTERNATE } from '@Constants/entryStatusConstants';
import { Event, Tournament } from '@Types/tournamentTypes';
import { PAIR } from '@Constants/participantConstants';
import { DOUBLES } from '@Constants/eventConstants';

/**
 * Deleting an INDIVIDUAL also deletes every PAIR containing it. The PAIR was deleted, but its event, flight
 * and draw entries were left pointing at it — and a PAIR positioned in a DOUBLES draw did not block the
 * deletion, so a drawPosition was left assigned to a deleted participant.
 */

const pairsOf = (tournamentRecord: Tournament, individualParticipantId: string) =>
  (tournamentRecord.participants ?? []).filter(
    ({ participantType, individualParticipantIds }) =>
      participantType === PAIR && individualParticipantIds?.includes(individualParticipantId),
  );

const participantExists = (tournamentRecord: Tournament, participantId: string) =>
  (tournamentRecord.participants ?? []).some((participant) => participant.participantId === participantId);

// every place an entry for participantId can live: event entries, flight drawEntries, draw entries
function entryLocations(event: Event, participantId: string): string[] {
  const locations: string[] = [];
  if (event.entries?.some((entry) => entry.participantId === participantId)) locations.push('event');
  for (const flight of getFlightProfile({ event }).flightProfile?.flights ?? []) {
    if (flight.drawEntries?.some((entry) => entry.participantId === participantId)) locations.push('flight');
  }
  for (const drawDefinition of event.drawDefinitions ?? []) {
    if (drawDefinition.entries?.some((entry) => entry.participantId === participantId)) locations.push('draw');
  }
  return locations;
}

it('refuses to delete an individual whose PAIR is positioned in a DOUBLES draw, and changes nothing', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, eventType: DOUBLES }],
  });
  const drawDefinition = tournamentRecord.events?.[0].drawDefinitions?.[0];
  const positionedPairId = getAssignedParticipantIds({ drawDefinition }).assignedParticipantIds?.[0] as string;
  const pair = (tournamentRecord.participants ?? []).find(({ participantId }) => participantId === positionedPairId);
  const individualParticipantId = pair?.individualParticipantIds?.[0] as string;
  expect(pair?.participantType).toEqual(PAIR);
  expect(individualParticipantId).toBeDefined();
  const before = makeDeepCopy(tournamentRecord, false, true);

  const result = deleteParticipants({ tournamentRecord, participantIds: [individualParticipantId] });

  expect(result.error).toEqual(EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT);
  expect(tournamentRecord).toEqual(before);
});

it('removes the event, flight and draw entries of an unpositioned PAIR deleted with its individual', () => {
  // the alternate PAIR is in the event, the flight and the draw — but holds no drawPosition
  const {
    tournamentRecord: generated,
    drawIds: [drawId],
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, eventType: DOUBLES }],
    participantsProfile: { participantsCount: 6 },
  });
  tournamentEngine.setState(generated);
  const enteredIds = tournamentEngine.getEvent({ eventId }).event.entries.map(({ participantId }) => participantId);
  const alternatePairId = tournamentEngine
    .getParticipants({ participantFilters: { participantTypes: [PAIR] } })
    .participants.find(({ participantId }) => !enteredIds.includes(participantId))?.participantId;
  expect(alternatePairId).toBeDefined();
  const added = tournamentEngine.addEventEntries({
    participantIds: [alternatePairId],
    entryStatus: ALTERNATE,
    eventId,
    drawId,
  });
  expect(added.success).toEqual(true);

  const tournamentRecord: Tournament = tournamentEngine.getTournament().tournamentRecord;
  const event = tournamentRecord.events?.[0] as Event;
  expect(entryLocations(event, alternatePairId)).toEqual(['event', 'flight', 'draw']);
  const individualParticipantId = (tournamentRecord.participants ?? []).find(
    ({ participantId }) => participantId === alternatePairId,
  )?.individualParticipantIds?.[0] as string;
  const entriesCountBefore = event.entries?.length ?? 0;

  const result = deleteParticipants({ tournamentRecord, participantIds: [individualParticipantId] });

  expect(result.success).toEqual(true);
  expect(result.participantsRemovedCount).toEqual(2);
  expect(participantExists(tournamentRecord, alternatePairId)).toEqual(false);
  expect(entryLocations(event, alternatePairId)).toEqual([]);
  expect(event.entries?.length).toEqual(entriesCountBefore - 1);
  // nothing anywhere names a participant that no longer exists
  const participantIds = new Set((tournamentRecord.participants ?? []).map(({ participantId }) => participantId));
  for (const entry of event.entries ?? []) expect(participantIds.has(entry.participantId)).toEqual(true);
});

it('deletes an individual entered only through an undrawn PAIR, with the PAIR and its entries', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, eventType: DOUBLES, generate: false }],
  });
  const event = tournamentRecord.events?.[0] as Event;
  const pairParticipantId = event.entries?.[0].participantId as string;
  const individualParticipantId = (tournamentRecord.participants ?? []).find(
    ({ participantId }) => participantId === pairParticipantId,
  )?.individualParticipantIds?.[0] as string;
  expect(pairsOf(tournamentRecord, individualParticipantId).map(({ participantId }) => participantId)).toEqual([
    pairParticipantId,
  ]);

  const result = deleteParticipants({ tournamentRecord, participantIds: [individualParticipantId] });

  expect(result.success).toEqual(true);
  expect(result.participantsRemovedCount).toEqual(2);
  expect(participantExists(tournamentRecord, individualParticipantId)).toEqual(false);
  expect(participantExists(tournamentRecord, pairParticipantId)).toEqual(false);
  expect(entryLocations(event, pairParticipantId)).toEqual([]);
  expect(event.entries?.length).toEqual(3);
});
