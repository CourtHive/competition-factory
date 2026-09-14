import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { xa } from '@Tools/extractAttributes';
import { expect, it } from 'vitest';

// constants
import { SINGLES } from '@Constants/eventConstants';
import { SEEDING } from '@Constants/scaleConstants';

it('supports manual seeding with alphanumeric values', () => {
  const mockProfile = {
    drawProfiles: [
      {
        generate: false,
        drawSize: 16,
      },
    ],
  };

  const {
    tournamentRecord,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord(mockProfile);
  tournamentEngine.setState(tournamentRecord);

  const event = tournamentEngine.getEvent({ eventId }).event;
  const entriesToSeed = event.entries.slice(0, 4);

  const scaleItemsWithParticipantIds = entriesToSeed.map((entry, index) => ({
    participantId: entry.participantId,
    scaleItems: [
      {
        scaleValue: (index + 1).toString(),
        scaleType: SEEDING,
        eventType: SINGLES,
        scaleName: eventId,
      },
    ],
  }));

  const method = {
    params: { scaleItemsWithParticipantIds },
    method: 'setParticipantScaleItems',
  };

  const result = tournamentEngine.executionQueue([method]);
  expect(result.success).toEqual(true);

  const { drawDefinition } = tournamentEngine.generateDrawDefinition({
    seedingScaleName: eventId,
    seedsCount: 4,
    eventId,
  });
  const seedAssignments = drawDefinition.structures[0].seedAssignments;
  expect(seedAssignments.length).toEqual(4);
  const seededParticipantIds = seedAssignments.map(xa('participantId')).filter(Boolean);
  expect(seededParticipantIds.length).toEqual(4);
});
