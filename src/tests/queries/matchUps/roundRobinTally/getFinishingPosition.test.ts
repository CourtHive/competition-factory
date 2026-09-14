import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants and fixtures
import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { SINGLES } from '@Constants/eventConstants';

it('can recognize absolute ties between multiple participants', () => {
  // 5 ties, each drawPosition has 2 wins
  const outcomeValues = [
    [[1, 2], '6-0 6-0', 1], // win for drawPosition: 1
    [[1, 3], '6-0 6-0', 1], // win for drawPosition: 1
    [[1, 4], '6-0 6-0', 2], // win for drawPosition: 4
    [[1, 5], '6-0 6-0', 2], // win for drawPosition: 5
    [[2, 3], '6-0 6-0', 2], // win for drawPosition: 3
    [[2, 4], '6-0 6-0', 1], // win for drawPosition: 2
    [[2, 5], '6-0 6-0', 1], // win for drawPosition: 2
    [[3, 4], '6-0 6-0', 1], // win for drawPosition: 3
    [[3, 5], '6-0 6-0', 2], // win for drawPosition: 5
    [[4, 5], '6-0 6-0', 1], // win for drawPosition: 4
  ];

  const { participantResults } = generateScenario({ outcomeValues });
  const drawPositions = participantResults.map(({ drawPosition }) => drawPosition);
  // with 5 ties the drawPositions are still in order
  expect(drawPositions).toEqual([1, 2, 3, 4, 5]);

  expect(participantResults.map(({ participantResult }) => participantResult.groupOrder)).toEqual([1, 1, 1, 1, 1]);

  expect(participantResults.map(({ participantResult }) => participantResult.ties)).toEqual([5, 5, 5, 5, 5]);
});

it('can breat 3 way ties bye matchUpsWon ratio', () => {
  const outcomeValues = [
    [[1, 4], '6-0 6-0', 2], // win for drawPosition: 4
    [[4, 5], '6-0 6-0', 1], // win for drawPosition: 4
    [[2, 4], '6-0 6-0', 2], // win for drawPosition: 4

    [[1, 2], '6-0 6-0', 1], // win for drawPosition: 1
    [[1, 3], '6-0 6-0', 1], // win for drawPosition: 1
    [[2, 3], '6-0 6-0', 1], // win for drawPosition: 2
    [[2, 5], '6-0 6-0', 1], // win for drawPosition: 2
    [[3, 4], '6-0 6-0', 1], // win for drawPosition: 3
    [[3, 5], '6-0 6-0', 1], // win for drawPosition: 3

    [[1, 5], '6-0 6-0', 2], // win for drawPosition: 5
  ];

  // drawPosition 4 has 3 wins and is 1st
  // drawPositions 1, 2 & 3 each have 2 wins
  // drawPosition 1 beat both 2 and 3 and is 2nd
  // drawPosition 2 beat 3 in h2h and gets 3rd
  // drawPosition 3 is therefore 4th
  // drawPosition 5 had only one win and is 5th

  // idsFilter needs to be used to scope the winsRatios to the tied group

  const { participantResults } = generateScenario({ outcomeValues });
  const drawPositions = participantResults.map(({ drawPosition }) => drawPosition);
  expect(drawPositions).toEqual([4, 1, 2, 3, 5]);

  expect(participantResults.map(({ participantResult }) => participantResult.groupOrder)).toEqual([1, 2, 3, 4, 5]);
});

it('can recognize unbreakable 3 way ties', () => {
  const outcomeValues = [
    [[4, 5], '6-0 6-0', 1], // win for drawPosition: 4
    [[2, 4], '6-0 6-0', 2], // win for drawPosition: 4
    [[3, 4], '6-0 6-0', 2], // win for drawPosition: 4

    [[1, 2], '6-0 6-0', 1], // win for drawPosition: 1
    [[1, 4], '6-0 6-0', 1], // win for drawPosition: 1
    [[2, 3], '6-0 6-0', 1], // win for drawPosition: 2
    [[2, 5], '6-0 6-0', 1], // win for drawPosition: 2
    [[1, 3], '6-0 6-0', 2], // win for drawPosition: 3
    [[3, 5], '6-0 6-0', 1], // win for drawPosition: 3

    [[1, 5], '6-0 6-0', 2], // win for drawPosition: 5
  ];

  // drawPosition 4 has 3 wins and is 1st
  // drawPositions 1, 2 & 3 each have 2 wins
  // drawPositions 1 beat 2, 2 beat 3 and 3 beat 1
  // ... therefore 1, 2 & 3 are tied for 2nd
  // drawPosition 5 had only one win and is 5th

  const { participantResults } = generateScenario({ outcomeValues });
  const drawPositions = participantResults.map(({ drawPosition }) => drawPosition);
  expect(drawPositions).toEqual([4, 1, 2, 3, 5]);

  expect(participantResults.map(({ participantResult }) => participantResult.groupOrder)).toEqual([1, 2, 2, 2, 5]);
});

it('can break 3 way ties by setsPct without idsFilter', () => {
  const outcomeValues = [
    [[4, 5], '6-0 6-0', 1], // win for drawPosition: 4
    [[2, 4], '6-0 6-0', 2], // win for drawPosition: 4
    [[3, 4], '6-0 6-0', 2], // win for drawPosition: 4

    [[1, 2], '6-0 0-6 6-0', 1], // win for drawPosition: 1
    [[1, 4], '6-0 6-0', 1], // win for drawPosition: 1
    [[2, 3], '6-0 6-0', 1], // win for drawPosition: 2
    [[2, 5], '6-0 6-0', 1], // win for drawPosition: 2
    [[1, 3], '6-0 6-0', 2], // win for drawPosition: 3
    [[3, 5], '6-0 6-0', 1], // win for drawPosition: 3

    [[1, 5], '6-0 6-0', 2], // win for drawPosition: 5
  ];

  // drawPosition 4 has 3 wins and is 1st
  // drawPositions 1, 2 & 3 each have 2 wins
  // drawPositions 1 beat 2, 2 beat 3 and 3 beat 1
  // drawPosition 1 lost an additional set so is last in the tied group (4th) due to setsPct
  // drawPosition 2 beat 3 in h2h and gets 2nd
  // drawPosition 3 is therefore 3rd
  // drawPosition 5 had only one win and is 5th

  // does not need to use the idsFilter

  const { participantResults } = generateScenario({ outcomeValues });
  const drawPositions = participantResults.map(({ drawPosition }) => drawPosition);
  expect(drawPositions).toEqual([4, 2, 3, 1, 5]);

  expect(participantResults.map(({ participantResult }) => participantResult.groupOrder)).toEqual([1, 2, 3, 4, 5]);
});

it('can break 3 way ties by gamesPct', () => {
  const outcomeValues = [
    [[4, 5], '6-0 6-0', 1], // win for drawPosition: 4
    [[2, 4], '6-0 6-0', 2], // win for drawPosition: 4
    [[3, 4], '6-0 6-0', 2], // win for drawPosition: 4

    [[1, 2], '6-0 6-1', 1], // win for drawPosition: 1
    [[1, 4], '6-0 6-0', 1], // win for drawPosition: 1
    [[2, 3], '6-0 6-0', 1], // win for drawPosition: 2
    [[2, 5], '6-0 6-0', 1], // win for drawPosition: 2
    [[1, 3], '6-0 6-0', 2], // win for drawPosition: 3
    [[3, 5], '6-0 6-0', 1], // win for drawPosition: 3

    [[1, 5], '6-0 6-0', 2], // win for drawPosition: 5
  ];

  // drawPosition 4 has 3 wins and is 1st
  // drawPositions 1, 2 & 3 each have 2 wins
  // drawPositions 1 beat 2, 2 beat 3 and 3 beat 1
  // drawPosition 1 lost one more game than 2 and 3 and is therefore last in tied group due to gamesPct
  // drawPosition 5 had only one win and is 5th

  const { participantResults } = generateScenario({ outcomeValues });
  const drawPositions = participantResults.map(({ drawPosition }) => drawPosition);
  expect(drawPositions).toEqual([4, 2, 3, 1, 5]);

  expect(participantResults.map(({ participantResult }) => participantResult.groupOrder)).toEqual([1, 2, 3, 4, 5]);
});

it('can break h2h ties between 2 participants', () => {
  // 5, participants; 2 participants tied for 1st, 2 participants tied for 3rd
  // order determined by head2head of each tie
  // drawPositions 1 & 2 have 3 wins each; 1 beat 2, so 1 is 1st, 2 is 2nd
  // drawPositions 1 & 2 have 3 wins each; 1 beat 2, so 1 is 1st, 2 is 2nd
  // drawPosition 4 has 2 wins, is 3rd
  // drawPositions 3 & 5 have 1 win each; 3 beat 5, so 3 is 4th, 5 is 5th
  const outcomeValues = [
    [[1, 2], '6-0 6-0', 1], // win for drawPosition: 1
    [[1, 3], '6-0 6-0', 1], // win for drawPosition: 1
    [[1, 4], '6-0 6-0', 1], // win for drawPosition: 1

    [[2, 3], '6-0 6-0', 1], // win for drawPosition: 2
    [[2, 4], '6-0 6-0', 1], // win for drawPosition: 2
    [[2, 5], '6-0 6-0', 1], // win for drawPosition: 2

    [[3, 4], '6-0 6-0', 2], // win for drawPosition: 4
    [[4, 5], '6-0 6-0', 2], // win for drawPosition: 4

    [[3, 5], '6-0 6-0', 1], // win for drawPosition: 3
    [[1, 5], '6-0 6-0', 2], // win for drawPosition: 5
  ];
  const expectation = [1, 2, 3, 4, 5];

  const { participantResults } = generateScenario({ outcomeValues });
  expect(participantResults.map(({ participantResult }) => participantResult.groupOrder)).toEqual(expectation);

  // expect thta the 1st/2nd place finish was decided by h2h win
  expect(participantResults[0].participantResult.victories.includes(participantResults[1].participantId)).toEqual(true);

  // expect thta the 4th/5th place finish was decided by h2h win
  expect(participantResults[3].participantResult.victories.includes(participantResults[4].participantId)).toEqual(true);
});

function generateScenario({ outcomeValues }) {
  const outcomes = outcomeValues.map(([drawPositions, scoreString, winningSide]) => ({
    drawPositions,
    scoreString,
    winningSide,
  }));
  const drawProfiles = [
    {
      drawSize: 5,
      eventType: SINGLES,
      participantsCount: 5,
      matchUpFormat: FORMAT_STANDARD,
      drawType: ROUND_ROBIN,
      structureOptions: { groupSize: 5 },
      outcomes,
    },
  ];
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles,
    participantsProfile: { participantsCount: 5 },
  });

  const { eventData } = tournamentEngine.setState(tournamentRecord).getEventData({ drawId });
  const participantResults = eventData.drawsData[0].structures[0].participantResults.sort(
    (a, b) => a.participantResult.groupOrder - b.participantResult.groupOrder,
  );

  return { participantResults };
}
