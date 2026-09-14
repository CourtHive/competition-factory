import { structureAssignedDrawPositions } from '@Query/drawDefinition/positionsGetter';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { COMPASS } from '@Constants/drawDefinitionConstants';

it('can generate COMPASS and properly place BYEs in consolation structures 32/25', () => {
  const expectations_NO_BYES = {
    East: 0,
    West: 0,
    North: 0,
    South: 0,
    Northeast: 0,
    Southwest: 0,
    Northwest: 0,
    Southeast: 0,
  };
  compassByesTest({
    drawSize: 32,
    participantsCount: 32,
    expectations: expectations_NO_BYES,
    matchUpsCount: 72,
    byeMatchUpsCount: 0,
  });

  const expectations32_25 = {
    East: 7,
    West: 7,
    North: 0,
    South: 7,
    Northeast: 0,
    Southwest: 0,
    Northwest: 0,
    Southeast: 4,
  };
  compassByesTest({
    drawSize: 32,
    participantsCount: 25,
    expectations: expectations32_25,
    matchUpsCount: 72,
    byeMatchUpsCount: 24,
  });

  const expectations32_17 = {
    East: 15,
    West: 15,
    North: 0,
    South: 8,
    Northeast: 0,
    Southwest: 4,
    Northwest: 0,
    Southeast: 4,
  };
  compassByesTest({
    drawSize: 32,
    participantsCount: 17,
    expectations: expectations32_17,
    matchUpsCount: 72,
    byeMatchUpsCount: 43,
  });
});

function compassByesTest({ expectations, drawSize, participantsCount, matchUpsCount, byeMatchUpsCount }) {
  const drawProfiles = [
    {
      drawSize,
      participantsCount,
      drawType: COMPASS,
    },
  ];
  const result = mocksEngine.generateTournamentRecord({
    completeAllMatchUps: true,
    inContext: true,
    drawProfiles,
  });

  const {
    drawIds: [drawId],
    tournamentRecord,
  } = result;

  tournamentEngine.setState(tournamentRecord);

  const {
    drawDefinition: { structures },
  } = tournamentEngine.getEvent({ drawId });

  expect(structures.length).toEqual(8);
  expect(structures.map((structure) => structure.structureName)).toEqual([
    'East',
    'West',
    'North',
    'South',
    'Northeast',
    'Northwest',
    'Southwest',
    'Southeast',
  ]);

  structures.forEach((structure) => {
    const { byePositions } = structureAssignedDrawPositions({
      structure,
    });
    if (expectations) {
      expect(expectations[structure.structureName]).toEqual(byePositions?.length);
    } else {
      console.log(structure.structureName, byePositions?.length);
    }
  });

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  if (matchUpsCount !== undefined) {
    expect(matchUps.length).toEqual(matchUpsCount);
  } else {
    console.log('matchUps:', matchUps.length);
  }
  const { byeMatchUps, completedMatchUps } = tournamentEngine.tournamentMatchUps();
  if (byeMatchUpsCount !== undefined) {
    expect(byeMatchUps.length).toEqual(byeMatchUpsCount);
    expect(completedMatchUps.length).toEqual(matchUpsCount - byeMatchUpsCount);
  } else {
    console.log('byeMatchUps:', byeMatchUps.length);
  }
}
