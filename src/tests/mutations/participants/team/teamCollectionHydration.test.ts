import tournamentEngine from '@Engines/syncEngine';
import { mocksEngine } from '../../../..';
import { expect, test } from 'vitest';

// constants
import { DOMINANT_DUO } from '@Constants/tieFormatConstants';
import { MALE } from '@Constants/genderConstants';
import { TEAM } from '@Constants/eventConstants';

test('it can use tieFormatName in addEvent', () => {
  const category = { ageCategoryCode: 'U18' };
  const participantsCount = 8;
  const gender = MALE;

  const {
    eventIds: [eventId],
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantType: TEAM, participantsCount },
    eventProfiles: [
      {
        drawProfiles: [{ drawSize: 16 }],
        eventType: TEAM,
        category,
        gender,
      },
    ],
  });

  let result = tournamentEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);

  result = tournamentEngine.deleteDrawDefinitions({
    drawIds: [drawId],
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.generateDrawDefinition({
    tieFormatName: DOMINANT_DUO,
    hydrateCollections: true,
    drawSize: 16,
    eventId,
  });

  for (const def of result.drawDefinition.tieFormat.collectionDefinitions) {
    expect(def.category).toEqual(category);
    expect(def.gender).toEqual(gender);
  }
});
