import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { ANY, FEMALE, MALE, MIXED } from '@Constants/genderConstants';

it('supports adding MALE/FEMALE to ANY and MIXED gender events', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      { drawId: 'd1', gender: FEMALE, drawSize: 32 },
      { drawId: 'd2', gender: MIXED, drawSize: 32 },
      { drawId: 'd3', gender: MALE, drawSize: 32 },
      { drawId: 'd4', gender: ANY, drawSize: 32 },
    ],
  });

  let result = tournamentEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);

  const participants = tournamentEngine.getParticipants().participants;
  const femaleParticipant = participants.find((p) => p.person?.sex === FEMALE);
  const maleParticipant = participants.find((p) => p.person?.sex === MALE);

  let event = tournamentEngine.getEvent({ drawId: 'd4' }).event;
  expect(event.gender).toEqual(ANY);

  result = tournamentEngine.addEventEntries({
    participantIds: [femaleParticipant.participantId, maleParticipant.participantId],
    entryStatus: 'ALTERNATE',
    eventId: event.eventId,
  });
  expect(result.success).toEqual(true);

  event = tournamentEngine.getEvent({ drawId: 'd2' }).event;
  expect(event.gender).toEqual(MIXED);

  result = tournamentEngine.addEventEntries({
    participantIds: [femaleParticipant.participantId, maleParticipant.participantId],
    entryStatus: 'ALTERNATE',
    eventId: event.eventId,
  });
  expect(result.success).toEqual(true);
});
