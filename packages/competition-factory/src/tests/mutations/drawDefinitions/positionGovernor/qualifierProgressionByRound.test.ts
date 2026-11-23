import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';

// a round 2 qualifier stands opposite a first round BYE; a round 1 qualifier must never take that position, and a
// round 2 qualifier must never take a first round position
it('places each round of qualifiers only into the positions that enter at that round', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 32,
        participantsCount: 24,
        qualifyingProfiles: [
          { roundTarget: 1, structureProfiles: [{ drawSize: 16, qualifyingPositions: 4 }] },
          { roundTarget: 2, structureProfiles: [{ drawSize: 8, qualifyingPositions: 2 }] },
        ],
      },
    ],
    setState: true,
  });

  const main = () =>
    tournamentEngine.getEvent({ drawId }).drawDefinition.structures.find(({ stage }) => stage === MAIN);
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });
  for (const roundNumber of [1, 2, 3]) {
    const ready = tournamentEngine
      .allTournamentMatchUps()
      .matchUps.filter((m) => m.stage === QUALIFYING && m.roundNumber === roundNumber && m.readyToScore);
    for (const { matchUpId } of ready) {
      const result = tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome });
      expect(result.success).toEqual(true);
    }
  }

  const byes = new Set(
    main()
      .positionAssignments.filter(({ bye }) => bye)
      .map(({ drawPosition }) => drawPosition),
  );
  expect(byes.size).toEqual(2);
  const firstRound = main().matchUps.filter(({ roundNumber }) => roundNumber === 1);
  const oppositeBye = (drawPosition: number) =>
    firstRound.some(
      ({ drawPositions }) => drawPositions.includes(drawPosition) && drawPositions.some((p) => byes.has(p)),
    );

  let result: any = tournamentEngine.qualifierProgression({ drawId, targetRoundNumber: 1 });
  expect(result.assignedParticipants.length).toEqual(4);
  expect(result.assignedParticipants.some(({ drawPosition }) => oppositeBye(drawPosition))).toEqual(false);

  result = tournamentEngine.qualifierProgression({ drawId, targetRoundNumber: 2 });
  expect(result.assignedParticipants.length).toEqual(2);
  expect(result.assignedParticipants.every(({ drawPosition }) => oppositeBye(drawPosition))).toEqual(true);
});
