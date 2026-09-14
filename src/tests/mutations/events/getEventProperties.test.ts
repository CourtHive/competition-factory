import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { SINGLES } from '@Constants/eventConstants';
import { RATING } from '@Constants/scaleConstants';

it('can get event properties to determine if there are seeded, ranked, or rated participants', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 100 },
  });
  const { participants } = tournamentRecord;
  tournamentEngine.setState(tournamentRecord);

  const eventName = 'Test Event';
  const event = {
    eventName,
    eventType: SINGLES,
    category: {
      categoryName: 'WTN',
    },
  };

  let result = tournamentEngine.addEvent({ event });
  const { event: eventResult, success } = result;
  const { eventId } = eventResult;
  expect(success).toEqual(true);

  const participantIds = participants.map((p) => p.participantId);
  result = tournamentEngine.addEventEntries({ eventId, participantIds });
  expect(result.success).toEqual(true);

  const scaleItemsWithParticipantIds = participants.map((participant) => {
    const { participantId } = participant;
    const scaleItems = [
      {
        scaleValue: 8.3,
        scaleName: 'WTN',
        scaleType: RATING,
        eventType: SINGLES,
        scaleDate: '2021-01-01',
      },
    ];

    return { participantId, scaleItems };
  });

  tournamentEngine.setParticipantScaleItems({
    scaleItemsWithParticipantIds,
  });

  const {
    tournamentRecord: { participants: modifiedParticipants },
  } = tournamentEngine.getTournament();

  modifiedParticipants.forEach((participant) => {
    expect(participant.timeItems.length).toEqual(1);
  });

  result = tournamentEngine.getEventProperties({ eventId });
  expect(result.hasSeededParticipants).toEqual(false);
  expect(result.hasRankedParticipants).toEqual(false);
  expect(result.hasRatedParticipants).toEqual(true);
});
