import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { SINGLE_ELIMINATION, FEED_IN, MAIN, QUALIFYING, PLAY_OFF, LOSER } from '@Constants/drawDefinitionConstants';

it('generates SE draw with withPlayoffs roundProfiles', () => {
  const drawSize = 32;
  const eventId = 'eventId';

  mocksEngine.generateTournamentRecord({
    eventProfiles: [{ eventId, eventName: 'Mock Event', participantsProfile: { participantsCount: drawSize } }],
    setState: true,
  });

  const result = tournamentEngine.generateDrawDefinition({
    drawType: SINGLE_ELIMINATION,
    drawSize,
    eventId,
    withPlayoffs: { roundProfiles: [{ 3: 1 }] },
  });
  expect(result.success).toEqual(true);

  const { drawDefinition } = result;
  const structures = drawDefinition.structures;
  const mainStructure = structures.find((s) => s.stage === MAIN);
  const playoffStructures = structures.filter((s) => s.stage === PLAY_OFF);

  expect(mainStructure).toBeDefined();
  expect(playoffStructures.length).toEqual(1);

  // Verify LOSER links exist connecting main to playoff
  const loserLinks = drawDefinition.links?.filter((l) => l.linkType === LOSER);
  expect(loserLinks.length).toBeGreaterThanOrEqual(1);
});

it('generates FEED_IN draw with multiple playoff structures', () => {
  const drawSize = 32;
  const eventId = 'eventId';

  mocksEngine.generateTournamentRecord({
    eventProfiles: [{ eventId, eventName: 'Mock Event', participantsProfile: { participantsCount: drawSize } }],
    setState: true,
  });

  const result = tournamentEngine.generateDrawDefinition({
    drawType: FEED_IN,
    drawSize,
    eventId,
    withPlayoffs: {
      roundProfiles: [{ 3: 1 }, { 4: 1 }],
      playoffAttributes: {
        '0-1': { name: '3-4 Playoff', abbreviation: '3-4' },
        '0-2': { name: '5-8 Playoff', abbreviation: '5-8' },
      },
    },
  });
  expect(result.success).toEqual(true);

  const { drawDefinition } = result;
  const playoffStructures = drawDefinition.structures.filter((s) => s.stage === PLAY_OFF);
  expect(playoffStructures.length).toEqual(2);

  const loserLinks = drawDefinition.links?.filter((l) => l.linkType === LOSER);
  expect(loserLinks.length).toBeGreaterThanOrEqual(2);
});

it('generates SE draw with both qualifyingProfiles and withPlayoffs', () => {
  const drawSize = 32;
  const eventId = 'eventId';

  mocksEngine.generateTournamentRecord({
    eventProfiles: [{ eventId, eventName: 'Mock Event', participantsProfile: { participantsCount: 48 } }],
    setState: true,
  });

  const result = tournamentEngine.generateDrawDefinition({
    drawType: SINGLE_ELIMINATION,
    drawSize,
    eventId,
    qualifyingProfiles: [
      {
        roundTarget: 1,
        structureProfiles: [{ drawSize: 16, qualifyingPositions: 4 }],
      },
    ],
    withPlayoffs: { roundProfiles: [{ 3: 1 }] },
  });
  expect(result.success).toEqual(true);

  const { drawDefinition } = result;
  const mainStructures = drawDefinition.structures.filter((s) => s.stage === MAIN);
  const qualifyingStructures = drawDefinition.structures.filter((s) => s.stage === QUALIFYING);
  const playoffStructures = drawDefinition.structures.filter((s) => s.stage === PLAY_OFF);

  expect(mainStructures.length).toEqual(1);
  expect(qualifyingStructures.length).toBeGreaterThanOrEqual(1);
  expect(playoffStructures.length).toEqual(1);
});

it('generates SE draw without withPlayoffs — no playoff structures', () => {
  const drawSize = 32;
  const eventId = 'eventId';

  mocksEngine.generateTournamentRecord({
    eventProfiles: [{ eventId, eventName: 'Mock Event', participantsProfile: { participantsCount: drawSize } }],
    setState: true,
  });

  const result = tournamentEngine.generateDrawDefinition({
    drawType: SINGLE_ELIMINATION,
    drawSize,
    eventId,
  });
  expect(result.success).toEqual(true);

  const { drawDefinition } = result;
  const playoffStructures = drawDefinition.structures.filter((s) => s.stage === PLAY_OFF);
  expect(playoffStructures.length).toEqual(0);
});
