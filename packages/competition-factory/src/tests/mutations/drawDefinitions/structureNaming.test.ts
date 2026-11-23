import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { xa } from '@Tools/extractAttributes';
import { expect, it } from 'vitest';

// constants
import {
  COMPASS,
  CURTIS_CONSOLATION,
  FEED_IN_CHAMPIONSHIP,
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  ROUND_ROBIN,
  ROUND_ROBIN_WITH_PLAYOFF,
} from '@Constants/drawDefinitionConstants';

it('can customize naming of COMPASS draw structures', () => {
  const playoffAttributes = {
    0: { name: 'Este', abbreviation: 'E' },
    '0-1': { name: 'Oeste', abbreviation: 'O' },
    '0-2': { name: 'Norte', abbreviation: 'N' },
    '0-3': { name: 'Nordeste', abbreviation: 'NE' },
    '0-1-1': { name: 'Sur', abbreviation: 'S' },
    '0-1-2': { name: 'Suroeste', abbreviation: 'SO' },
    '0-2-1': { name: 'Noroeste', abbreviation: 'NO' },
    '0-1-1-1': { name: 'Surdeste', abbreviation: 'SE' },
  };

  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        playoffAttributes,
        drawType: COMPASS,
        drawSize: 32,
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);

  const drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const structureNames = drawDefinition.structures.map(xa('structureName'));
  expect(structureNames).toEqual(['Este', 'Oeste', 'Norte', 'Sur', 'Nordeste', 'Noroeste', 'Suroeste', 'Surdeste']);
});

const playoffAttributes = {
  0: { name: 'Principal', abbreviation: 'P' },
  '0-1': { name: 'Backdraw', abbreviation: 'B' },
};

it('can customize naming of FEED_IN_CHAMPIONSHIP structures', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawType: FEED_IN_CHAMPIONSHIP,
        playoffAttributes,
        drawSize: 16,
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);

  const drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const structureNames = drawDefinition.structures.map(xa('structureName'));
  expect(structureNames).toEqual(['Principal', 'Backdraw']);
});

it('can customize naming of FIRST_ROUND_LOSER_CONSOLATION structures', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawType: FIRST_ROUND_LOSER_CONSOLATION,
        playoffAttributes,
        drawSize: 16,
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);

  const drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const structureNames = drawDefinition.structures.map(xa('structureName'));
  expect(structureNames).toEqual(['Principal', 'Backdraw']);
});

it('can customize naming of FIRST_MATCH_LOSER_CONSOLATION structures', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawType: FIRST_MATCH_LOSER_CONSOLATION,
        playoffAttributes,
        drawSize: 16,
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);

  const drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const structureNames = drawDefinition.structures.map(xa('structureName'));
  expect(structureNames).toEqual(['Principal', 'Backdraw']);
});

it('can customize naming of CURTIS_CONSOLATION structures', () => {
  const playoffAttributes = {
    0: { name: 'Principal', abbreviation: 'P' },
    '0-1': { name: '1st Consey', abbreviation: 'C1' },
    '0-3': { name: '2nd Consey', abbreviation: 'C2' },
    '3-4': { name: '3-4 Playoff', abbreviation: 'PO3' },
  };

  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawType: CURTIS_CONSOLATION,
        playoffAttributes,
        drawSize: 64,
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);

  const drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const structureNames = drawDefinition.structures.map(xa('structureName'));
  expect(structureNames).toEqual(['Principal', '1st Consey', '2nd Consey', '3-4 Playoff']);
});

it('can customize naming of added playoff structures with exitProfiles', () => {
  const playoffAttributes = {
    '0': { name: 'Initial', abbreviation: 'I' },
    '0-3': { name: 'Silver', abbreviation: 'S' },
    '0-4': { name: 'Gold', abbreviation: 'G' },
  };

  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32, playoffAttributes }],
  });

  tournamentEngine.setState(tournamentRecord);

  const roundProfiles = [{ 3: 1 }, { 4: 1 }];
  const {
    drawDefinition: {
      structures: [{ structureId }],
    },
  } = tournamentEngine.getEvent({ drawId });

  const result = tournamentEngine.addPlayoffStructures({
    playoffStructureNameBase: 'Playoff',
    playoffAttributes,
    roundProfiles,
    structureId,
    drawId,
  });

  expect(result.success).toEqual(true);

  const drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const structureNames = drawDefinition.structures.map(xa('structureName'));
  expect(structureNames).toEqual(['Initial', 'Silver', 'Gold']);
});

it('can customize naming of added playoff structures with finishingPositionRanges', () => {
  const playoffAttributes = {
    '0': { name: 'Initial', abbreviation: 'I' },
    '5-8': { name: 'Silver', abbreviation: 'S' },
    '3-4': { name: 'Gold', abbreviation: 'G' },
  };

  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32, playoffAttributes }],
  });

  tournamentEngine.setState(tournamentRecord);

  const roundProfiles = [{ 3: 1 }, { 4: 1 }];
  const {
    drawDefinition: {
      structures: [{ structureId }],
    },
  } = tournamentEngine.getEvent({ drawId });

  const result = tournamentEngine.addPlayoffStructures({
    playoffStructureNameBase: 'Playoff',
    playoffAttributes,
    roundProfiles,
    structureId,
    drawId,
  });

  expect(result.success).toEqual(true);

  const drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const structureNames = drawDefinition.structures.map(xa('structureName'));
  expect(structureNames).toEqual(['Initial', 'Silver', 'Gold']);
});

it('can customize naming of ROUND_ROBIN groups and playoff structures', () => {
  const playoffAttributes = {
    '0': { name: 'Initial', abbreviation: 'I' },
  };

  const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        groupNameBase: 'Grupo',
        drawType: ROUND_ROBIN,
        playoffAttributes,
        drawSize: 32,
      },
      {
        groupNames: ['Blue', 'Red', 'Green', 'Orange', 'Violet'],
        groupNameBase: 'Color',
        drawType: ROUND_ROBIN,
        playoffAttributes,
        drawSize: 32,
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);

  let drawDefinition = tournamentEngine.getEvent({
    drawId: drawIds[0],
  }).drawDefinition;
  let structureNames = drawDefinition.structures.map(xa('structureName'));
  expect(structureNames).toEqual(['Initial']);

  let groupNames = drawDefinition.structures[0].structures.map(xa('structureName'));
  expect(groupNames).toEqual(['Grupo 1', 'Grupo 2', 'Grupo 3', 'Grupo 4', 'Grupo 5', 'Grupo 6', 'Grupo 7', 'Grupo 8']);

  drawDefinition = tournamentEngine.getEvent({
    drawId: drawIds[1],
  }).drawDefinition;
  structureNames = drawDefinition.structures.map(xa('structureName'));
  expect(structureNames).toEqual(['Initial']);

  groupNames = drawDefinition.structures[0].structures.map(xa('structureName'));
  expect(groupNames).toEqual(['Blue', 'Red', 'Green', 'Orange', 'Violet', 'Color 6', 'Color 7', 'Color 8']);
});

it('can customize naming of all ROUND_ROBIN_WITH_PLAYOFF structures', () => {
  const playoffAttributes = {
    '0': { name: 'Initial', abbreviation: 'I' },
    '0-1': { name: 'Backdraw', abbreviation: 'B' },
  };
  const structureOptions = {
    playoffGroups: [
      {
        drawType: FIRST_MATCH_LOSER_CONSOLATION,
        playoffStructureNameBase: 'Y',
        finishingPositions: [1, 2],
        playoffAttributes,
      },
      {
        playoffAttributes: {
          '0': { name: 'First', abbreviation: '1' },
          '0-1': { name: 'Second', abbreviation: '2' },
          '0-2': { name: 'Third', abbreviation: '3' },
          '0-2-1': { name: 'Fourth', abbreviation: '4' },
          '0-3': { name: 'Fifth', abbreviation: '5' },
          '0-1-2': { name: 'Sixth', abbreviation: '6' },
          '0-1-1': { name: 'Seventh', abbreviation: '7' },
          '0-1-1-1': { name: 'Eighth', abbreviation: '8' },
        },
        playoffStructureNameBase: 'X',
        finishingPositions: [3, 4],
        drawType: COMPASS,
      },
    ],
    groupSize: 4,
  };
  const drawProfiles = [
    {
      drawType: ROUND_ROBIN_WITH_PLAYOFF,
      structureName: 'Base',
      structureOptions,
      drawSize: 32,
    },
  ];
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({ drawProfiles });

  tournamentEngine.setState(tournamentRecord);

  const drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const structureNames = drawDefinition.structures.map(xa('structureName'));
  expect(structureNames).toEqual([
    'Base',
    'Initial',
    'X First',
    'Y Backdraw',
    'X Second',
    'X Third',
    'X Seventh',
    'X Fifth',
    'X Fourth',
    'X Sixth',
    'X Eighth',
  ]);
});
