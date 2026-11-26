import tournamentEngine from '@Engines/syncEngine';
import { mocksEngine } from '../../../..';
import { expect, test } from 'vitest';

// constants
import { MALE } from '@Constants/genderConstants';
import { TEAM } from '@Constants/eventConstants';

test('hydrateCollections gives the default TEAM format the event category and gender', () => {
  const category = { ageCategoryCode: 'U18' };
  const gender = MALE;

  mocksEngine.generateTournamentRecord({
    participantsProfile: { participantType: TEAM, participantsCount: 8 },
    setState: true,
  });
  // an event with no tieFormat: its draw takes the default TEAM format, which the factory builds
  let result: any = tournamentEngine.addEvent({ event: { eventType: TEAM, category, gender } });
  expect(result.success).toEqual(true);
  const { eventId } = result.event;

  result = tournamentEngine.generateDrawDefinition({ hydrateCollections: true, drawSize: 8, eventId });
  expect(result.success).toEqual(true);

  for (const def of result.drawDefinition.tieFormat.collectionDefinitions) {
    expect(def.category).toEqual(category);
    expect(def.gender).toEqual(gender);
  }
});
