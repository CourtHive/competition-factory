import { generateTeamTournament } from './generateTestTeamTournament';
import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import { setDevContext } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { COMPLETED, IN_PROGRESS } from '@Constants/matchUpStatusConstants';
import { SINGLES, TEAM } from '@Constants/matchUpTypes';

const getMatchUp = (id, inContext?) => {
  const {
    matchUps: [matchUp],
  } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpIds: [id] },
    inContext,
  });
  return matchUp;
};

const scenarios = [
  { drawSize: 2, singlesCount: 1, doublesCount: 0, valueGoal: 1 },
  { drawSize: 2, singlesCount: 3, doublesCount: 0, valueGoal: 2 },
  { drawSize: 4, singlesCount: 1, doublesCount: 0, valueGoal: 1 },
  { drawSize: 4, singlesCount: 3, doublesCount: 0, valueGoal: 2 },
  { drawSize: 8, singlesCount: 3, doublesCount: 0, valueGoal: 2 },
];

it.each(scenarios)('can remove directed teamParticipants', (scenario) => {
  const { tournamentRecord, valueGoal } = generateTeamTournament(scenario);
  expect(valueGoal).toEqual(scenario.valueGoal);

  tournamentEngine.setState(tournamentRecord);

  const { matchUps: firstRoundDualMatchUps } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [TEAM], roundNumbers: [1] },
  });

  // generate outcome to be applied to each first round singles matchUp
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({
    matchUpStatus: COMPLETED,
    scoreString: '6-1 6-1',
    winningSide: 1,
  });

  processOutcome({ dualMatchUps: firstRoundDualMatchUps, outcome, valueGoal });

  let { matchUps: secondRoundDualMatchUps } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [TEAM], roundNumbers: [2] },
  });

  // check that all second round matchUps have two advanced positions
  if (secondRoundDualMatchUps.length) {
    secondRoundDualMatchUps.forEach((dualMatchUp) => {
      expect(dualMatchUp.drawPositions.length).toEqual(2);
    });
  }

  // remove outcomes
  processOutcome({ dualMatchUps: firstRoundDualMatchUps, outcome: toBePlayed });

  ({ matchUps: secondRoundDualMatchUps } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [TEAM], roundNumbers: [2] },
  }));

  // check that all second round matchUps have two advanced positions
  if (secondRoundDualMatchUps.length) {
    secondRoundDualMatchUps.forEach((dualMatchUp) => {
      // expect(dualMatchUp.drawPositions.filter(Boolean).length).toEqual(0);
      expect(dualMatchUp.drawPositions).toEqual(undefined);
    });
  }
});

it.each(scenarios)('can change winningSide', (scenario) => {
  const { tournamentRecord, valueGoal } = generateTeamTournament(scenario);
  expect(valueGoal).toEqual(scenario.valueGoal);

  tournamentEngine.setState(tournamentRecord);

  const { matchUps: firstRoundDualMatchUps } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [TEAM], roundNumbers: [1] },
  });

  let dualWinningSide = 1;
  // generate outcome to be applied to each first round singles matchUp
  let { outcome } = mocksEngine.generateOutcomeFromScoreString({
    winningSide: dualWinningSide,
    matchUpStatus: COMPLETED,
    scoreString: '6-1 6-1',
  });

  processOutcome({
    dualMatchUps: firstRoundDualMatchUps,
    checkForInProgress: true, // this can only be done on the first pass when winningSides aren't changing
    dualWinningSide,
    valueGoal,
    outcome,
  });

  let { matchUps: secondRoundDualMatchUps } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [TEAM], roundNumbers: [2] },
  });

  // check that all second round matchUps have two advanced positions
  if (secondRoundDualMatchUps.length) {
    secondRoundDualMatchUps.forEach((dualMatchUp) => {
      expect(dualMatchUp.drawPositions.length).toEqual(2);
    });
  }

  setDevContext({ tieMatchUps: true });

  dualWinningSide = 2;
  // generate outcome to be applied to each first round singles matchUp
  ({ outcome } = mocksEngine.generateOutcomeFromScoreString({
    winningSide: dualWinningSide,
    matchUpStatus: COMPLETED,
    scoreString: '6-1 6-1',
  }));

  // chnange the winningSide of all tieMatchUps in firstRoundDualMatchUps
  processOutcome({
    dualMatchUps: firstRoundDualMatchUps,
    dualWinningSide,
    valueGoal,
    outcome,
  });

  ({ matchUps: secondRoundDualMatchUps } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [TEAM], roundNumbers: [2] },
  }));

  if (secondRoundDualMatchUps.length) {
    secondRoundDualMatchUps.forEach((dualMatchUp) => {
      expect(dualMatchUp.drawPositions.length).toEqual(2);
    });
  }
});

function processOutcome(params) {
  const { dualWinningSide = 1, checkForInProgress, dualMatchUps, valueGoal, outcome } = params;
  dualMatchUps.forEach((dualMatchUp) => {
    const singlesMatchUps = dualMatchUp.tieMatchUps.filter(({ matchUpType }) => matchUpType === SINGLES);
    const { drawId } = dualMatchUp;
    singlesMatchUps.forEach((singlesMatchUp, i) => {
      const { matchUpId } = singlesMatchUp;
      const result = tournamentEngine.setMatchUpStatus({
        matchUpId,
        outcome,
        drawId,
      });
      expect(result.success).toEqual(true);
      const updatedDualMatchUp = getMatchUp(dualMatchUp.matchUpId);
      const { score, winningSide, matchUpStatus } = updatedDualMatchUp;
      if (valueGoal) {
        if (dualWinningSide === 1) {
          expect(score.sets[0].side1Score).toEqual(i + 1);
        } else {
          expect(score.sets[0].side2Score).toEqual(i + 1);
        }
        if (i + 1 >= valueGoal) {
          expect(winningSide).toEqual(dualWinningSide);
          expect(matchUpStatus).toEqual(COMPLETED);
        } else {
          if (checkForInProgress) {
            expect(matchUpStatus).toEqual(IN_PROGRESS);
          }
        }
      }
    });
  });
}
