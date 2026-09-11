import { firstClassOrExtension } from '@Acquire/firstClassOrExtension';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { TEAM_MATCHUP } from '@Constants/matchUpTypes';
import { TEAM_EVENT } from '@Constants/eventConstants';
import { TALLY } from '@Constants/extensionConstants';

const policyDefinitions = { [POLICY_TYPE_SCORING]: { requireParticipantsForScoring: false } };

it('supports disabling and then re-enabling auto-Calc', () => {
  mocksEngine.generateTournamentRecord({
    policyDefinitions,
    setState: true,
    eventProfiles: [
      {
        // completionGoal of 5 will compelte 1 DOUBLES in each first round TEAM matchUp
        // and then 1 SINGLES matchUp in one TEAM matchUp, which will compelte 1 TEAM matchUp
        drawProfiles: [{ drawSize: 8, completionGoal: 5 }],
        eventType: TEAM_EVENT,
      },
    ],
  });

  const { completedMatchUps, pendingMatchUps } = tournamentEngine.tournamentMatchUps();

  // completing 5 DOUBLES/SINGLES resulted in one first round TEAM match being completed
  expect(completedMatchUps.length).toEqual(6);

  let targetTeamMatchUp = completedMatchUps.find(({ matchUpType }) => matchUpType === TEAM_MATCHUP);
  let winnerTeamMatchUp = pendingMatchUps.find((matchUp) => matchUp.matchUpId === targetTeamMatchUp.winnerMatchUpId);

  const { matchUpId, drawId, winningSide: originalWinningSide } = targetTeamMatchUp;

  // in this case winningSide happens to equal drawPosition... because matchUp is { roundNumber : 1, roundPosition: 1 }
  const { matchUpId: winnerTeamMatchUpId, drawPositions: originalDrawPositions } = winnerTeamMatchUp;
  expect(originalDrawPositions).toEqual([originalWinningSide]);

  // now manually change the team score to not match the calculated score
  let result = tournamentEngine.setMatchUpStatus({
    outcome: { winningSide: 3 - originalWinningSide },
    disableAutoCalc: true,
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  targetTeamMatchUp = tournamentEngine.findMatchUp({
    drawId,
    matchUpId,
  }).matchUp;
  expect(targetTeamMatchUp.winningSide).toEqual(3 - originalWinningSide);

  winnerTeamMatchUp = tournamentEngine.findMatchUp({
    matchUpId: winnerTeamMatchUpId,
    drawId,
  }).matchUp;
  expect(winnerTeamMatchUp.drawPositions).toEqual([3 - originalWinningSide]);

  result = tournamentEngine.enableTieAutoCalc({
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  targetTeamMatchUp = tournamentEngine.findMatchUp({
    matchUpId,
    drawId,
  }).matchUp;

  expect(originalWinningSide).toEqual(targetTeamMatchUp.winningSide);

  winnerTeamMatchUp = tournamentEngine.findMatchUp({
    matchUpId: winnerTeamMatchUpId,
    drawId,
  }).matchUp;
  expect(originalDrawPositions).toEqual(winnerTeamMatchUp.drawPositions);
});

it('disabled auto calc with manually advanced team will not advance calculated winner on scoring', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    policyDefinitions,
    eventProfiles: [
      {
        // completionGoal of 5 will compelte 1 DOUBLES in each first round TEAM matchUp
        // and then 1 SINGLES matchUp in one TEAM matchUp, which will compelte 1 TEAM matchUp
        drawProfiles: [{ drawSize: 8, completionGoal: 5 }],
        eventType: TEAM_EVENT,
      },
    ],
  });

  let result = tournamentEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);

  const { completedMatchUps, pendingMatchUps } = tournamentEngine.tournamentMatchUps();

  // completing 5 DOUBLES/SINGLES resulted in one first round TEAM match being completed
  expect(completedMatchUps.length).toEqual(6);

  let targetTeamMatchUp = completedMatchUps.find(({ matchUpType }) => matchUpType === TEAM_MATCHUP);
  let winnerTeamMatchUp = pendingMatchUps.find((matchUp) => matchUp.matchUpId === targetTeamMatchUp.winnerMatchUpId);

  const { winningSide: originalWinningSide, matchUpId, drawId } = targetTeamMatchUp;

  // in this case winningSide happens to equal drawPosition... because matchUp is { roundNumber : 1, roundPosition: 1 }
  const { matchUpId: winnerTeamMatchUpId, drawPositions: originalDrawPositions } = winnerTeamMatchUp;
  expect(originalDrawPositions).toEqual([originalWinningSide]);

  // now manually change the team score to not match the calculated score
  result = tournamentEngine.setMatchUpStatus({
    outcome: { winningSide: 3 - originalWinningSide },
    disableAutoCalc: true,
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  targetTeamMatchUp = tournamentEngine.findMatchUp({
    matchUpId,
    drawId,
  }).matchUp;
  expect(targetTeamMatchUp.winningSide).toEqual(3 - originalWinningSide);
  expect(targetTeamMatchUp.disableAutoCalc ?? targetTeamMatchUp._disableAutoCalc).toEqual(true);

  winnerTeamMatchUp = tournamentEngine.findMatchUp({
    matchUpId: winnerTeamMatchUpId,
    drawId,
  }).matchUp;
  expect(winnerTeamMatchUp.drawPositions).toEqual([3 - originalWinningSide]);

  const incompleteSingles = targetTeamMatchUp.tieMatchUps.find(({ readyToScore }) => readyToScore);
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({
    winningSide: originalWinningSide,
    scoreString: '7-5 7-5',
  });

  tournamentEngine.setMatchUpStatus({
    matchUpId: incompleteSingles.matchUpId,
    outcome,
    drawId,
  });

  // because automatic score calculation is still disabled we expect no change from the manual override
  targetTeamMatchUp = tournamentEngine.findMatchUp({
    matchUpId,
    drawId,
  }).matchUp;
  expect(targetTeamMatchUp.winningSide).not.toEqual(originalWinningSide);

  winnerTeamMatchUp = tournamentEngine.findMatchUp({
    matchUpId: winnerTeamMatchUpId,
    drawId,
  }).matchUp;
  expect(winnerTeamMatchUp.drawPositions).not.toEqual([originalDrawPositions]);
});

it('will properly tally team games when automated scoring is disabled', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    policyDefinitions,
    eventProfiles: [
      {
        eventType: TEAM_EVENT,
        drawProfiles: [
          {
            drawType: ROUND_ROBIN,
            completionGoal: 5,
            drawSize: 4,
          },
        ],
      },
    ],
  });

  const checkTally = (tally) => {
    expect(tally.tieMatchUpsLost).toEqual(0);
    expect(tally.tieMatchUpsWon).toEqual(5);
    expect(tally.tieSinglesLost).toEqual(0);
    expect(tally.tieDoublesLost).toEqual(0);
    expect(tally.tieSinglesWon).toEqual(2);
    expect(tally.tieDoublesWon).toEqual(3);
  };

  let result = tournamentEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);

  const { completedMatchUps } = tournamentEngine.tournamentMatchUps();
  expect(completedMatchUps.length).toEqual(6);

  let targetTeamMatchUp = completedMatchUps.find(({ matchUpType }) => matchUpType === TEAM_MATCHUP);

  const { winningSide, sides, structureId, matchUpId, drawId } = targetTeamMatchUp;
  expect(winningSide).toEqual(1);

  let side = sides.find(({ sideNumber }) => sideNumber === winningSide);
  let { positionAssignments } = tournamentEngine.getPositionAssignments({
    structureId,
    drawId,
  });

  let assignment = positionAssignments.find((assignment) => assignment.drawPosition === side.drawPosition);
  let tally = firstClassOrExtension({ element: assignment, attribute: 'tally', name: TALLY });
  checkTally(tally);

  const methods = [
    {
      method: 'setMatchUpStatus',
      params: {
        matchUpId,
        drawId,

        outcome: {
          winningSide: 2,
          score: {
            scoreStringSide1: '0-2',
            scoreStringSide2: '2-0',
            sets: [
              {
                games: [],
                side1Score: 0,
                side2Score: 2,
                winningSide: 2,
              },
            ],
          },
        },
        disableAutoCalc: true,
      },
    },
  ];

  result = tournamentEngine.executionQueue(methods);
  expect(result.success).toEqual(true);

  targetTeamMatchUp = tournamentEngine.findMatchUp({
    drawId,
    matchUpId,
  }).matchUp;

  expect(targetTeamMatchUp.score).toEqual({
    sets: [{ games: [], side1Score: 0, side2Score: 2, winningSide: 2 }],
    scoreStringSide1: '0-2',
    scoreStringSide2: '2-0',
  });

  side = targetTeamMatchUp.sides.find(({ sideNumber }) => sideNumber === winningSide);
  positionAssignments = tournamentEngine.getPositionAssignments({
    structureId,
    drawId,
  }).positionAssignments;

  assignment = positionAssignments.find((assignment) => assignment.drawPosition === side.drawPosition);
  tally = firstClassOrExtension({ element: assignment, attribute: 'tally', name: TALLY });
  checkTally(tally);
});
