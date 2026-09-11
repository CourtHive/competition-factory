import { processPlayoffGroups } from '@Generators/drawDefinitions/drawTypes/processPlayoffGroups';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

// constants
import {
  FIRST_ROUND_LOSER_CONSOLATION,
  FEED_IN_CHAMPIONSHIP,
  PAGE_PLAYOFF,
  ROUND_ROBIN,
  COMPASS,
  OLYMPIC,
  AD_HOC,
} from '@Constants/drawDefinitionConstants';

// minimal elimination-style source structure (no structureType, no nested structures)
function elimSource(positions = 8, matchUps: any[] = []) {
  return {
    drawId: 'test-draw',
    structures: [
      {
        structureId: 'source-struct-id',
        finishingPosition: 'ROUND_OUTCOME',
        positionAssignments: Array.from({ length: positions }, (_, i) => ({ drawPosition: i + 1 })),
        matchUps,
      },
    ],
  };
}

// L110 — getPositionRangeMap returns an error (missing drawDefinition) → early return
test('returns error when getPositionRangeMap fails (missing drawDefinition)', () => {
  let result: any = processPlayoffGroups({
    playoffGroups: [{ finishingPositions: [1, 2] }],
    sourceStructureId: 'source-struct-id',
  });
  expect(result.error).toBeDefined();
});

// L92-98 (L95 validation.error branch) — bestOf config fails validatePlayoffGroups
test('returns validation error when bestOf exceeds available participants', () => {
  let result: any = processPlayoffGroups({
    playoffGroups: [{ finishingPositions: [1, 2], bestOf: 999 }],
    sourceStructureId: 'source-struct-id',
    drawDefinition: elimSource(4),
    groupCount: 1,
    groupSize: 4,
    matchUpType: 'SINGLES',
    isMock: true,
  });
  expect(result.error).toBeDefined();
});

// L116 + L126 — non-remainder group with empty finishingPositions against a defined
// positionRangeMap (round-robin container source) → invalid finishing positions
test('rejects empty finishingPositions when positionRangeMap is defined (RR source)', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: ROUND_ROBIN, drawSize: 8 }],
    setState: true,
  });
  const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
  const sourceStructureId = drawDefinition.structures[0].structureId;

  let result: any = processPlayoffGroups({
    playoffGroups: [{ finishingPositions: [] }],
    sourceStructureId,
    drawDefinition,
    groupCount: 2,
    groupSize: 4,
  });
  expect(result.error).toBeDefined();
});

// L162 (?? []) + L164 (positionRangeMap falsy) — AD_HOC group with no finishingPositions
test('AD_HOC group with undefined finishingPositions falls back to empty array', () => {
  let result: any = processPlayoffGroups({
    playoffGroups: [{ drawType: AD_HOC }],
    sourceStructureId: 'source-struct-id',
    drawDefinition: elimSource(4),
    groupCount: 1,
    groupSize: 4,
    stageSequence: 2,
    matchUpType: 'SINGLES',
    isMock: true,
  });
  expect(result.structures?.length).toBeGreaterThan(0);
});

// L463 + L474-478 + L489/490/493 (truthy) — COMPASS playoff with idPrefix
test('COMPASS playoff generates structures/links with idPrefix', () => {
  let result: any = processPlayoffGroups({
    playoffGroups: [{ finishingPositions: [1], drawType: COMPASS }],
    sourceStructureId: 'source-struct-id',
    drawDefinition: elimSource(8),
    groupCount: 8,
    groupSize: 8,
    idPrefix: 'px',
    matchUpType: 'SINGLES',
    isMock: true,
  });
  expect(result.structures?.length).toBeGreaterThan(0);
  expect(result.links?.length).toBeGreaterThan(0);
});

// L479 + L481 — OLYMPIC playoff branch
test('OLYMPIC playoff generates structures', () => {
  let result: any = processPlayoffGroups({
    playoffGroups: [{ finishingPositions: [1], drawType: OLYMPIC }],
    sourceStructureId: 'source-struct-id',
    drawDefinition: elimSource(8),
    groupCount: 8,
    groupSize: 8,
    idPrefix: 'px',
    matchUpType: 'SINGLES',
    isMock: true,
  });
  expect(result.structures?.length).toBeGreaterThan(0);
});

// L489/490/493 (falsy) — COMPASS with drawSize < 2 → generatePlayoffStructures returns {}
test('COMPASS playoff with drawSize < 2 produces no compass structures', () => {
  let result: any = processPlayoffGroups({
    playoffGroups: [{ finishingPositions: [1], drawType: COMPASS }],
    sourceStructureId: 'source-struct-id',
    drawDefinition: elimSource(4),
    groupCount: 1,
    groupSize: 4,
    matchUpType: 'SINGLES',
    isMock: true,
  });
  // no error, no early return; structures array still returned (possibly empty)
  expect(result.error).toBeUndefined();
  expect(Array.isArray(result.structures)).toEqual(true);
});

// L311 + L587 — PAGE_PLAYOFF with participantsInDraw !== 4 → error early return
test('PAGE_PLAYOFF with participants !== 4 returns INVALID_CONFIGURATION', () => {
  let result: any = processPlayoffGroups({
    playoffGroups: [{ finishingPositions: [1, 2, 3], drawType: PAGE_PLAYOFF }],
    sourceStructureId: 'source-struct-id',
    drawDefinition: elimSource(4),
    groupCount: 1,
    groupSize: 4,
    matchUpType: 'SINGLES',
    isMock: true,
  });
  expect(result.error).toBeDefined();
});

// L618/622/629/633/640/644 (truthy) + L652 (matchUps present) + L653 (Math.max) —
// PAGE_PLAYOFF from an elimination source with idPrefix and structureName
test('PAGE_PLAYOFF from elimination source with idPrefix and structureName', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4 }],
    setState: true,
  });
  const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
  const sourceStructureId = drawDefinition.structures[0].structureId;

  let result: any = processPlayoffGroups({
    playoffGroups: [{ finishingPositions: [1, 2, 3, 4], drawType: PAGE_PLAYOFF, structureName: 'Page' }],
    sourceStructureId,
    drawDefinition,
    groupCount: 1,
    groupSize: 4,
    idPrefix: 'px',
    matchUpType: 'SINGLES',
    isMock: true,
  });
  expect(result.structures?.length).toBeGreaterThanOrEqual(3);
});

// L618/629/640 (falsy) + L622/633/644 (falsy) + L653 (: 1) —
// PAGE_PLAYOFF from elimination source with no idPrefix / structureName / matchUps
test('PAGE_PLAYOFF from elimination source without idPrefix or structureName', () => {
  let result: any = processPlayoffGroups({
    playoffGroups: [{ finishingPositions: [1, 2, 3, 4], drawType: PAGE_PLAYOFF }],
    sourceStructureId: 'source-struct-id',
    drawDefinition: elimSource(4),
    groupCount: 1,
    groupSize: 4,
    matchUpType: 'SINGLES',
    isMock: true,
  });
  expect(result.structures?.length).toBeGreaterThanOrEqual(3);
});

// L535 — FEED_IN_CHAMPIONSHIP playoff with idPrefix
test('FEED_IN_CHAMPIONSHIP playoff generates structures with idPrefix', () => {
  let result: any = processPlayoffGroups({
    playoffGroups: [{ finishingPositions: [1, 2], drawType: FEED_IN_CHAMPIONSHIP }],
    sourceStructureId: 'source-struct-id',
    drawDefinition: elimSource(8),
    groupCount: 2,
    groupSize: 4,
    idPrefix: 'px',
    matchUpType: 'SINGLES',
    isMock: true,
  });
  expect(result.structures?.length).toBeGreaterThan(0);
});

// L346 (|| 'Remainder Playoff') + L350 (idPrefix truthy) + L755/757 (bestOf → rankBy || GEM_SCORE)
test('bestOf group followed by remainder group generates a remainder playoff', () => {
  let result: any = processPlayoffGroups({
    playoffGroups: [{ finishingPositions: [1], bestOf: 4 }, { remainder: true }],
    sourceStructureId: 'source-struct-id',
    drawDefinition: elimSource(8),
    groupCount: 2,
    groupSize: 4,
    idPrefix: 'px',
    matchUpType: 'SINGLES',
    isMock: true,
  });
  expect(result.structures?.length).toBeGreaterThanOrEqual(2);
});

// L693 — PAGE_PLAYOFF from a non-elimination (RR-routed) source with < 2 finishingPositions
test('PAGE_PLAYOFF from non-elimination source with single finishing position', () => {
  let result: any = processPlayoffGroups({
    playoffGroups: [{ finishingPositions: [1], drawType: PAGE_PLAYOFF }],
    sourceStructureId: 'source-struct-id',
    drawDefinition: {
      drawId: 'test-draw',
      structures: [
        {
          structureId: 'source-struct-id',
          structureType: 'ITEM',
          matchUps: [],
          positionAssignments: [{ drawPosition: 1 }, { drawPosition: 2 }, { drawPosition: 3 }, { drawPosition: 4 }],
        },
      ],
    },
    groupCount: 4,
    groupSize: 4,
    matchUpType: 'SINGLES',
    isMock: true,
  });
  expect(result.structures?.length).toBeGreaterThanOrEqual(4);
});

// existing coverage anchor — FIRST_ROUND_LOSER_CONSOLATION branch reachable via engine-shaped source
test('FIRST_ROUND_LOSER_CONSOLATION playoff generates structures', () => {
  let result: any = processPlayoffGroups({
    playoffGroups: [{ finishingPositions: [1, 2], drawType: FIRST_ROUND_LOSER_CONSOLATION }],
    sourceStructureId: 'source-struct-id',
    drawDefinition: elimSource(8),
    groupCount: 2,
    groupSize: 4,
    stageSequence: 2,
    matchUpType: 'SINGLES',
    isMock: true,
  });
  expect(result.structures?.length).toBeGreaterThan(0);
});
