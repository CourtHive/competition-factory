import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { QUALIFYING } from '@Constants/drawDefinitionConstants';

test('generate qualifying structure with round robin format', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 16,
        qualifyingProfiles: [
          {
            roundTarget: 1,
            structureProfiles: [
              {
                drawSize: 8,
                qualifyingPositions: 4,
                drawType: 'ROUND_ROBIN',
                structureOptions: { groupSize: 4 },
              },
            ],
          },
        ],
      },
    ],
    setState: true,
  });

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  expect(drawDefinition.structures.length).toBeGreaterThan(1);

  const qualifyingStructures = drawDefinition.structures.filter((s) => s.stage === QUALIFYING);
  expect(qualifyingStructures.length).toBeGreaterThan(0);
});

test('generate qualifying structure with multiple qualifying rounds', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 32,
        // 4 round 1 qualifiers, 2 round 2 qualifiers each facing a first round BYE
        participantsCount: 24,
        qualifyingProfiles: [
          {
            roundTarget: 1,
            structureProfiles: [{ drawSize: 16, qualifyingPositions: 4 }],
          },
          {
            roundTarget: 2,
            structureProfiles: [{ drawSize: 8, qualifyingPositions: 2 }],
          },
        ],
      },
    ],
    setState: true,
  });

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const qualifyingStructures = drawDefinition.structures.filter((s) => s.stage === QUALIFYING);
  expect(qualifyingStructures.length).toBeGreaterThanOrEqual(2);
});

test('generate qualifying with participantsCount different from drawSize', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 16,
        qualifyingProfiles: [
          {
            roundTarget: 1,
            structureProfiles: [
              {
                participantsCount: 6,
                qualifyingPositions: 2,
              },
            ],
          },
        ],
      },
    ],
    setState: true,
  });

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  expect(drawDefinition).toBeDefined();
  const qualifyingStructures = drawDefinition.structures.filter((s) => s.stage === QUALIFYING);
  expect(qualifyingStructures.length).toBeGreaterThan(0);
});
