import { printGlobalLog, pushGlobalLog } from '@Functions/global/globalLog';
import { setDevContext, setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants and fixtures
import { BYE, COMPLETED, DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import {
  CONSOLATION,
  DOUBLE_ELIMINATION,
  FEED_IN_CHAMPIONSHIP,
  FIRST_MATCH_LOSER_CONSOLATION,
  MAIN,
} from '@Constants/drawDefinitionConstants';
import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import { MODIFY_MATCHUP } from '@Constants/topicConstants';

const getTarget = (params) => {
  const { matchUps, roundNumber, roundPosition, stage } = params;
  return matchUps.find(
    (matchUp) =>
      matchUp.roundNumber === roundNumber &&
      matchUp.roundPosition === roundPosition &&
      (!stage || matchUp.stage === stage),
  );
};

const scenarios = [
  {
    skip: false,
    devContext: false,
    modifiedMatchUpsCount: 7,
    outcomes: [
      {
        roundPosition: 1,
        roundNumber: 1,
        winningSide: 1,
      },
      {
        matchUpStatus: DOUBLE_WALKOVER,
        roundPosition: 2,
        roundNumber: 1,
      },
    ],
    preRemovalChecks: [
      {
        matchUpStatus: DOUBLE_WALKOVER,
        drawPositions: [3, 4],
        roundPosition: 2,
        roundNumber: 1,
        stage: MAIN,
      },
      {
        matchUpStatus: WALKOVER,
        drawPositions: [1],
        roundPosition: 1,
        roundNumber: 2,
        winningSide: 1,
        stage: MAIN,
      },
      {
        matchUpStatus: TO_BE_PLAYED,
        drawPositions: [1],
        roundPosition: 1,
        roundNumber: 3,
        stage: MAIN,
      },
      {
        losingSideMatchUpStatusCode: DOUBLE_WALKOVER,
        matchUpStatus: WALKOVER,
        drawPositions: [3, 4],
        stage: CONSOLATION,
        roundPosition: 1,
        roundNumber: 1,
        winningSide: 1,
      },
      {
        drawPositions: [1, 3],
        stage: CONSOLATION,
        matchUpStatus: BYE,
        roundPosition: 1,
        roundNumber: 2,
      },
      {
        matchUpStatus: TO_BE_PLAYED,
        stage: CONSOLATION,
        drawPositions: [3],
        roundPosition: 1,
        roundNumber: 3,
      },
    ],
    postRemovalChecks: [
      {
        matchUpStatus: COMPLETED,
        drawPositions: [1, 2],
        roundPosition: 1,
        roundNumber: 1,
        winningSide: 1,
        stage: MAIN,
      },
      {
        matchUpStatus: TO_BE_PLAYED,
        drawPositions: [3, 4],
        roundPosition: 2,
        roundNumber: 1,
        stage: MAIN,
      },
      {
        matchUpStatus: TO_BE_PLAYED,
        drawPositions: [1],
        roundPosition: 1,
        roundNumber: 2,
        stage: MAIN,
      },
      {
        matchUpStatus: TO_BE_PLAYED,
        drawPositions: undefined,
        roundPosition: 1,
        roundNumber: 3,
        stage: MAIN,
      },
      {
        matchUpStatus: TO_BE_PLAYED,
        stage: CONSOLATION,
        drawPositions: [],
        roundPosition: 1,
        roundNumber: 3,
      },
      {
        matchUpStatus: TO_BE_PLAYED,
        drawPositions: [3, 4],
        stage: CONSOLATION,
        roundPosition: 1,
        roundNumber: 1,
      },
      {
        matchUpStatus: TO_BE_PLAYED,
        stage: CONSOLATION,
        drawPositions: [1],
        roundPosition: 1,
        roundNumber: 2,
      },
    ],
  },
  {
    skip: false,
    devContext: false,
    // 10 (was 8): the propagated exit advances a participant into consolation
    // matchUps whose drawPositions were pre-seeded by the BYE feed (a feed-in BYE
    // match and the consolation semifinal). Those slots are filled via the
    // structure-level positionAssignment path, which previously emitted only a
    // modifyPositionAssignments notice — the per-matchUp modifyMatchUp notice for
    // each was missing, leaving a notice-driven consumer stale until a full reload.
    modifiedMatchUpsCount: 10,
    updates: [
      {
        matchUpStatus: DOUBLE_WALKOVER,
        roundPosition: 1,
        roundNumber: 1,
        stage: MAIN,
      },
      {
        roundPosition: 2,
        roundNumber: 1,
        winningSide: 1,
        stage: MAIN,
      },
    ],
    preRemovalChecks: [
      {
        matchUpStatus: DOUBLE_WALKOVER,
        drawPositions: [1, 2],
        roundPosition: 1,
        roundNumber: 1,
        stage: MAIN,
      },
      {
        matchUpStatus: WALKOVER,
        drawPositions: [3],
        roundPosition: 1,
        roundNumber: 2,
        winningSide: 2,
        stage: MAIN,
      },
      {
        matchUpStatus: TO_BE_PLAYED,
        drawPositions: [3],
        roundPosition: 1,
        roundNumber: 3,
        stage: MAIN,
      },
      {
        losingSideMatchUpStatusCode: DOUBLE_WALKOVER,
        matchUpStatus: WALKOVER,
        drawPositions: [3, 4],
        stage: CONSOLATION,
        roundPosition: 1,
        roundNumber: 1,
        winningSide: 2,
      },
      {
        drawPositions: [1, 4],
        stage: CONSOLATION,
        matchUpStatus: BYE,
        roundPosition: 1,
        roundNumber: 2,
      },
      {
        stage: CONSOLATION,
        matchUpStatus: TO_BE_PLAYED,
        drawPositions: [4],
        roundNumber: 3,
        roundPosition: 1,
      },
    ],
    postRemovalChecks: [
      {
        matchUpStatus: TO_BE_PLAYED,
        drawPositions: [1, 2],
        roundPosition: 1,
        roundNumber: 1,
        stage: MAIN,
      },
      {
        matchUpStatus: COMPLETED,
        drawPositions: [3, 4],
        roundPosition: 2,
        roundNumber: 1,
        winningSide: 1,
        stage: MAIN,
      },
      {
        matchUpStatus: TO_BE_PLAYED,
        drawPositions: [3],
        roundPosition: 1,
        roundNumber: 2,
        stage: MAIN,
      },
      {
        matchUpStatus: TO_BE_PLAYED,
        drawPositions: undefined,
        roundPosition: 1,
        roundNumber: 3,
        stage: MAIN,
      },
      {
        matchUpStatus: TO_BE_PLAYED,
        stage: CONSOLATION,
        drawPositions: [],
        roundPosition: 1,
        roundNumber: 3,
      },
      {
        matchUpStatus: TO_BE_PLAYED,
        drawPositions: [3, 4],
        stage: CONSOLATION,
        roundPosition: 1,
        roundNumber: 1,
      },
      {
        matchUpStatus: TO_BE_PLAYED,
        includeCheck: true,
        stage: CONSOLATION,
        drawPositions: [1],
        roundPosition: 1,
        roundNumber: 2,
      },
    ],
  },
];

test.each(scenarios)('Double Exit produces exit in consolation', (params) => {
  const preRemovalChecks: any = params.preRemovalChecks;
  const postRemovalChecks: any = params.postRemovalChecks;
  const { modifiedMatchUpsCount, devContext, outcomes, updates, skip } = params;
  if (skip) return;

  setDevContext(devContext);

  // keep track of notficiations with each setMatchUpStatus event
  const modifiedMatchUpLog: any[] = [];
  let result = setSubscriptions({
    subscriptions: {
      [MODIFY_MATCHUP]: (matchUps) => {
        matchUps.forEach(({ matchUp }) => {
          const { roundNumber, roundPosition, matchUpStatus } = matchUp;
          modifiedMatchUpLog.push([matchUpStatus, roundNumber, roundPosition]);
        });
      },
    },
  });
  expect(result.success).toEqual(true);

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawType: FIRST_MATCH_LOSER_CONSOLATION,
        drawSize: 8,
        outcomes,
      },
    ],
  });

  const doubleWalkoverOutcome = (outcomes || updates)?.find(({ matchUpStatus }) => matchUpStatus === DOUBLE_WALKOVER);

  tournamentEngine.setState(tournamentRecord);
  let matchUps = tournamentEngine.allTournamentMatchUps().matchUps;

  if (updates?.length) {
    for (const update of updates) {
      const targetMatchUp = getTarget({
        ...update,
        matchUps,
      });
      const result = tournamentEngine.setMatchUpStatus({
        matchUpId: targetMatchUp.matchUpId,
        drawId: targetMatchUp.drawId,
        outcome: update,
      });
      expect(result.success).toEqual(true);
    }
  }

  if (modifiedMatchUpsCount) {
    expect(modifiedMatchUpLog.length).toEqual(modifiedMatchUpsCount);
  }

  matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  pushGlobalLog('doubleExitConsolation');

  // remove the DOUBLE_WALKOVER
  if (preRemovalChecks?.length) {
    for (const check of preRemovalChecks) {
      const targetMatchUp = getTarget({
        ...check,
        matchUps,
      });
      if (check.includeCheck !== false) {
        expect(targetMatchUp.drawPositions?.filter(Boolean)).toEqual(check.drawPositions);
        expect(targetMatchUp.matchUpStatus).toEqual(check.matchUpStatus);
        expect(targetMatchUp.winningSide).toEqual(check.winningSide);
      }
      const { roundNumber, roundPosition } = targetMatchUp;
      const color =
        JSON.stringify(targetMatchUp.drawPositions) === JSON.stringify(check.drawPositions)
          ? 'brightgreen'
          : 'brightmagenta';
      pushGlobalLog({
        method: 'before',
        keyColors: {
          stage: 'brightcyan',
          round: 'brightcyan',
          target: color,
          check: 'bright',
        },
        stage: targetMatchUp.stage,
        round: [roundNumber, roundPosition],
        target: JSON.stringify(targetMatchUp.drawPositions),
        check: JSON.stringify(check.drawPositions),
      });

      if (check.losingSideMatchUpStatusCode) {
        const losingSideMatchUpStatusCode = targetMatchUp.matchUpStatusCodes.find(
          (side) => side.sideNumber !== targetMatchUp.winningSide,
        ).previousMatchUpStatus;
        expect(losingSideMatchUpStatusCode).toEqual(check.losingSideMatchUpStatusCode);
      }
    }
  }

  pushGlobalLog('----------');

  let targetMatchUp = getTarget({
    ...doubleWalkoverOutcome,
    stage: MAIN,
    matchUps,
  });

  result = tournamentEngine.setMatchUpStatus({
    matchUpId: targetMatchUp.matchUpId,
    drawId: targetMatchUp.drawId,
    outcome: toBePlayed,
  });
  expect(result.success).toEqual(true);

  pushGlobalLog('----------');

  matchUps = tournamentEngine.allTournamentMatchUps().matchUps;

  if (postRemovalChecks?.length) {
    for (const check of postRemovalChecks) {
      targetMatchUp = getTarget({
        ...check,
        matchUps,
      });
      const color =
        JSON.stringify(targetMatchUp.drawPositions) === JSON.stringify(check.drawPositions)
          ? 'brightgreen'
          : 'brightmagenta';
      const { roundNumber, roundPosition } = targetMatchUp;
      pushGlobalLog({
        method: 'after',
        keyColors: {
          stage: 'brightcyan',
          round: 'brightcyan',
          target: color,
          check: 'bright',
        },
        stage: targetMatchUp.stage,
        round: [roundNumber, roundPosition],
        target: JSON.stringify(targetMatchUp.drawPositions),
        check: JSON.stringify(check.drawPositions),
      });
      if (check.includeCheck !== false) {
        expect(targetMatchUp.drawPositions?.filter(Boolean) ?? []).toEqual(check.drawPositions ?? []);
        expect(targetMatchUp.matchUpStatus).toEqual(check.matchUpStatus);
        expect(targetMatchUp.winningSide).toEqual(check.winningSide);
      }
    }
  }

  printGlobalLog(true);
  // reset
  setDevContext();
});
// A fed consolation final has no paired previous matchUp inside the consolation: its
// other side arrives over a feed link from the MAIN structure. doubleExitAdvancement
// dereferenced that absent pairing and threw a TypeError, leaving the source mutated
// to DOUBLE_WALKOVER with no advancement performed.
test.each([FEED_IN_CHAMPIONSHIP, DOUBLE_ELIMINATION])(
  'double exit into a fed consolation final advances the fed participant (%s)',
  (drawType) => {
    const drawId = 'drawId';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawSize: 8, participantsCount: 8, drawType, idPrefix: 'm' }],
      setState: true,
    });

    const allMatchUps = () => tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps;
    const scoreable = () =>
      allMatchUps().filter(
        (matchUp) =>
          !matchUp.winningSide &&
          [TO_BE_PLAYED, 'IN_PROGRESS'].includes(matchUp.matchUpStatus) &&
          matchUp.sides?.filter((side) => side.participant).length === 2,
      );

    const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-3 6-3', winningSide: 1 });

    // play forward until the consolation semi-final is contested
    for (let i = 0; i < 60; i++) {
      const targets = scoreable();
      if (targets.some(({ matchUpId }) => matchUpId === 'm-c-3-1')) break;
      expect(targets.length).toBeGreaterThan(0);
      tournamentEngine.setMatchUpStatus({ matchUpId: targets[0].matchUpId, outcome, drawId });
    }

    const sourceMatchUp = allMatchUps().find(({ matchUpId }) => matchUpId === 'm-c-3-1');
    const targetMatchUpId = sourceMatchUp.winnerMatchUpId;
    const fedParticipantId = allMatchUps()
      .find(({ matchUpId }) => matchUpId === targetMatchUpId)
      .sides.find((side) => side.participant)?.participantId;
    expect(fedParticipantId).toBeDefined();

    const result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_WALKOVER },
      propagateExitStatus: true,
      matchUpId: 'm-c-3-1',
      drawId,
    });
    expect(result.success).toEqual(true);

    expect(allMatchUps().find(({ matchUpId }) => matchUpId === 'm-c-3-1').matchUpStatus).toEqual(DOUBLE_WALKOVER);

    // nobody advances out of a double exit, so the fed participant takes the final by walkover
    const targetMatchUp = allMatchUps().find(({ matchUpId }) => matchUpId === targetMatchUpId);
    expect(targetMatchUp.matchUpStatus).toEqual(WALKOVER);
    const winningSideParticipantId = targetMatchUp.sides.find(
      (side) => side.sideNumber === targetMatchUp.winningSide,
    )?.participantId;
    expect(winningSideParticipantId).toEqual(fedParticipantId);
  },
);
