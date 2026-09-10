import { getStructureSeedAssignments } from '@Query/structure/getStructureSeedAssignments';
import { getStructurePositionedSeeds } from '@Query/structure/getStructurePositionedSeeds';
import { structureAssignedDrawPositions } from '@Query/drawDefinition/positionsGetter';
import { getPairedDrawPosition } from '@Query/drawDefinition/getPairedDrawPosition';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { getNumericSeedValue } from '@Query/drawDefinition/getNumericSeedValue';
import { chunkArray, generateRange } from '@Tools/arrays';
import { findStructure } from '@Acquire/findStructure';
import { expect } from 'vitest';

import { STRUCTURE_NOT_FOUND } from '@Constants/errorConditionConstants';

export function verifyStructure(params) {
  const {
    expectedPositionsAssignedCount,
    expectedQualifierAssignments,
    expectedRoundMatchUpsCounts,
    expectedSeedValuesWithBye,
    expectedByeAssignments,
    expectedSeedsWithByes,
    drawDefinition,
    expectedSeeds,
    structureId,
  } = params;
  const { structure } = findStructure({ drawDefinition, structureId });
  if (!structure) return { error: STRUCTURE_NOT_FOUND };
  const { positionAssignments } = structureAssignedDrawPositions({ structure });
  const { seedAssignments } = getStructureSeedAssignments({
    drawDefinition,
    structure,
  });

  const positionsAssignedCount = positionAssignments?.reduce((count, candidate) => {
    return count + (candidate.participantId || candidate.bye || candidate.qualifier ? 1 : 0);
  }, 0);

  if (expectedPositionsAssignedCount !== undefined) {
    expect(positionsAssignedCount).toEqual(expectedPositionsAssignedCount);
  }

  const byeAssignedDrawPositions = positionAssignments
    ?.filter((assignment) => assignment.bye)
    .map((assignment) => assignment.drawPosition);

  const qualifierAssignedDrawPositions = positionAssignments
    ?.filter((assignment) => assignment.qualifier)
    .map((assignment) => assignment.drawPosition);

  if (expectedByeAssignments !== undefined) {
    expect(byeAssignedDrawPositions?.length).toEqual(expectedByeAssignments);
  }

  expect(expectedQualifierAssignments && qualifierAssignedDrawPositions?.length).toEqual(expectedQualifierAssignments);

  const seededParticipantIds = seedAssignments?.map((assignment) => assignment.participantId).filter(Boolean);
  const seedAssignedDrawPositions = positionAssignments
    ?.filter((assignment) => seededParticipantIds?.includes(assignment.participantId))
    .map((assignment) => assignment.drawPosition);
  if (expectedSeeds !== undefined) expect(seedAssignedDrawPositions?.length).toEqual(expectedSeeds);

  const { matchUps, roundMatchUps } = getAllStructureMatchUps({
    afterRecoveryTimes: false,
    inContext: true,
    structure,
  });
  if (expectedRoundMatchUpsCounts) {
    expectedRoundMatchUpsCounts.forEach((expectation, index) => {
      const roundNumber = index + 1;
      const roundMatchUpsCount = roundMatchUps[roundNumber]?.length || 0;
      expect(roundMatchUpsCount).toEqual(expectation);
    });
  }

  const pairedDrawPositions = matchUps
    .filter((matchUp) => matchUp.roundNumber === 1)
    .map((matchUp) => matchUp.drawPositions);

  const seedPairedDrawPositions = seedAssignedDrawPositions
    ?.map((drawPosition) => {
      const { pairedDrawPosition } = getPairedDrawPosition({
        matchUps,
        drawPosition,
        roundNumber: 1,
      });
      return pairedDrawPosition;
    })
    .filter(Boolean);

  const seedPairedDrawPositionsWithBye = seedPairedDrawPositions?.filter((drawPosition: any) =>
    byeAssignedDrawPositions?.includes(drawPosition),
  );
  if (expectedSeedsWithByes !== undefined) {
    expect(seedPairedDrawPositionsWithBye?.length).toEqual(expectedSeedsWithByes);
  }

  const positionedSeeds = getStructurePositionedSeeds({
    drawDefinition,
    structure,
  });
  const seedDrawPositionsWithBye = seedPairedDrawPositionsWithBye?.map((drawPosition: any) => {
    const { pairedDrawPosition } = getPairedDrawPosition({
      roundNumber: 1,
      drawPosition,
      matchUps,
    });
    return pairedDrawPosition;
  });

  const seedValuesOfSeedsWithBye: any = positionedSeeds
    ?.filter((assignment: any) => seedDrawPositionsWithBye?.includes(assignment.drawPosition))
    .map((assignment: any) => getNumericSeedValue(assignment.seedValue))
    .sort((a, b) => (a || 0) - (b || 0));

  if (expectedSeedValuesWithBye !== undefined) {
    expect(expectedSeedValuesWithBye).toMatchObject(seedValuesOfSeedsWithBye);
  }

  const drawSize = pairedDrawPositions.length;
  const { filteredQuarters } = verifyByeDistribution({
    drawSize,
    byeAssignedDrawPositions,
  });

  return { byeAssignedDrawPositions, filteredQuarters };
}

function verifyByeDistribution({ drawSize, byeAssignedDrawPositions }) {
  const quarterSize = Math.ceil(drawSize / 4);
  const quarters = chunkArray(generateRange(1, drawSize + 1), quarterSize);
  const filteredQuarters = quarters.map((quarter) =>
    quarter.filter((drawPosition) => byeAssignedDrawPositions.includes(drawPosition)),
  );
  const quarterLengths = filteredQuarters.map((filteredQuarter) => filteredQuarter.length);
  const maxLength = Math.max(...quarterLengths);
  const minLength = Math.min(...quarterLengths);
  const lengthDifference = maxLength - minLength;
  expect(lengthDifference).toBeLessThanOrEqual(1);
  return { filteredQuarters };
}
