import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { COMPLETED, IN_PROGRESS } from '@Constants/matchUpStatusConstants';
import { FEMALE, MALE, MIXED } from '@Constants/genderConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';
import { TEAM } from '@Constants/eventConstants';

const SET1T20 = 'SET1-S:T20';
const tieFormats = {
  aggregateDuo: {
    collectionDefinitions: [
      {
        collectionName: 'Mixed Doubles',
        matchUpFormat: 'SET1-S:8/TB7',
        matchUpType: DOUBLES,
        matchUpCount: 1,
        matchUpValue: 1,
        gender: MIXED,
      },
      {
        collectionName: 'Male Singles',
        matchUpFormat: 'SET3-S:6/TB7-F:TB10',
        matchUpType: SINGLES,
        matchUpCount: 1,
        matchUpValue: 1,
        gender: MALE,
      },
      {
        collectionName: 'Female Singles',
        matchUpFormat: 'SET3-S:6/TB7-F:TB10',
        matchUpType: SINGLES,
        matchUpCount: 1,
        matchUpValue: 1,
        gender: FEMALE,
      },
    ],
    tieFormatName: 'DOMINANT_DUO_MIXED',
    winCriteria: {
      valueGoal: 2,
    },
  },
  Shuffle: {
    collectionDefinitions: [
      {
        collectionId: 'cid1',
        collectionName: 'Round 1',
        matchUpCount: 3,
        matchUpFormat: SET1T20,
        matchUpType: DOUBLES,
        scoreValue: 1,
      },
      {
        collectionId: 'cid2',
        collectionName: 'Round 2',
        matchUpCount: 3,
        matchUpFormat: SET1T20,
        matchUpType: DOUBLES,
        scoreValue: 1,
      },
      {
        collectionId: 'cid3',
        collectionName: 'Round 3',
        matchUpCount: 3,
        matchUpFormat: SET1T20,
        matchUpType: DOUBLES,
        scoreValue: 1,
      },
    ],
    winCriteria: {
      aggregateValue: true,
    },
  },
  Mixup: {
    collectionDefinitions: [
      {
        collectionId: 'cid1',
        collectionName: 'Round 1',
        matchUpCount: 3,
        matchUpFormat: 'SET3-S:TB10',
        matchUpType: DOUBLES,
        setValue: 1,
      },
      {
        collectionId: 'cid2',
        collectionName: 'Round 2',
        matchUpCount: 3,
        matchUpFormat: SET1T20,
        matchUpType: DOUBLES,
        scoreValue: 1,
      },
      {
        collectionId: 'cid3',
        collectionName: 'Round 3',
        matchUpCount: 3,
        matchUpFormat: SET1T20,
        matchUpType: DOUBLES,
        scoreValue: 1,
      },
    ],
    winCriteria: {
      aggregateValue: true,
    },
  },
  collectionAggregate: {
    collectionDefinitions: [
      {
        collectionId: 'cid1',
        collectionName: 'Round 1',
        matchUpCount: 3,
        matchUpFormat: SET1T20,
        matchUpType: DOUBLES,
        collectionValue: 1,
        winCriteria: {
          aggregateValue: true,
        },
      },
      {
        collectionId: 'cid2',
        collectionName: 'Round 2',
        matchUpCount: 3,
        matchUpFormat: SET1T20,
        matchUpType: DOUBLES,
        scoreValue: 1,
      },
      {
        collectionId: 'cid3',
        collectionName: 'Round 3',
        matchUpCount: 3,
        matchUpFormat: SET1T20,
        matchUpType: DOUBLES,
        scoreValue: 1,
      },
    ],
    winCriteria: {
      aggregateValue: true,
    },
  },
};

const scenarios = [
  {
    scenarioNumber: 1,
    tieFormat: tieFormats.Shuffle,
    outcome: {
      score: { sets: [{ side1Score: 2, side2Score: 1, winningSide: 1 }] },
      winningSide: 1,
    },
    collectionValues: {
      cid1: { complete: 3 },
      cid2: { complete: 3 },
      cid3: { complete: 3 },
    },
    scoreGoal: {
      scoreStringSide1: '18-9',
      scoreStringSide2: '9-18',
      sets: [{ side1Score: 18, side2Score: 9, winningSide: 1 }],
    },
    matchUpStatusGoal: COMPLETED,
    secondRoundDrawPositions: [1, 3],
  },
  {
    scenarioNumber: 2,
    tieFormat: tieFormats.Shuffle,
    outcome: {
      score: { sets: [{ side1Score: 2, side2Score: 1, winningSide: 1 }] },
      winningSide: 1,
    },
    collectionValues: {
      cid1: { complete: 2 },
      cid2: { complete: 3 },
      cid3: { complete: 3 },
    },
    scoreGoal: {
      scoreStringSide1: '16-8',
      scoreStringSide2: '8-16',
      sets: [{ side1Score: 16, side2Score: 8 }],
    },
    matchUpStatusGoal: IN_PROGRESS,
    secondRoundDrawPositions: undefined,
  },
  {
    scenarioNumber: 3,
    tieFormat: tieFormats.Mixup,
    outcome: {
      score: { sets: [{ side1Score: 2, side2Score: 1, winningSide: 1 }] },
      winningSide: 1,
    },
    collectionValues: {
      cid1: {
        complete: 3,
        outcome: {
          score: {
            sets: [
              {
                setNumber: 1,
                side1TiebreakScore: 1,
                side2TiebreakScore: 10,
                winningSide: 2,
              },
              {
                setNumber: 2,
                side1TiebreakScore: 1,
                side2TiebreakScore: 10,
                winningSide: 2,
              },
            ],
          },
          winningSide: 2,
        },
      },
      cid2: { complete: 3 },
      cid3: { complete: 3 },
    },
    scoreGoal: {
      scoreStringSide1: '12-12',
      scoreStringSide2: '12-12',
      sets: [{ side1Score: 12, side2Score: 12 }],
    },
    matchUpStatusGoal: IN_PROGRESS,
    secondRoundDrawPositions: undefined,
  },
  {
    scenarioNumber: 4,
    tieFormat: tieFormats.collectionAggregate,
    outcome: {
      score: { sets: [{ side1Score: 2, side2Score: 1, winningSide: 1 }] },
      winningSide: 1,
    },
    collectionValues: {
      cid1: { complete: 3 },
      cid2: { complete: 3 },
      cid3: { complete: 3 },
    },
    scoreGoal: {
      scoreStringSide1: '13-6',
      scoreStringSide2: '6-13',
      sets: [{ side1Score: 13, side2Score: 6, winningSide: 1 }],
    },
    matchUpStatusGoal: COMPLETED,
    secondRoundDrawPositions: [1, 3],
  },
].filter(({ scenarioNumber }) => scenarioNumber !== 0);

const policyDefinitions = { [POLICY_TYPE_SCORING]: { requireParticipantsForScoring: false } };

test.each(scenarios)(
  'tieFormat scoreValue works with winCriteria: aggregateValue',
  ({ secondRoundDrawPositions, matchUpStatusGoal, collectionValues, scoreGoal, tieFormat, outcome }) => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: TEAM, drawSize: 4, tieFormat }],
      policyDefinitions,
    });

    tournamentEngine.setState(tournamentRecord);

    let { matchUps: firstRoundDualMatchUps } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: {
        matchUpTypes: [TEAM],
        roundNumbers: [1],
      },
    });

    expect(firstRoundDualMatchUps.length).toEqual(2);

    // for all first round dualMatchUps complete all doubles matchUps
    firstRoundDualMatchUps.forEach((dualMatchUp) => {
      const completed = {};
      dualMatchUp.tieMatchUps.forEach((tieMatchUp) => {
        const { matchUpId, collectionId } = tieMatchUp;
        if (!completed[collectionId]) completed[collectionId] = 0;

        if (collectionValues[collectionId]?.complete === completed[collectionId]) {
          return;
        }

        const result = tournamentEngine.setMatchUpStatus({
          outcome: collectionValues[collectionId]?.outcome || outcome,
          matchUpId,
          drawId,
        });
        expect(result.success).toEqual(true);
        completed[collectionId] += 1;
      });
    });

    ({ matchUps: firstRoundDualMatchUps } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: {
        matchUpTypes: [TEAM],
        roundNumbers: [1],
      },
    }));

    firstRoundDualMatchUps.forEach((dualMatchUp) => {
      const { winningSide, matchUpStatus, score, tieFormat } = dualMatchUp;
      expect(tieFormat.winCriteria.aggregateValue).toEqual(true);
      expect(matchUpStatus).toEqual(matchUpStatusGoal);
      if (matchUpStatusGoal === COMPLETED) {
        expect(winningSide).toEqual(1);
      }
      expect(score).toEqual(scoreGoal);
    });

    const {
      matchUps: [secondRoundDualMatchUp],
    } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: {
        matchUpTypes: [TEAM],
        roundNumbers: [2],
      },
    });
    expect(secondRoundDualMatchUp.drawPositions).toEqual(secondRoundDrawPositions);
  },
);

// prettier-ignore
const outcomeScenarios = [
  {
    expectation: { 
      scores: ['7-5', '6-3 6-3', '2-6 2-6'],
    },
    outcomes: [
      {
        score: {
          sets: [ { setNumber: 1, side1Score: 7, side2Score: 5, winningSide: 1, }, ],
        },
        winningSide: 1,
      },
      {
        score: {
          sets: [
            { setNumber: 1, side1Score: 6, side2Score: 3, winningSide: 1, },
            { setNumber: 2, side1Score: 6, side2Score: 3, winningSide: 1, }, ],
        },
        winningSide: 1,
      },
      {
        score: {
          sets: [
            { setNumber: 1, side1Score: 2, side2Score: 6, winningSide: 2, },
            { setNumber: 2, side1Score: 2, side2Score: 6, winningSide: 2, },
          ],
        },
        winningSide: 2,
      },
    ],
  },
  {
    expectation: { 
      scores: ['7-5', '6-3 3-6 [10-2]', '2-6 2-6'],
    },
    winCriteria: { aggregateValue: true },
    outcomes: [
      {
        score: {
          sets: [
            { setNumber: 1, side1Score: 7, side2Score: 5, winningSide: 1, },
          ],
        },
        winningSide: 1,
      },
      {
        score: {
          sets: [
            { setNumber: 1, side1Score: 6, side2Score: 3, winningSide: 1, },
            { setNumber: 2, side1Score: 3, side2Score: 6, winningSide: 2, },
            { setNumber: 3, side1TiebreakScore: 10, side2TiebreakScore: 2, winningSide: 1, },
          ],
        },
        winningSide: 1,
      },
      {
        score: {
          sets: [
            { setNumber: 1, side1Score: 2, side2Score: 6, winningSide: 2, },
            { setNumber: 2, side1Score: 2, side2Score: 6, winningSide: 2, },
          ],
        },
        winningSide: 2,
      },
    ],
  },
];

test.each(outcomeScenarios)('aggregateValue works with matchUpValue', (scenario) => {
  const tieFormat: any = tieFormats.aggregateDuo;
  if (scenario.winCriteria) tieFormat.winCriteria = scenario.winCriteria;

  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ eventType: TEAM, drawSize: 4, tieFormat }],
    policyDefinitions,
  });

  tournamentEngine.setState(tournamentRecord);

  let { matchUps } = tournamentEngine.allTournamentMatchUps();
  expect(matchUps.length).toEqual(12);

  let teamMatchUp = matchUps.find((m) => m.matchUpType === TEAM && m.roundNumber === 1);
  let singlesMatchUps = teamMatchUp.tieMatchUps.filter((m) => m.matchUpType === SINGLES);
  const doublesMatchUp = teamMatchUp.tieMatchUps.find((m) => m.matchUpType === DOUBLES);

  let result = tournamentEngine.setMatchUpStatus({
    matchUpId: doublesMatchUp.matchUpId,
    outcome: scenario.outcomes[0],
    drawId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.setMatchUpStatus({
    matchUpId: singlesMatchUps[0].matchUpId,
    outcome: scenario.outcomes[1],
    drawId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.setMatchUpStatus({
    matchUpId: singlesMatchUps[1].matchUpId,
    outcome: scenario.outcomes[2],
    drawId,
  });
  expect(result.success).toEqual(true);

  matchUps = tournamentEngine.allTournamentMatchUps().matchUps;

  teamMatchUp = matchUps.find(({ matchUpId }) => matchUpId === teamMatchUp.matchUpId);
  expect(teamMatchUp.tieMatchUps.map((m) => m.score?.scoreStringSide1)).toEqual(scenario.expectation.scores);
  expect(teamMatchUp.winningSide).toEqual(1);

  const winningParticipant = teamMatchUp.sides.find(
    ({ sideNumber }) => sideNumber === teamMatchUp.winningSide,
  ).participant;
  const winningParticipantId = winningParticipant.participantId;

  let finalTeamMatchUp = matchUps.find(({ roundNumber, matchUpType }) => matchUpType === TEAM && roundNumber === 2);

  let advancedTeam = finalTeamMatchUp.sides.map(({ participant }) => participant).filter(Boolean)[0];
  const advancedParticipantId = advancedTeam.participantId;

  expect(winningParticipant.participantName).toEqual(advancedTeam.participantName);
  expect(winningParticipantId).toEqual(advancedParticipantId);

  const automaticallyAdvancedTeamName = advancedTeam.participantName;
  const automaticallyCalculatedScore = teamMatchUp.score;

  const manuallyScoredSets = [{ side1Score: 0, side2Score: 1, winningSide: 2 }];

  // now manually change the team score to not match the calculated score
  result = tournamentEngine.setMatchUpStatus({
    matchUpId: teamMatchUp.matchUpId,
    disableAutoCalc: true,
    outcome: {
      score: { sets: manuallyScoredSets },
      winningSide: 2,
    },
    drawId,
  });
  expect(result.success).toEqual(true);

  matchUps = tournamentEngine.allTournamentMatchUps().matchUps;

  teamMatchUp = matchUps.find(({ matchUpId }) => matchUpId === teamMatchUp.matchUpId);

  finalTeamMatchUp = matchUps.find(({ roundNumber, matchUpType }) => matchUpType === TEAM && roundNumber === 2);
  advancedTeam = finalTeamMatchUp.sides.map(({ participant }) => participant).filter(Boolean)[0];

  expect(teamMatchUp.winningSide).toEqual(2);
  expect(teamMatchUp.score.sets).toEqual(manuallyScoredSets);
  const manuallyAdvancedTeamName = advancedTeam.participantName;
  expect(manuallyAdvancedTeamName).not.toEqual(automaticallyAdvancedTeamName);

  // now re-score one of the singles matchUps and expect the team score not to change
  // disableAutoCalc is first-class in NATIVE, hydrated as `_disableAutoCalc` in LEGACY
  expect(teamMatchUp.disableAutoCalc ?? teamMatchUp._disableAutoCalc).toEqual(true);

  singlesMatchUps = teamMatchUp.tieMatchUps.filter((m) => m.matchUpType === SINGLES);

  let firstSinglesMatchUp = singlesMatchUps[0];

  const newWinningSide = 2 - firstSinglesMatchUp.winningSide;
  const newScoreString = '6-1 6-1';
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({
    scoreString: newScoreString,
    winningSide: newWinningSide,
    matchUpStatus: COMPLETED,
  });

  result = tournamentEngine.setMatchUpStatus({
    matchUpId: firstSinglesMatchUp.matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  matchUps = tournamentEngine.allTournamentMatchUps().matchUps;

  teamMatchUp = matchUps.find(({ matchUpId }) => matchUpId === teamMatchUp.matchUpId);
  // expect that the teamMatchUp score has not automatically been recalculated
  expect(teamMatchUp.score.sets).toEqual(manuallyScoredSets);

  singlesMatchUps = teamMatchUp.tieMatchUps.filter((m) => m.matchUpType === SINGLES);

  firstSinglesMatchUp = singlesMatchUps[0];
  expect(firstSinglesMatchUp.winningSide).toEqual(newWinningSide);

  expect(firstSinglesMatchUp.score[`scoreStringSide${newWinningSide}`]).toEqual(newScoreString);

  // enabling auto calc recalculates score
  result = tournamentEngine.enableTieAutoCalc({
    matchUpId: teamMatchUp.matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  // test disabling / enabling auto calc
  matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  teamMatchUp = matchUps.find(({ matchUpId }) => matchUpId === teamMatchUp.matchUpId);
  expect(teamMatchUp.disableAutoCalc ?? teamMatchUp._disableAutoCalc).toBeUndefined();
  expect(teamMatchUp.score).toEqual(automaticallyCalculatedScore);

  result = tournamentEngine.disableTieAutoCalc({
    matchUpId: teamMatchUp.matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  teamMatchUp = matchUps.find(({ matchUpId }) => matchUpId === teamMatchUp.matchUpId);
  expect(teamMatchUp.disableAutoCalc ?? teamMatchUp._disableAutoCalc).toEqual(true);

  result = tournamentEngine.enableTieAutoCalc({
    matchUpId: teamMatchUp.matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  teamMatchUp = matchUps.find(({ matchUpId }) => matchUpId === teamMatchUp.matchUpId);
  expect(teamMatchUp.disableAutoCalc ?? teamMatchUp._disableAutoCalc).toBeUndefined();
});
