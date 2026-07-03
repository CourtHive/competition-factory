import { generateTieMatchUpScore } from '@Assemblies/generators/tieMatchUpScore/generateTieMatchUpScore';
import { generateTeamTournament } from './generateTestTeamTournament';
import { setSubscriptions } from '@Global/state/globalState';
import { firstClassOrExtension } from '@Acquire/firstClassOrExtension';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, test } from 'vitest';

// constants
import { TEAM_DOUBLES_3_AGGREGATION, USTA_BREWER_CUP, USTA_GOLD_TEAM_CHALLENGE } from '@Constants/tieFormatConstants';
import { COMPLETED, DOUBLE_WALKOVER, IN_PROGRESS, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { CONSOLATION, FIRST_MATCH_LOSER_CONSOLATION, MAIN } from '@Constants/drawDefinitionConstants';
import { EXISTING_PARTICIPANT, TEAM_NOT_FOUND } from '@Constants/errorConditionConstants';
import { SWAP_PARTICIPANTS } from '@Constants/positionActionConstants';
import { DOUBLES, SINGLES, TEAM } from '@Constants/matchUpTypes';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { INDIVIDUAL } from '@Constants/participantConstants';
import { LINEUPS } from '@Constants/extensionConstants';

// reusable
const getMatchUp = (id, inContext?) => {
  const {
    matchUps: [matchUp],
  } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpIds: [id] },
    inContext,
  });
  return matchUp;
};

// prettier-ignore
const scenarios = [
  { drawSize: 2, singlesCount: 1, doublesCount: 0, valueGoal: 1, expectLineUps: true },
  { drawSize: 2, singlesCount: 0, doublesCount: 1, valueGoal: 1, expectLineUps: false },
  { drawSize: 2, singlesCount: 3, doublesCount: 0, valueGoal: 2, expectLineUps: true },
  { drawSize: 4, singlesCount: 3, doublesCount: 0, valueGoal: 2, expectLineUps: true },
  { drawSize: 8, singlesCount: 3, doublesCount: 0, valueGoal: 2, expectLineUps: true },
  { drawSize: 8, singlesCount: 6, doublesCount: 3, valueGoal: 5, expectLineUps: true, tieFormatTest: true, scoreStringSide1: '7-0' },
  { drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 8, singlesCount: 6, doublesCount: 3, valueGoal: 5 },
];

const policyDefinitions = { [POLICY_TYPE_SCORING]: { requireParticipantsForScoring: false } };

it.each(scenarios)('can advance teamParticipants', (scenario) => {
  const expectLineUps = scenario.expectLineUps;
  const { tournamentRecord, drawId, eventId, valueGoal } = generateTeamTournament(scenario);
  expect(valueGoal).toEqual(scenario.valueGoal);

  tournamentEngine.setState(tournamentRecord);

  // check status as dual match (only 2 teams, only one event, only one draw structure)
  const result = tournamentEngine.analyzeTournament();
  expect(result.analysis.isDual).toEqual(scenario.drawSize === 2);

  let { matchUps: firstRoundDualMatchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: {
      stages: [MAIN],
    },
    matchUpFilters: {
      matchUpTypes: [TEAM],
      roundNumbers: [1],
    },
  });

  expect(firstRoundDualMatchUps.length).toBeGreaterThan(0);

  // get positionAssignments to determine drawPositions
  let { drawDefinition, event } = tournamentEngine.getEvent({ drawId });
  const { positionAssignments } = drawDefinition.structures[0];

  const { participants: teamParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [TEAM] },
  });

  firstRoundDualMatchUps.forEach((dualMatchUp) =>
    assignParticipants({
      positionAssignments,
      teamParticipants,
      dualMatchUp,
      drawId,
    }),
  );

  if (expectLineUps) {
    ({ drawDefinition, event } = tournamentEngine.getEvent({ drawId }));
    const lineUps = firstClassOrExtension({ element: drawDefinition, attribute: 'lineUps', name: LINEUPS });
    expect(lineUps).not.toBeUndefined();
  }

  teamParticipants.forEach(({ participantId }) => {
    const { lineUp } = tournamentEngine.getTeamLineUp({
      participantId,
      drawId,
    });
    if (expectLineUps) expect(lineUp).not.toBeUndefined();
  });

  // for each first round dualMatchUp assign individualParticipants to singles matchUps
  // generate outcome to be applied to each first round singles matchUp
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({
    matchUpStatus: COMPLETED,
    scoreString: '6-1 6-1',
    winningSide: 1,
  });

  // for all first round dualMatchUps complete all singles/doubles matchUps
  firstRoundDualMatchUps.forEach((dualMatchUp) => {
    const singlesMatchUps = dualMatchUp.tieMatchUps.filter(({ matchUpType }) => matchUpType === SINGLES);
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
      expect(score.sets[0].side1Score).toEqual(i + 1);
      if (i + 1 >= valueGoal) {
        expect(winningSide).toEqual(1);
        expect(matchUpStatus).toEqual(COMPLETED);
      } else {
        expect(matchUpStatus).toEqual(IN_PROGRESS);
      }
    });

    // attempt to assign orderOfFinish to all singlesMatchUps
    const finishingOrder = singlesMatchUps.map(({ matchUpId }, index) => ({
      orderOfFinish: index + 1,
      matchUpId,
    }));
    const result = tournamentEngine.setOrderOfFinish({
      finishingOrder,
      drawId,
    });
    expect(result.success).toEqual(true);

    const singlesMatchUpCount = singlesMatchUps.length;

    const doublesMatchUps = dualMatchUp.tieMatchUps.filter(({ matchUpType }) => matchUpType === DOUBLES);
    doublesMatchUps.forEach((doublesMatchUp, i) => {
      const { matchUpId } = doublesMatchUp;
      const result = tournamentEngine.setMatchUpStatus({
        matchUpId,
        outcome,
        drawId,
      });
      expect(result.success).toEqual(true);
      const updatedDualMatchUp = getMatchUp(dualMatchUp.matchUpId);
      const { score, winningSide, matchUpStatus } = updatedDualMatchUp;
      expect(score.sets[0].side1Score).toEqual(singlesMatchUpCount + i + 1);
      if (singlesMatchUpCount + i + 1 >= valueGoal) {
        expect(winningSide).toEqual(1);
        expect(matchUpStatus).toEqual(COMPLETED);
      } else {
        expect(matchUpStatus).toEqual(IN_PROGRESS);
      }
    });
  });

  ({ matchUps: firstRoundDualMatchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: {
      stages: [MAIN],
    },
    matchUpFilters: {
      matchUpTypes: [TEAM],
      roundNumbers: [1],
    },
  }));

  firstRoundDualMatchUps.forEach((dualMatchUp) => {
    const { winningSide, matchUpStatus, score } = dualMatchUp;
    expect(matchUpStatus).toEqual(COMPLETED);
    expect(winningSide).toEqual(1);
    expect(score.sets[0].side1Score).toBeGreaterThanOrEqual(valueGoal);
  });

  const { matchUps: secondRoundDualMatchUps } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [TEAM], roundNumbers: [2] },
  });

  if (secondRoundDualMatchUps.length) {
    secondRoundDualMatchUps.forEach((dualMatchUp) => {
      if (dualMatchUp.drawPositions.length === 1) {
        expect(dualMatchUp.drawPositions.length).toEqual(1);
      } else {
        expect(dualMatchUp.drawPositions.length).toEqual(2);
      }
    });
  }

  const { eventData } = tournamentEngine.getEventData({ eventId });
  expect(eventData.drawsData.length).toEqual(1);
  eventData.drawsData[0].structures[0].roundMatchUps[1].forEach((matchUp) => {
    // expect only TEAM matchUps (SINGLES/DOUBLES matchUps are not included)
    expect(matchUp.tieMatchUps.length).toBeGreaterThan(0);
    expect(matchUp.matchUpType).toEqual(TEAM);

    // expect that each individual participant on the team also has team information
    matchUp.sides.forEach((side) =>
      side.participant.individualParticipants.forEach((individualParticipant) =>
        expect(individualParticipant.teams.length).toEqual(1),
      ),
    );
  });

  const { matchUps: firstRoundConsolationDuals } = tournamentEngine.allTournamentMatchUps({
    contextFilters: {
      stages: [CONSOLATION],
    },
    matchUpFilters: {
      matchUpTypes: [TEAM],
      roundNumbers: [1],
    },
  });

  if (firstRoundConsolationDuals.length) {
    firstRoundConsolationDuals.forEach((dualMatchUp) => {
      expect(dualMatchUp.readyToScore).toEqual(true);
      expect(dualMatchUp.sides.length).toEqual(2);
      expect(dualMatchUp.sides[0].lineUp).not.toBeUndefined();
      expect(dualMatchUp.sides[0].participantId).not.toBeUndefined;
    });
  }

  if (scenario.tieFormatTest) {
    const matchUp = firstRoundDualMatchUps[0];
    matchUp.tieFormat.collectionDefinitions.forEach((collectionDefinition) => {
      if (collectionDefinition.matchUpType === DOUBLES) {
        delete collectionDefinition.matchUpValue;
        collectionDefinition.collectionValue = 1;
      }
    });
    const result = generateTieMatchUpScore({ matchUp, drawDefinition, event });
    expect(result.scoreStringSide1).toEqual(scenario.scoreStringSide1);
  }
});

test('participants for other teams cannot be assigned without teamParticipantId', () => {
  const scenario = {
    singlesCount: 3,
    doublesCount: 0,
    valueGoal: 2,
    drawSize: 4,
  };

  const { tournamentRecord, drawId, valueGoal } = generateTeamTournament(scenario);
  expect(valueGoal).toEqual(scenario.valueGoal);

  tournamentEngine.setState(tournamentRecord);

  const { matchUps: firstRoundDualMatchUps } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [TEAM], roundNumbers: [1] },
  });

  const { participants: individualParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  });

  const errors: any[] = [];
  const participantIndex = 0;
  // for each first round dualMatchUp assign individualParticipants to singles matchUps
  firstRoundDualMatchUps.forEach((dualMatchUp) => {
    const singlesMatchUps = dualMatchUp.tieMatchUps.filter(({ matchUpType }) => matchUpType === SINGLES);
    const success = singlesMatchUps.every((singlesMatchUp) => {
      const tieMatchUpId = singlesMatchUp.matchUpId;
      singlesMatchUp.sides.forEach(() => {
        const individualParticipantId = individualParticipants[participantIndex].participantId;
        const result = tournamentEngine.assignTieMatchUpParticipantId({
          participantId: individualParticipantId,
          tieMatchUpId,
          drawId,
        });
        if (result.error) errors.push(result.error);
      });
      // intentionally returns false: participantIndex never increments, so assignments fail
      return false;
    });
    expect(success).toEqual(false);
  });

  expect(errors.length).toBeGreaterThan(0);
  errors.forEach((error) => expect([TEAM_NOT_FOUND, EXISTING_PARTICIPANT].includes(error)).toEqual(true));
});

test('tieFormat with scoreValue calculation', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    policyDefinitions,
    drawProfiles: [
      {
        tieFormatName: TEAM_DOUBLES_3_AGGREGATION,
        eventType: TEAM,
        drawSize: 4,
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);

  const outcome = {
    winningSide: 1,
    score: { sets: [{ winningSide: 1, side1Score: 2, side2Score: 1 }] },
  };

  let { matchUps: firstRoundDualMatchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: {
      stages: [MAIN],
    },
    matchUpFilters: {
      matchUpTypes: [TEAM],
      roundNumbers: [1],
    },
  });

  expect(firstRoundDualMatchUps.length).toEqual(2);

  // for all first round dualMatchUps complete all doubles matchUps
  firstRoundDualMatchUps.forEach((dualMatchUp) => {
    const doublesMatchUps = dualMatchUp.tieMatchUps.filter(({ matchUpType }) => matchUpType === DOUBLES);
    doublesMatchUps.forEach((doublesMatchUp) => {
      const { matchUpId } = doublesMatchUp;
      const result = tournamentEngine.setMatchUpStatus({
        matchUpId,
        outcome,
        drawId,
      });
      expect(result.success).toEqual(true);
    });
  });

  ({ matchUps: firstRoundDualMatchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: {
      stages: [MAIN],
    },
    matchUpFilters: {
      matchUpTypes: [TEAM],
      roundNumbers: [1],
    },
  }));

  firstRoundDualMatchUps.forEach((dualMatchUp) => {
    const { winningSide, matchUpStatus, score, tieFormat } = dualMatchUp;
    expect(tieFormat.winCriteria.aggregateValue).toEqual(true);
    expect(matchUpStatus).toEqual(COMPLETED);
    expect(winningSide).toEqual(1);
    expect(score).toEqual({
      scoreStringSide1: '18-9',
      scoreStringSide2: '9-18',
      sets: [{ side1Score: 18, side2Score: 9, winningSide: 1 }],
    });
  });

  const {
    matchUps: [secondRoundDualMatchUp],
  } = tournamentEngine.allTournamentMatchUps({
    contextFilters: {
      stages: [MAIN],
    },
    matchUpFilters: {
      matchUpTypes: [TEAM],
      roundNumbers: [2],
    },
  });
  expect(secondRoundDualMatchUp.drawPositions).toEqual([1, 3]);
});

test('properly removes advanced team at 9-0 in USTA_GOLD', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    policyDefinitions,
    drawProfiles: [
      {
        tieFormatName: USTA_GOLD_TEAM_CHALLENGE,
        eventType: TEAM,
        drawSize: 4,
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);

  let outcome = {
    winningSide: 1,
    score: {
      scoreStringSide1: '8-1',
      scoreStringSide2: '1-8',
      sets: [
        {
          setNumber: 1,
          side1Score: 8,
          side2Score: 1,
          winningSide: 1,
        },
      ],
    },
  };

  let { matchUps: firstRoundDualMatchUps } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [TEAM], roundNumbers: [1] },
    contextFilters: { stages: [MAIN] },
  });

  expect(firstRoundDualMatchUps.length).toEqual(2);

  // for all first round dualMatchUps complete all doubles matchUps
  firstRoundDualMatchUps.forEach((dualMatchUp) => {
    dualMatchUp.tieMatchUps.slice(0, 9).forEach((matchUp) => {
      const { matchUpId } = matchUp;
      const result = tournamentEngine.setMatchUpStatus({
        matchUpId,
        outcome,
        drawId,
      });
      expect(result.success).toEqual(true);
    });
  });

  ({ matchUps: firstRoundDualMatchUps } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [TEAM], roundNumbers: [1] },
    contextFilters: { stages: [MAIN] },
  }));

  firstRoundDualMatchUps.forEach((dualMatchUp) => {
    const { winningSide, matchUpStatus, score } = dualMatchUp;
    expect(matchUpStatus).toEqual(COMPLETED);
    expect(winningSide).toEqual(1);
    expect(score).toEqual({
      scoreStringSide1: '9-0',
      scoreStringSide2: '0-9',
      sets: [{ side1Score: 9, side2Score: 0, winningSide: 1 }],
    });
  });

  const {
    matchUps: [secondRoundDualMatchUp],
  } = tournamentEngine.allTournamentMatchUps({
    contextFilters: {
      stages: [MAIN],
    },
    matchUpFilters: {
      matchUpTypes: [TEAM],
      roundNumbers: [2],
    },
  });
  expect(secondRoundDualMatchUp.drawPositions).toEqual([1, 3]);

  const matchUpId = firstRoundDualMatchUps[0].tieMatchUps[0].matchUpId;

  outcome = {
    winningSide: 2,
    score: {
      scoreStringSide1: '1-8',
      scoreStringSide2: '8-1',
      sets: [
        {
          setNumber: 1,
          side1Score: 1,
          side2Score: 8,
          winningSide: 2,
        },
      ],
    },
  };

  const result = tournamentEngine.setMatchUpStatus({
    matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  const teamMatchUps = matchUps.filter(({ matchUpType }) => matchUpType === TEAM);

  const firstRoundFirst = teamMatchUps.find(
    ({ roundNumber, roundPosition }) => roundNumber === 1 && roundPosition === 1,
  );
  const secondRoundFirst = teamMatchUps.find(
    ({ roundNumber, roundPosition }) => roundNumber === 2 && roundPosition === 1,
  );

  expect(firstRoundFirst.winningSide).toBeUndefined();
  expect(firstRoundFirst.score.scoreStringSide1).toEqual('8-1');
  expect(secondRoundFirst.drawPositions.filter(Boolean)).toEqual([3]);

  const changedMatchUp = matchUps.find((matchUp) => matchUp.matchUpId === matchUpId);
  expect(changedMatchUp.score.scoreStringSide1).toEqual('1-8');
});

test('properly removes lineUps when team drawPositions are swapped', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        tieFormatName: USTA_BREWER_CUP,
        eventType: TEAM,
        drawSize: 4,
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);

  let { matchUps: firstRoundDualMatchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: {
      stages: [MAIN],
    },
    matchUpFilters: {
      matchUpTypes: [TEAM],
      roundNumbers: [1],
    },
  });

  expect(firstRoundDualMatchUps.length).toEqual(2);

  // get positionAssignments to determine drawPositions
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const { positionAssignments } = drawDefinition.structures[0];

  const { participants: teamParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [TEAM] },
  });

  firstRoundDualMatchUps.forEach((dualMatchUp) =>
    assignParticipants({
      positionAssignments,
      teamParticipants,
      dualMatchUp,
      drawId,
    }),
  );

  firstRoundDualMatchUps = tournamentEngine.allTournamentMatchUps({
    contextFilters: {
      stages: [MAIN],
    },
    matchUpFilters: {
      matchUpTypes: [TEAM],
      roundNumbers: [1],
    },
  }).matchUps;

  let targetMatchUp = firstRoundDualMatchUps[0];
  const side1LineUp = targetMatchUp.sides[0].lineUp.map(({ participantId }) => participantId);
  const side2LineUp = targetMatchUp.sides[1].lineUp.map(({ participantId }) => participantId);
  targetMatchUp.sides.forEach((side) => expect(side.lineUp.length).toEqual(6));

  const drawPosition = 1;
  const { structureId } = firstRoundDualMatchUps[0];
  let result = tournamentEngine.positionActions({
    drawPosition,
    structureId,
    drawId,
  });
  const options = result.validActions?.map((validAction) => validAction.type);
  expect(options.includes(SWAP_PARTICIPANTS)).toEqual(true);
  const option = result.validActions.find((action) => action.type === SWAP_PARTICIPANTS);
  expect(option.availableAssignments[1].drawPosition).toEqual(3);
  expect(option.availableAssignments.length).toEqual(3);

  const payload = option.payload;
  payload.drawPositions.push(option.availableAssignments[1].drawPosition);
  result = tournamentEngine[option.method](payload);
  expect(result.success).toEqual(true);

  firstRoundDualMatchUps = tournamentEngine.allTournamentMatchUps({
    contextFilters: {
      stages: [MAIN],
    },
    matchUpFilters: {
      matchUpTypes: [TEAM],
      roundNumbers: [1],
    },
  }).matchUps;

  targetMatchUp = firstRoundDualMatchUps[0];

  targetMatchUp.sides.forEach((side) => expect(side.lineUp.length).toEqual(6));
  const newSide1LineUp = targetMatchUp.sides[0].lineUp.map(({ participantId }) => participantId);
  expect(side1LineUp).not.toEqual(newSide1LineUp);
  const newSide2LineUp = targetMatchUp.sides[1].lineUp.map(({ participantId }) => participantId);
  expect(side2LineUp).toEqual(newSide2LineUp);
});

test('does not propagate matchUpStatusCodes from SINGLE/DOUBLES to TEAM matchUps on DOUBLE_WALKOVER', () => {
  const matchUpModifyNotices: any[] = [];

  const subscriptions = {
    modifyMatchUp: (payload) => {
      if (Array.isArray(payload)) {
        payload.forEach(({ matchUp }) => {
          const { matchUpType, matchUpStatusCodes, score } = matchUp;
          if (matchUpStatusCodes || score)
            matchUpModifyNotices.push([matchUpType, matchUpStatusCodes, score].filter(Boolean));
        });
      }
    },
  };

  setSubscriptions({ subscriptions });

  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, tieFormatName: USTA_BREWER_CUP, eventType: TEAM }],
  });

  tournamentEngine.setState(tournamentRecord);

  const { matchUps: firstRoundDualMatchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: {
      stages: [MAIN],
    },
    matchUpFilters: {
      matchUpTypes: [TEAM],
      roundNumbers: [1],
    },
  });

  expect(firstRoundDualMatchUps.length).toEqual(4);

  const targetMatchUp = firstRoundDualMatchUps[0];
  expect(targetMatchUp.matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(targetMatchUp.matchUpStatusCodes).toBeUndefined();

  const singlesMatchUps = targetMatchUp.tieMatchUps.filter(({ matchUpType }) => matchUpType === SINGLES);

  const outcome = {
    score: {
      scoreStringSide1: '',
      scoreStringSide2: '',
    },
    matchUpStatus: DOUBLE_WALKOVER,
    matchUpStatusCodes: ['WOWO', 'WOWO'],
  };
  const result = tournamentEngine.setMatchUpStatus({
    matchUpId: singlesMatchUps[0].matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  const {
    matchUps: [matchUp],
  } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: {
      matchUpIds: [targetMatchUp.matchUpId],
    },
  });

  expect(matchUp.matchUpStatus).toEqual(IN_PROGRESS);
  expect(matchUp.matchUpStatusCodes).toBeUndefined();
  const targetTieMatchUp = matchUp.tieMatchUps.find(({ matchUpStatus }) => matchUpStatus === DOUBLE_WALKOVER);
  expect(targetTieMatchUp.matchUpStatusCodes).toEqual(['WOWO', 'WOWO']);

  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: {
      stages: [MAIN],
    },
    matchUpFilters: {
      matchUpTypes: [TEAM],
      roundNumbers: [2],
    },
  });

  expect(matchUps.map(({ matchUpStatusCodes }) => matchUpStatusCodes).filter(Boolean)).toEqual([]);
  expect(matchUps.map(({ matchUpStatus }) => matchUpStatus)).toEqual(['TO_BE_PLAYED', 'TO_BE_PLAYED']);

  expect(matchUpModifyNotices).toEqual([
    [
      'SINGLES',
      ['WOWO', 'WOWO'],
      {
        scoreStringSide1: '',
        scoreStringSide2: '',
        sets: undefined,
      },
    ],
    [
      'TEAM',
      {
        scoreStringSide1: '0-0',
        scoreStringSide2: '0-0',
        sets: [{ side1Score: 0, side2Score: 0 }],
      },
    ],
  ]);
});

it('can set matchUpStatus of TEAM matchUps', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, eventType: TEAM }],
  });

  tournamentEngine.setState(tournamentRecord);

  const { matchUps: firstRoundDualMatchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: {
      stages: [MAIN],
    },
    matchUpFilters: {
      matchUpTypes: [TEAM],
      roundNumbers: [1],
    },
  });

  expect(firstRoundDualMatchUps.length).toEqual(4);

  let targetMatchUp = firstRoundDualMatchUps[0];
  expect(targetMatchUp.matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(targetMatchUp.matchUpStatusCodes).toBeUndefined();

  const singlesMatchUps = targetMatchUp.tieMatchUps.filter(({ matchUpType }) => matchUpType === SINGLES);

  const outcome = {
    score: {
      scoreStringSide1: '',
      scoreStringSide2: '',
    },
    matchUpStatus: DOUBLE_WALKOVER,
    matchUpStatusCodes: ['WOWO', 'WOWO'],
  };

  let result = tournamentEngine.setMatchUpStatus({
    matchUpId: singlesMatchUps[0].matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  targetMatchUp = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: {
      matchUpIds: [targetMatchUp.matchUpId],
    },
  }).matchUps[0];

  expect(targetMatchUp.matchUpStatus).toEqual(IN_PROGRESS);
  expect(targetMatchUp.matchUpStatusCodes).toBeUndefined();

  result = tournamentEngine.setMatchUpStatus({
    matchUpId: targetMatchUp.matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  targetMatchUp = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: {
      matchUpIds: [targetMatchUp.matchUpId],
    },
  }).matchUps[0];

  expect(targetMatchUp.matchUpStatus).toEqual(DOUBLE_WALKOVER);
});

it('can set score of TEAM matchUps', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, eventType: TEAM }],
    policyDefinitions,
  });

  tournamentEngine.setState(tournamentRecord);

  const { matchUps: firstRoundDualMatchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: {
      stages: [MAIN],
    },
    matchUpFilters: {
      matchUpTypes: [TEAM],
      roundNumbers: [1],
    },
  });

  expect(firstRoundDualMatchUps.length).toEqual(4);

  let targetMatchUp = firstRoundDualMatchUps[0];
  expect(targetMatchUp.matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(targetMatchUp.matchUpStatusCodes).toBeUndefined();

  const singlesMatchUps = targetMatchUp.tieMatchUps.filter(({ matchUpType }) => matchUpType === SINGLES);

  const outcome = {
    winningSide: 1,
    score: {
      scoreStringSide1: '2-1',
      scoreStringSide2: '1-2',
      sets: [
        {
          setNumber: 1,
          side1Score: 2,
          side2Score: 1,
          winningSide: 1,
        },
      ],
    },
  };

  let result = tournamentEngine.setMatchUpStatus({
    matchUpId: singlesMatchUps[0].matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  targetMatchUp = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: {
      matchUpIds: [targetMatchUp.matchUpId],
    },
  }).matchUps[0];

  expect(targetMatchUp.matchUpStatus).toEqual(IN_PROGRESS);
  expect(targetMatchUp.matchUpStatusCodes).toBeUndefined();

  result = tournamentEngine.setMatchUpStatus({
    matchUpId: targetMatchUp.matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  targetMatchUp = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: {
      matchUpIds: [targetMatchUp.matchUpId],
    },
  }).matchUps[0];

  expect(targetMatchUp.matchUpStatus).toEqual(COMPLETED);

  result = tournamentEngine.setMatchUpStatus({
    matchUpId: singlesMatchUps[1].matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  targetMatchUp = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: {
      matchUpIds: [targetMatchUp.matchUpId],
    },
  }).matchUps[0];

  expect(targetMatchUp.matchUpStatus).toEqual(IN_PROGRESS);
});

function assignParticipants({ positionAssignments, teamParticipants, dualMatchUp, drawId }) {
  const singlesMatchUps = dualMatchUp.tieMatchUps.filter(({ matchUpType }) => matchUpType === SINGLES);
  singlesMatchUps.forEach((singlesMatchUp, i) => {
    const tieMatchUpId = singlesMatchUp.matchUpId;
    singlesMatchUp.sides.forEach((side) => {
      const { drawPosition } = side;
      const teamParticipant = teamParticipants.find((teamParticipant) => {
        const { participantId } = teamParticipant;
        const assignment = positionAssignments.find((assignment) => assignment.participantId === participantId);
        return assignment.drawPosition === drawPosition;
      });
      if (teamParticipant) {
        const individualParticipantId = teamParticipant.individualParticipantIds[i];
        const result = tournamentEngine.assignTieMatchUpParticipantId({
          participantId: individualParticipantId,
          tieMatchUpId,
          drawId,
        });
        if (!result.success) console.log(result);
        expect(result.success).toEqual(true);
      }
    });
  });
}
