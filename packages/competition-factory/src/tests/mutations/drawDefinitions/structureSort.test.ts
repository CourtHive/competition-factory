import { structureSort } from '@Functions/sorters/structureSort';
import { defined } from '@Tests/helpers/defined';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { instanceCount } from '@Tools/arrays';
import * as tools from '@Assemblies/tools';
import { expect, test } from 'vitest';

// constants
import {
  AGGREGATE_EVENT_STRUCTURES,
  COMPASS,
  CURTIS_CONSOLATION,
  FEED_IN_CHAMPIONSHIP,
  FINISHING_POSITIONS,
  FIRST_MATCH_LOSER_CONSOLATION,
} from '@Constants/drawDefinitionConstants';

test('structureSort can sort by stage and stageSequence', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawType: COMPASS,
        drawSize: 64,
        qualifyingProfiles: [
          {
            structureProfiles: [{ qualifyingPositions: 4, seedsCount: 4, drawSize: 16 }],
          },
        ],
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  let structureNames = drawDefinition.structures
    .sort((a, b) => structureSort(a, b))
    .map(({ structureName }) => structureName);

  expect(structureNames).toEqual([
    'Qualifying',
    'East',
    'West',
    'North',
    'South',
    'Northeast',
    'Northwest',
    'Southwest',
    'Southeast',
  ]);

  const fpSort = ['East', 'Northeast', 'North', 'West', 'Northwest', 'Southwest', 'South', 'Southeast', 'Qualifying'];

  structureNames = drawDefinition.structures
    .sort((a, b) => structureSort(a, b, { mode: FINISHING_POSITIONS }))
    .map(({ structureName }) => structureName);

  expect(structureNames).toEqual(fpSort);

  structureNames = drawDefinition.structures
    .sort((a, b) => tools.structureSort(a, b, { mode: FINISHING_POSITIONS }))
    .map(({ structureName }) => structureName);

  expect(structureNames).toEqual(fpSort);

  structureNames = drawDefinition.structures
    .sort((a, b) => tools.structureSort(a, b, { mode: AGGREGATE_EVENT_STRUCTURES }))
    .map(({ structureName }) => structureName);

  expect(structureNames).toEqual(fpSort);
});

test('structureSort can sort by stage and stageSequence', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawType: FIRST_MATCH_LOSER_CONSOLATION,
        drawSize: 64,
      },
      {
        drawType: CURTIS_CONSOLATION,
        drawSize: 64,
      },
      {
        drawType: FEED_IN_CHAMPIONSHIP,
        drawSize: 64,
      },
    ],
  });

  const allStructures = defined(tournamentRecord.events, 'events')
    .flatMap(({ drawDefinitions }) =>
      defined(drawDefinitions, 'drawDefinitions').flatMap(({ structures }) => defined(structures, 'structures')),
    )
    .sort((a, b) => tools.structureSort(a, b, { mode: AGGREGATE_EVENT_STRUCTURES }));

  const structureMap = Object.keys(instanceCount(allStructures.map(({ structureName }) => structureName)));

  const flatStructures = tournamentRecord.events
    ?.flatMap(({ drawDefinitions, eventType }) =>
      defined(drawDefinitions, 'drawDefinitions').flatMap(({ structures, drawId }) =>
        defined(structures, 'structures').map((s) => ({ ...s, drawId, eventType })),
      ),
    )
    .sort((a, b) => tools.structureSort(a, b, { mode: AGGREGATE_EVENT_STRUCTURES }))
    ?.reduce<Record<string, { stage?: string }[]>>(
      (acc, { structureName, stage }) => ({
        ...acc,
        [defined(structureName, 'structureName')]: [...(acc[defined(structureName, 'structureName')] ?? []), { stage }],
      }),
      {},
    );

  const expectation = ['Main', 'Play Off', 'Consolation', 'Consolation 1', 'Consolation 2'];
  expect(Object.keys(defined(flatStructures, 'flatStructures'))).toEqual(expectation);
  expect(structureMap).toEqual(expectation);
});
