import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { COMPLETED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';

const scenarios = [
  {
    secondRoundDrawPositions: [2],
    secondRoundMatchUpsCount: 4,
    qualifyingRoundNumber: 2,
    matchUpsCount: 12,
    drawSize: 16,
  },
  {
    secondRoundDrawPositions: [2],
    secondRoundMatchUpsCount: 4,
    qualifyingPositions: 4,
    matchUpsCount: 12,
    drawSize: 16,
  },
  {
    secondRoundDrawPositions: [2],
    secondRoundMatchUpsCount: 12,
    qualifyingPositions: 2,
    ignoreDefaults: false,
    matchUpsCount: 45,
    drawSize: 16,
  },
  {
    secondRoundMatchUpsCount: 12,
    qualifyingBYEPositions: 2,
    qualifyingPositions: 1,
    ignoreDefaults: false,
    participantsCount: 14,
    matchUpsCount: 46,
    drawSize: 16,
  },
  {
    secondRoundMatchUpsCount: 10,
    qualifyingBYEPositions: 3,
    qualifyingPositions: 1,
    ignoreDefaults: false,
    participantsCount: 5,
    matchUpsCount: 38,
    drawSize: 8,
  },
  {
    secondRoundDrawPositions: [2],
    secondRoundMatchUpsCount: 4,
    qualifyingRoundNumber: 4,
    matchUpsCount: 15,
    drawSize: 16,
  },
  {
    secondRoundDrawPositions: [2],
    secondRoundMatchUpsCount: 4,
    qualifyingPositions: 1,
    matchUpsCount: 15,
    drawSize: 16,
  },
  {
    secondRoundDrawPositions: [2],
    secondRoundMatchUpsCount: 0,
    qualifyingRoundNumber: 1,
    matchUpsCount: 8,
    drawSize: 16,
  },
];

it.each(scenarios)('can qualify specified number of participants', (scenario) => {
  const ignoreDefaults = scenario.ignoreDefaults !== false;
  let result = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        qualifyingProfiles: [{ structureProfiles: [scenario] }],
        ignoreDefaults,
      },
    ],
  });

  const {
    tournamentRecord,
    drawIds: [drawId],
  } = result;

  tournamentEngine.setState(tournamentRecord);
  const { drawDefinition, event } = tournamentEngine.getEvent({ drawId });
  if (ignoreDefaults) {
    expect(drawDefinition.entries.length).toEqual(scenario.drawSize);
    expect(event.entries.length).toEqual(scenario.drawSize);
  }
  expect(drawDefinition.links[0].source.roundNumber).not.toBeUndefined;

  const qualifyingBYEsCount = drawDefinition.structures
    .find(({ stage }) => stage === QUALIFYING)
    .positionAssignments.filter((p) => p.bye).length;
  if (scenario.qualifyingBYEPositions) {
    expect(qualifyingBYEsCount).toEqual(scenario.qualifyingBYEPositions);
  }

  const qualifyingPositions = drawDefinition.structures
    .find(({ stage }) => stage === MAIN)
    .positionAssignments.filter((p) => p.qualifier).length;

  if (ignoreDefaults === false) {
    expect(qualifyingPositions).toEqual(scenario.qualifyingPositions);
  }

  let { matchUps } = tournamentEngine.allDrawMatchUps({ drawId });
  expect(matchUps.length).toEqual(scenario.matchUpsCount);

  const matchUpId = matchUps[0].matchUpId;
  let outcome = mocksEngine.generateOutcomeFromScoreString({
    matchUpStatus: COMPLETED,
    scoreString: '6-1 6-1',
    winningSide: 2,
  }).outcome;

  result = tournamentEngine.setMatchUpStatus({
    matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  matchUps = tournamentEngine.allDrawMatchUps({ drawId }).matchUps;

  const completedMatchUps = matchUps.filter(({ matchUpStatus }) => matchUpStatus === COMPLETED);

  expect(completedMatchUps.length).toEqual(1);

  let secondRoundMatchUps = matchUps.filter(({ roundNumber }) => roundNumber === 2);
  expect(secondRoundMatchUps.length).toEqual(scenario.secondRoundMatchUpsCount);

  if (scenario.secondRoundMatchUpsCount) {
    let secondRoundDrawPositions = secondRoundMatchUps.flatMap(({ drawPositions }) => drawPositions);

    if (scenario.secondRoundDrawPositions) {
      expect(secondRoundDrawPositions).toEqual(scenario.secondRoundDrawPositions);
    }

    ({ outcome } = mocksEngine.generateOutcomeFromScoreString({
      matchUpStatus: TO_BE_PLAYED,
      winningSide: undefined,
    }));
    result = tournamentEngine.setMatchUpStatus({
      matchUpId,
      outcome,
      drawId,
    });
    expect(result.success).toEqual(true);

    secondRoundMatchUps = matchUps.filter(({ roundNumber }) => roundNumber === 2);

    if (scenario.secondRoundDrawPositions) {
      secondRoundDrawPositions = secondRoundMatchUps.flatMap(({ drawPositions }) => drawPositions).filter(Boolean);
      expect(secondRoundDrawPositions).toEqual([]);
    }
  }
});
