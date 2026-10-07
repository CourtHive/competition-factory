import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { PLAY_OFF, QUALIFYING, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';

const roundsOf = (structure) => [...new Set(structure.matchUps.map((m) => m.roundNumber))].sort((a, b) => a - b);

function setup(drawProfile = { drawSize: 32 }) {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [drawProfile] });
  tournamentEngine.setState(tournamentRecord);
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  return { drawId, drawDefinition };
}

it('a playoff structure can be capped to a number of rounds', () => {
  const { drawId, drawDefinition } = setup();
  const mainStructureId = drawDefinition.structures[0].structureId;

  // without a cap the losers of round 1 (16 of them) play a full 4-round structure
  let result: any = tournamentEngine.generateAndPopulatePlayoffStructures({
    structureId: mainStructureId,
    roundProfiles: [{ 1: 1 }],
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(roundsOf(result.structures[0])).toEqual([1, 2, 3, 4]);
  expect(result.structures[0].roundLimit).toBeUndefined();

  result = tournamentEngine.addPlayoffStructures({
    playoffStructureNameBase: 'Consolation',
    structureId: mainStructureId,
    roundProfiles: [{ 1: 1 }],
    roundLimit: 2,
    drawId,
  });
  expect(result.success).toEqual(true);

  const playoff = tournamentEngine.getEvent({ drawId }).drawDefinition.structures.find((s) => s.stage === PLAY_OFF);
  expect(roundsOf(playoff)).toEqual([1, 2]);
  expect(playoff.matchUps.length).toEqual(12);
  expect(playoff.positionAssignments.length).toEqual(16);
  expect(playoff.roundLimit).toEqual(2);

  // a capped structure completes when its last generated round completes
  const matchUps = tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps;
  for (const matchUp of matchUps.filter(
    (m) => m.structureId === drawDefinition.structures[0].structureId && m.roundNumber === 1,
  )) {
    result = tournamentEngine.setMatchUpStatus({
      outcome: { winningSide: 1, score: { scoreStringSide1: '6-1 6-1' } },
      matchUpId: matchUp.matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);
  }
  const playoffMatchUps = () =>
    tournamentEngine
      .allDrawMatchUps({ drawId, inContext: true })
      .matchUps.filter((m) => m.structureId === playoff.structureId);
  expect(
    playoffMatchUps()
      .filter((m) => m.roundNumber === 1)
      .every((m) => m.sides.every((s) => s.participantId)),
  ).toEqual(true);
  for (const roundNumber of [1, 2]) {
    for (const matchUp of playoffMatchUps().filter((m) => m.roundNumber === roundNumber)) {
      result = tournamentEngine.setMatchUpStatus({
        outcome: { winningSide: 1, score: { scoreStringSide1: '6-2 6-2' } },
        matchUpId: matchUp.matchUpId,
        drawId,
      });
      expect(result.success).toEqual(true);
    }
  }
  expect(tournamentEngine.isCompletedStructure({ drawId, structureId: playoff.structureId })).toEqual(true);
});

it('roundLimits caps each source round separately and a cap at or beyond the natural depth is no cap', () => {
  const { drawId, drawDefinition } = setup();
  const mainStructureId = drawDefinition.structures[0].structureId;
  const result: any = tournamentEngine.generateAndPopulatePlayoffStructures({
    roundProfiles: [{ 1: 1 }, { 2: 1 }],
    structureId: mainStructureId,
    roundLimits: { 1: 1, 2: 9 },
    drawId,
  });
  expect(result.success).toEqual(true);
  const byPositions = Object.fromEntries(result.structures.map((s) => [s.positionAssignments.length, s]));
  expect(roundsOf(byPositions[16])).toEqual([1]); // round-1 losers: one round only
  expect(byPositions[16].roundLimit).toEqual(1);
  expect(roundsOf(byPositions[8])).toEqual([1, 2, 3]); // round-2 losers: 9 exceeds the natural 3, so uncapped
  expect(byPositions[8].roundLimit).toBeUndefined();
});

it('a roundLimit below 1 or not an integer is refused', () => {
  const { drawId, drawDefinition } = setup();
  const mainStructureId = drawDefinition.structures[0].structureId;
  for (const roundLimit of [0, -1, 1.5, 'two']) {
    const result: any = tournamentEngine.generateAndPopulatePlayoffStructures({
      structureId: mainStructureId,
      roundProfiles: [{ 1: 1 }],
      roundLimit,
      drawId,
    });
    expect(result.error).toEqual(INVALID_VALUES);
  }
});

it('a one-round consolation for the losers of qualifying round 1 receives them and nothing more is generated', () => {
  const { drawId, drawDefinition } = setup({
    qualifyingProfiles: [{ roundTarget: 1, structureProfiles: [{ drawSize: 64, qualifyingPositions: 16 }] }],
    // SINGLE_ELIMINATION: an FMLC main hides the qualifying's rounds until #5281(factory) lands
    drawType: SINGLE_ELIMINATION,
    drawSize: 64,
  } as any);
  const qualifyingStructureId = drawDefinition.structures.find((s) => s.stage === QUALIFYING).structureId;

  let result: any = tournamentEngine.addPlayoffStructures({
    playoffStructureNameBase: 'Qualifying Consolation',
    structureId: qualifyingStructureId,
    roundProfiles: [{ 1: 1 }],
    roundLimit: 1,
    drawId,
  });
  expect(result.success).toEqual(true);

  const consolation = tournamentEngine.getEvent({ drawId }).drawDefinition.structures.find((s) => s.stage === PLAY_OFF);
  expect(consolation.positionAssignments.length).toEqual(32);
  expect(consolation.matchUps.length).toEqual(16);
  expect(roundsOf(consolation)).toEqual([1]);

  const matchUps = tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps;
  const q1 = matchUps.find(
    (m) => m.structureId === qualifyingStructureId && m.roundNumber === 1 && m.sides.every((s) => s.participantId),
  );
  result = tournamentEngine.setMatchUpStatus({
    outcome: { winningSide: 2, score: { scoreStringSide1: '1-6 1-6' } },
    matchUpId: q1.matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);
  const loserId = q1.sides[0].participantId;
  const landed = tournamentEngine
    .allDrawMatchUps({ drawId, inContext: true })
    .matchUps.find(
      (m) => m.structureId === consolation.structureId && m.sides.some((s) => s.participantId === loserId),
    );
  expect(landed.roundNumber).toEqual(1);
});
