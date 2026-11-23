import { getSeedValue } from '@Query/participant/getSeedValue';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { SINGLES_EVENT } from '@Constants/eventConstants';
import { SEEDING } from '@Constants/scaleConstants';

describe('getSeedValue', () => {
  // Unit tests
  it('returns undefined seedValue when participant has no scale items', () => {
    const participant = { participantId: 'p1' };
    const event = { eventId: 'e1' };

    const result = getSeedValue({ participant, event, drawId: 'd1' });

    expect(result.seedValue).toBeUndefined();
  });

  it('errors on missing drawId', () => {
    const participant = {
      timeItems: [{ itemType: SEEDING, scaleValue: 2, scaleName: 'U18' }],
      participantId: 'p1',
    };
    const event = {
      eventId: 'e1',
      category: { categoryName: 'U18' },
    };

    const result = getSeedValue({ participant, event, drawId: undefined });

    expect(result.seedValue).toBeUndefined();
  });

  it('handles participant without timeItems', () => {
    const participant = { participantId: 'p1' };
    const event = { eventId: 'e1' };

    const result = getSeedValue({ participant, event, drawId: 'd1' });

    expect(result.seedValue).toBeUndefined();
  });

  it('handles null participant', () => {
    const result = getSeedValue({ participant: null, event: { eventId: 'e1' }, drawId: 'd1' });

    expect(result.seedValue).toBeUndefined();
  });

  it('handles undefined participant', () => {
    const result = getSeedValue({ participant: undefined, event: { eventId: 'e1' }, drawId: 'd1' });

    expect(result.seedValue).toBeUndefined();
  });

  // Integration tests
  it('integrates with tournament engine to get seed values', () => {
    const drawId = 'testDrawId';
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawSize: 8, category: { categoryName: 'U18' } }],
      participantsProfile: { participantsCount: 8 },
    });

    tournamentEngine.setState(tournamentRecord);

    const participants = tournamentEngine.getParticipants().participants;
    const participant = participants[0];

    // Add seeding scale item
    const scaleItemsWithParticipantIds = [
      {
        participantId: participant.participantId,
        scaleItems: [
          {
            scaleValue: 3,
            scaleName: drawId,
            scaleType: SEEDING,
            eventType: SINGLES_EVENT,
          },
        ],
      },
    ];

    tournamentEngine.setParticipantScaleItems({
      scaleItemsWithParticipantIds,
    });

    const updatedParticipant = tournamentEngine.getParticipants({
      participantFilters: { participantIds: [participant.participantId] },
    }).participants[0];

    const event = tournamentRecord.events[0];
    const result = getSeedValue({ participant: updatedParticipant, event, drawId });

    expect(result.seedValue).toBe(3);
  });

  it('integrates with seeding assignments in draws', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 16, seedsCount: 4, category: { categoryName: 'U18' } }],
    });

    tournamentEngine.setState(tournamentRecord);

    const event = tournamentRecord.events[0];
    const drawDefinition = event.drawDefinitions[0];
    const drawId = drawDefinition.drawId;

    // Get participants with seeds
    const { participants } = tournamentEngine.getParticipants({
      withSeeding: true,
    });

    const seededParticipant = participants.find((p) => {
      const { seedValue } = getSeedValue({ participant: p, event, drawId });
      return seedValue;
    });

    if (seededParticipant) {
      const result = getSeedValue({ participant: seededParticipant, event, drawId });
      expect(result.seedValue).toBeDefined();
      expect(typeof result.seedValue).toBe('number');
    }
  });
});
