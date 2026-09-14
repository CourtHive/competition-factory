import { isUngrouped } from '@Query/entries/isUngrouped';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { WITHDRAWN } from '@Constants/entryStatusConstants';
import { PAIR } from '@Constants/participantConstants';
import { DOUBLES } from '@Constants/eventConstants';

it('can add doubles events to a tournament record', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantType: PAIR, participantsCount: 32 },
    startDate: '2020-01-01',
    endDate: '2020-01-06',
  });
  const { participants } = tournamentRecord;

  tournamentEngine.setState(tournamentRecord);

  const eventName = 'Test Event';
  const event = {
    eventType: DOUBLES,
    eventName,
  };

  let result = tournamentEngine.addEvent({ event });
  const { event: eventResult, success } = result;
  const { eventId } = eventResult;
  expect(success).toEqual(true);

  const participantIds = participants
    .filter((participant) => participant.participantType === PAIR)
    .map((p) => p.participantId);
  result = tournamentEngine.addEventEntries({ eventId, participantIds });
  expect(result.success).toEqual(true);

  let { event: updatedEvent } = tournamentEngine.getEvent({ eventId });
  expect(updatedEvent.entries.length).toEqual(32);

  const pairParticipantId = updatedEvent.entries[0].participantId;
  tournamentEngine.destroyPairEntry({
    participantId: pairParticipantId,
    eventId,
  });

  ({ event: updatedEvent } = tournamentEngine.getEvent({ eventId }));
  expect(updatedEvent.entries.length).toEqual(33);

  const unpairedEntries = updatedEvent.entries.filter((entry) => isUngrouped(entry.entryStatus));
  const unpairedParticipantIds = unpairedEntries.map((entry) => entry.participantId);

  result = tournamentEngine.modifyEntriesStatus({
    participantIds: unpairedParticipantIds,
    entryStatus: WITHDRAWN,
    eventId,
  });
  expect(result.success).toEqual(true);

  const drawId = 'did';
  const values = {
    event: eventResult,
    automated: true,
    drawSize: 32,
    eventId,
    drawId,
  };
  result = tournamentEngine.generateDrawDefinition(values);
  expect(result.success).toEqual(true);
  const { positionAssignments } = result.drawDefinition.structures[0];

  result = tournamentEngine.addDrawDefinition({
    drawDefinition: result.drawDefinition,
    eventId,
  });
  expect(result.success).toEqual(true);

  const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId });
  expect(matchUps.length).toEqual(31);

  expect(positionAssignments[1].bye).toEqual(true);
});
