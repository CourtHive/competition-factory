import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, test } from 'vitest';

// constants
import {
  FIRST_MATCH_LOSER_CONSOLATION,
  PLAY_OFF,
  QUALIFYING,
  SINGLE_ELIMINATION,
} from '@Constants/drawDefinitionConstants';

// A 64 qualifying's round-1 losers finish 33–64 in the QUALIFYING chain. A 64 FMLC main's consolation
// plays off 33–64 in the MAIN chain. Before the scope fix the main-side numbers hid the qualifying's
// round-1 playoff, so what the structure menu offered depended on the main's draw type.
const scenarios = [
  { drawType: SINGLE_ELIMINATION, drawSize: 64, qualifyingPositions: 16, expectation: [1] },
  { drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 64, qualifyingPositions: 16, expectation: [1] },
  { drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 128, qualifyingPositions: 8, expectation: [1, 2] },
  { drawType: SINGLE_ELIMINATION, drawSize: 128, qualifyingPositions: 8, expectation: [1, 2] },
];

function generate({ drawType, drawSize, qualifyingPositions }) {
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [{ eventName: 'Qualifying playoffs', participantsProfile: { participantsCount: drawSize + 64 } }],
    setState: true,
  });
  const result = tournamentEngine.generateDrawDefinition({
    qualifyingProfiles: [{ roundTarget: 1, structureProfiles: [{ drawSize: 64, qualifyingPositions }] }],
    qualifiersCount: qualifyingPositions,
    automated: false,
    drawType,
    drawSize,
    eventId,
  });
  expect(result.success).toEqual(true);
  tournamentEngine.addDrawDefinition({ eventId, drawDefinition: result.drawDefinition });
  const { drawDefinition } = result;
  const qualifyingStructure = drawDefinition.structures.find((s) => s.stage === QUALIFYING);
  return { drawId: drawDefinition.drawId, qualifyingStructureId: qualifyingStructure.structureId, eventId };
}

test.each(scenarios)(
  'a qualifying structure is offered its own loser rounds whatever the main draw type: $drawType $drawSize',
  (scenario) => {
    const { drawId, qualifyingStructureId } = generate(scenario);
    const result: any = tournamentEngine.getAvailablePlayoffProfiles({ drawId, structureId: qualifyingStructureId });
    expect(result.playoffRounds).toEqual(scenario.expectation);
    // positions played off are read from the qualifying chain: nothing from the main's consolation (33–64)
    expect(result.positionsPlayedOff.filter((position) => position >= 33)).toEqual([]);
    const ranges = result.playoffRoundsRanges.map(({ roundNumber, finishingPositionRange }) => ({
      finishingPositionRange,
      roundNumber,
    }));
    expect(ranges[0]).toEqual({ roundNumber: 1, finishingPositionRange: '33-64' });
  },
);

it('the MAIN structure of an FMLC draw keeps its draw-wide answer', () => {
  const { drawId } = generate(scenarios[1]);
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const mainStructure = drawDefinition.structures.find((s) => s.stage === 'MAIN');
  const result: any = tournamentEngine.getAvailablePlayoffProfiles({ drawId, structureId: mainStructure.structureId });
  // the consolation already plays off round 1 and the (first-matchUp) round 2 losers
  expect(result.playoffRounds).not.toContain(1);
  expect(result.positionsPlayedOff).toEqual([1, 2, 33, 34]);
});

it('a playoff added to qualifying round 1 under an FMLC main receives the round-1 loser', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        qualifyingProfiles: [{ roundTarget: 1, structureProfiles: [{ drawSize: 64, qualifyingPositions: 16 }] }],
        drawType: FIRST_MATCH_LOSER_CONSOLATION,
        drawSize: 64,
      },
    ],
  });
  tournamentEngine.setState(tournamentRecord);
  let { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const qualifyingStructureId = drawDefinition.structures.find((s) => s.stage === QUALIFYING).structureId;

  let result: any = tournamentEngine.getAvailablePlayoffProfiles({ drawId, structureId: qualifyingStructureId });
  expect(result.playoffRounds).toEqual([1]);

  result = tournamentEngine.addPlayoffStructures({
    playoffStructureNameBase: 'Qualifying Consolation',
    structureId: qualifyingStructureId,
    roundProfiles: [{ 1: 1 }],
    drawId,
  });
  expect(result.success).toEqual(true);

  ({ drawDefinition } = tournamentEngine.getEvent({ drawId }));
  const playoff = drawDefinition.structures.find((s) => s.stage === PLAY_OFF);
  expect(playoff.positionAssignments.length).toEqual(32);
  const link = drawDefinition.links.find((l) => l.target.structureId === playoff.structureId);
  expect(link.source).toEqual({ structureId: qualifyingStructureId, roundNumber: 1 });

  // the qualifying chain now plays off 33–64, so nothing further is offered
  result = tournamentEngine.getAvailablePlayoffProfiles({ drawId, structureId: qualifyingStructureId });
  expect(result.playoffRounds).toEqual([]);

  const matchUps = tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps;
  const q1 = matchUps.find(
    (m) => m.structureId === qualifyingStructureId && m.roundNumber === 1 && m.sides.every((s) => s.participantId),
  );
  expect(q1).toBeDefined();
  result = tournamentEngine.setMatchUpStatus({
    outcome: { winningSide: 1, score: { scoreStringSide1: '6-1 6-1' } },
    matchUpId: q1.matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  const loserId = q1.sides[1].participantId;
  const after = tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps;
  const landed = after.find(
    (m) => m.structureId === playoff.structureId && m.sides.some((s) => s.participantId === loserId),
  );
  expect(landed.roundNumber).toEqual(1);
});
