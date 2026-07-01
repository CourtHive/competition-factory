import { removeAssignment } from '../../drawDefinitions/testingUtilities';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Tests/engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { unique } from '@Tools/arrays';
import { expect, test } from 'vitest';

// constants
import { COMPASS, CURTIS_CONSOLATION, FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import {
  BYE,
  COMPLETED,
  DEFAULTED,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  RETIRED,
  TO_BE_PLAYED,
  WALKOVER,
} from '@Constants/matchUpStatusConstants';

const factory = { tournamentEngine };

test.for([
  [
    {
      //outcome
      matchUpStatus: WALKOVER,
      winningSide: 2,
      matchUpStatusCodes: ['W1'], //injury
    },
    { expectedBackDrawMatchUpStatus: WALKOVER, expectedBackDrawMatchUpStatusCodes: ['W1'] },
  ],
  [
    {
      //outcome
      matchUpStatus: WALKOVER,
      winningSide: 2,
      matchUpStatusCodes: ['W2'], //illness
    },
    { expectedBackDrawMatchUpStatus: WALKOVER, expectedBackDrawMatchUpStatusCodes: ['W2'] },
  ],
  [
    {
      //outcome
      matchUpStatus: DEFAULTED,
      winningSide: 2,
      matchUpStatusCodes: ['DM'], //misconduct
    },
    { expectedBackDrawMatchUpStatus: DEFAULTED, expectedBackDrawMatchUpStatusCodes: ['DM'] },
  ],
  [
    {
      //outcome
      // when propagating RETIRED status, the loserMatchUp should be marked as WALKOVER
      matchUpStatus: RETIRED,
      winningSide: 2,
      matchUpStatusCodes: ['RJ'], //Injury
    },
    { expectedBackDrawMatchUpStatus: WALKOVER, expectedBackDrawMatchUpStatusCodes: ['RJ'] },
  ],
])('can propagate an %s exit status and result in a %s', ([outcome, expected]) => {
  const idPrefix = 'matchUp';
  const drawId = 'drawId';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 32, drawType: FIRST_MATCH_LOSER_CONSOLATION, idPrefix }],
    setState: true,
  });

  tournamentEngine.devContext(true);

  let matchUpId = 'matchUp-1-1';
  let result = tournamentEngine.setMatchUpStatus({
    outcome,
    propagateExitStatus: true,
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  const matchUps = factory.tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps;
  let matchUp = matchUps?.find((matchUp) => matchUp.matchUpId === matchUpId);
  expect(matchUp?.matchUpStatus).toEqual(outcome.matchUpStatus);
  expect(matchUp?.readyToScore).toEqual(false);
  expect(matchUp?.winningSide).toEqual(2);

  let loserMatchUp = matchUps?.find((mU) => mU.matchUpId === matchUp?.loserMatchUpId);
  expect(loserMatchUp?.matchUpStatus).toEqual(expected.expectedBackDrawMatchUpStatus);
  expect(loserMatchUp?.matchUpStatusCodes).toEqual(expected.expectedBackDrawMatchUpStatusCodes);
});

test(`it sets the correct status codes in a consolation match when a WO is propagated to a match with already an opponent.`, () => {
  const idPrefix = 'matchUp';
  const drawId = 'drawId';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 32, drawType: FIRST_MATCH_LOSER_CONSOLATION, idPrefix }],
    setState: true,
  });

  tournamentEngine.devContext(true);

  let matchUpId = 'matchUp-1-1';
  let result = tournamentEngine.setMatchUpStatus({
    outcome: {
      score: {
        scoreStringSide: '[11-3]',
        scoreStringSide2: '[3-11]',
      },
      matchUpStatus: COMPLETED,
      matchUpStatusCodes: [],
      winningSide: 1,
    },
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  let matchUps = factory.tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps;
  let matchUp = matchUps?.find((matchUp) => matchUp.matchUpId === matchUpId);
  expect(matchUp?.matchUpStatus).toEqual(COMPLETED);
  expect(matchUp?.readyToScore).toEqual(false);
  expect(matchUp?.winningSide).toEqual(1);

  matchUpId = 'matchUp-1-2';
  result = tournamentEngine.setMatchUpStatus({
    outcome: {
      //outcome
      matchUpStatus: WALKOVER,
      winningSide: 2,
      matchUpStatusCodes: ['W2'], //illness
    },
    propagateExitStatus: true,
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  //making sure we get the updated matchups data
  matchUps = factory.tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps;
  matchUp = matchUps?.find((matchUp) => matchUp.matchUpId === matchUpId);
  //get the updated loser matchup
  let loserMatchUp = matchUps?.find((mU) => mU.matchUpId === matchUp?.loserMatchUpId);
  expect(loserMatchUp?.matchUpStatus).toEqual(WALKOVER);
  // matchUpStatusCodes are position-dependent: the propagated WO participant feeds
  // in on side 2 here, so the code sits at index 1 → ['', 'W2'] (not ['W2'], which
  // would mis-map the walkover to the opponent on side 1).
  expect(loserMatchUp?.matchUpStatusCodes).toEqual(['', 'W2']);
  // the present opponent (side 1) takes the walkover win
  expect(loserMatchUp?.winningSide).toEqual(1);
});

test.for([
  [
    {
      //outcome
      matchUpStatus: WALKOVER,
      winningSide: 1,
      matchUpStatusCodes: ['W1'], //injury
    },
    { expectedBackDrawMatchUpStatus: DOUBLE_WALKOVER, expectedBackDrawMatchUpStatusCodes: ['WO', 'W1'] },
  ],
  [
    {
      //outcome
      matchUpStatus: WALKOVER,
      winningSide: 2,
      matchUpStatusCodes: ['W1'], //injury
    },
    { expectedBackDrawMatchUpStatus: DOUBLE_WALKOVER, expectedBackDrawMatchUpStatusCodes: ['WO', 'W1'] },
  ],
  [
    {
      //outcome
      matchUpStatus: DEFAULTED,
      winningSide: 1,
      matchUpStatusCodes: ['DM'],
    },
    { expectedBackDrawMatchUpStatus: DOUBLE_WALKOVER, expectedBackDrawMatchUpStatusCodes: ['WO', 'DM'] },
  ],
  [
    {
      //outcome
      matchUpStatus: DEFAULTED,
      winningSide: 2,
      matchUpStatusCodes: ['DM'],
    },
    { expectedBackDrawMatchUpStatus: DOUBLE_WALKOVER, expectedBackDrawMatchUpStatusCodes: ['WO', 'DM'] },
  ],
])(
  'can propagate a %s to a consolation match with already the result of a double walkover, resulting in %s',
  ([outcome, expected]) => {
    const idPrefix = 'matchUp';
    const drawId = 'drawId';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawSize: 32, drawType: FIRST_MATCH_LOSER_CONSOLATION, idPrefix }],
      setState: true,
    });

    tournamentEngine.devContext(true);

    //setting first match as DOUBLE WALKOVER
    const firstMatchUpId = 'matchUp-1-1';
    let result = tournamentEngine.setMatchUpStatus({
      outcome: {
        //outcome
        matchUpStatus: DOUBLE_WALKOVER,
        matchUpStatusCodes: ['WOWO', 'WOWO'],
      },
      matchUpId: firstMatchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    //setting second match based on input
    const secondMatchUpId = 'matchUp-1-2';
    result = tournamentEngine.setMatchUpStatus({
      outcome,
      propagateExitStatus: true,
      matchUpId: secondMatchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    const matchUps = factory.tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps;
    let matchUp = matchUps?.find((matchUp) => matchUp.matchUpId === secondMatchUpId);
    expect(matchUp?.matchUpStatus).toEqual(outcome.matchUpStatus);
    expect(matchUp?.readyToScore).toEqual(false);
    expect(matchUp?.winningSide).toEqual(outcome.winningSide);
    //consolation match should result in a DOUBLE_WALKOVER
    let loserMatchUp = matchUps?.find((mU) => mU.matchUpId === matchUp?.loserMatchUpId);
    expect(loserMatchUp?.matchUpStatus).toEqual(expected.expectedBackDrawMatchUpStatus);
    expect(loserMatchUp?.matchUpStatusCodes).toEqual(expected.expectedBackDrawMatchUpStatusCodes);
  },
);

test('can propagate a default to a consolation match with already the result of a double default, resulting in a DOUBLE_WALKOVER', () => {
  const idPrefix = 'matchUp';
  const drawId = 'drawId';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 32, drawType: FIRST_MATCH_LOSER_CONSOLATION, idPrefix }],
    setState: true,
  });

  //setting first match as DOUBLE DEFAULT
  const firstMatchUpId = 'matchUp-1-1';
  let result = tournamentEngine.setMatchUpStatus({
    outcome: {
      //outcome
      matchUpStatus: DOUBLE_DEFAULT,
      matchUpStatusCodes: ['DD', 'DD'],
    },
    matchUpId: firstMatchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  //setting second match as a DEFAULT
  const secondMatchUpId = 'matchUp-1-2';
  result = tournamentEngine.setMatchUpStatus({
    outcome: {
      matchUpStatus: DEFAULTED,
      winningSide: 2,
      matchUpStatusCodes: ['DM'],
    },
    propagateExitStatus: true,
    matchUpId: secondMatchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  const matchUps = factory.tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps;
  let matchUp = matchUps?.find((matchUp) => matchUp.matchUpId === secondMatchUpId);
  expect(matchUp?.matchUpStatus).toEqual(DEFAULTED);
  expect(matchUp?.readyToScore).toEqual(false);
  expect(matchUp?.winningSide).toEqual(2);
  //consolation match should result in a DOUBLE_WALKOVER
  let loserMatchUp = matchUps?.find((mU) => mU.matchUpId === matchUp?.loserMatchUpId);
  expect(loserMatchUp?.matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(loserMatchUp?.matchUpStatusCodes).toEqual(['WO', 'DM']);
});

test('can propagate an exit status and progress the already existing opponent in the back draw match', () => {
  const idPrefix = 'matchUp';
  const drawId = 'drawId';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 32, drawType: FIRST_MATCH_LOSER_CONSOLATION, idPrefix }],
    setState: true,
  });

  tournamentEngine.devContext(true);

  let matchUpId = 'matchUp-1-1';
  let result = tournamentEngine.setMatchUpStatus({
    outcome: {
      score: {
        scoreStringSide1: '[11-3]',
        scoreStringSide2: '[3-11]',
        sets: [
          {
            setNumber: 1,
            side1TiebreakScore: 11,
            side2TiebreakScore: 3,
            winningSide: 1,
          },
        ],
      },
      matchUpStatus: 'COMPLETED',
      status: {
        side1: {
          categoryName: 'Winner',
          subCategoryName: 'Winner',
          matchUpStatusCodeDisplay: 'Winner',
          matchUpStatusCode: '',
        },
        side2: {
          categoryName: 'None',
          subCategoryName: 'None',
          matchUpStatusCodeDisplay: 'None',
          matchUpStatusCode: '',
        },
      },
      winningSide: 1,
      matchUpFormat: 'SET1-S:TB11NOAD',
    },
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  //set a walkover to then feed the loser to the consolation draw with already one player.
  matchUpId = 'matchUp-1-2';
  result = tournamentEngine.setMatchUpStatus({
    outcome: {
      //outcome
      matchUpStatus: WALKOVER,
      winningSide: 2,
      matchUpStatusCodes: ['W1'], //injury
    },
    matchUpId,
    drawId,
    propagateExitStatus: true,
  });
  expect(result.success).toEqual(true);

  const matchUps = factory.tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps;
  let matchUp = matchUps?.find((matchUp) => matchUp.matchUpId === matchUpId);
  expect(matchUp?.matchUpStatus).toEqual(WALKOVER);
  expect(matchUp?.readyToScore).toEqual(false);
  expect(matchUp?.winningSide).toEqual(2);

  let loserMatchUp = matchUps?.find((mU) => mU.matchUpId === matchUp?.loserMatchUpId);
  expect(loserMatchUp?.matchUpStatus).toEqual(WALKOVER);
  expect(loserMatchUp?.winningSide).toEqual(1);
});

test('can propagate an exit status in a compass draw', () => {
  const idPrefix = 'matchUp';
  const drawId = 'drawId';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [
      // uuids are popped and therefore assigned in reverse order
      // in this instance the uuids are assigned to structureIds in the order they are generated
      { drawId, drawSize: 32, drawType: COMPASS, idPrefix, uuids: ['a8', 'a7', 'a6', 'a5', 'a4', 'a3', 'a2', 'a1'] },
    ],
    setState: true,
  });

  let matchUpId = 'matchUp-East-RP-1-1';
  let result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: WALKOVER, winningSide: 2 },
    propagateExitStatus: true,
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  const matchUps = factory.tournamentEngine.allDrawMatchUps({ drawId }).matchUps;
  const matchUp = matchUps?.find((matchUp) => matchUp.matchUpId === matchUpId);
  expect(matchUp?.matchUpStatus).toEqual(WALKOVER);
  const westLoserMatchUp = matchUps?.find((mU) => mU.matchUpId === matchUp?.loserMatchUpId);
  expect(westLoserMatchUp?.matchUpStatus).toEqual(WALKOVER);
  const southLoserMatchUp = matchUps?.find((mU) => mU.matchUpId === westLoserMatchUp?.loserMatchUpId);
  expect(southLoserMatchUp?.matchUpStatus).toEqual(WALKOVER);
  const southEastLoserMatchUp = matchUps?.find((mU) => mU.matchUpId === southLoserMatchUp?.loserMatchUpId);
  expect(southEastLoserMatchUp?.matchUpStatus).toEqual(WALKOVER);

  // create an outcome for completing matchUps
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({
    matchUpStatus: COMPLETED,
    scoreString: '6-1 6-1',
    winningSide: 1,
  });

  // now complete all remaining first round matchUps in the EAST structure
  let readyToScore = tournamentEngine
    .allTournamentMatchUps()
    .matchUps.filter((m) => m.readyToScore && m.matchUpStatus === TO_BE_PLAYED);

  // for a drawSize of 32 there should be 15 remaining matchUps readyToScore
  // 1 of the 16 first round EAST matchUps was a WALKOVER so only 15 remain
  expect(readyToScore.length).toEqual(15);

  let scoreResults = readyToScore.map((m) => {
    const { matchUpId, drawId } = m;
    const result = tournamentEngine.setMatchUpStatus({ matchUpId, drawId, outcome });
    return result.success;
  });
  expect(unique(scoreResults)).toEqual([true]);

  // now complete all remaining first round matchUps in the WEST structure
  // only WEST will have first round matchUps which are both readyToScore and TO_BE_PLAYED
  readyToScore = tournamentEngine
    .allTournamentMatchUps()
    .matchUps.filter((m) => m.readyToScore && m.matchUpStatus === TO_BE_PLAYED && m.roundNumber === 1);

  // for a drawSize of 32 there should be 7 remaining matchUps readyToScore in the WEST structure
  // 1 of the 8 first round WEST matchUps was a WALKOVER so only 7 remain
  expect(readyToScore.length).toEqual(7);

  scoreResults = readyToScore.map((m) => {
    const { matchUpId, drawId } = m;
    const result = tournamentEngine.setMatchUpStatus({ matchUpId, drawId, outcome });
    return result.success;
  });
  expect(unique(scoreResults)).toEqual([true]);

  // now complete all remaining first round matchUps in the SOUTH structure
  // only SOUTH will have first round matchUps which are both readyToScore and TO_BE_PLAYED
  readyToScore = tournamentEngine
    .allTournamentMatchUps()
    .matchUps.filter((m) => m.readyToScore && m.matchUpStatus === TO_BE_PLAYED && m.roundNumber === 1);

  // for a drawSize of 32 there should be 4 remaining matchUps readyToScore in the SOUTH structure
  // 1 of the 4 first round SOUTH matchUps was a WALKOVER so only 3 remain
  expect(readyToScore.length).toEqual(3);

  scoreResults = readyToScore.map((m) => {
    const { matchUpId, drawId } = m;
    const result = tournamentEngine.setMatchUpStatus({ matchUpId, drawId, outcome });
    return result.success;
  });
  expect(unique(scoreResults)).toEqual([true]);

  // now complete all remaining first round matchUps in the SOUTHEAST structure
  // only SOUTHEAST will have first round matchUps which are both readyToScore and TO_BE_PLAYED
  readyToScore = tournamentEngine
    .allTournamentMatchUps()
    .matchUps.filter((m) => m.readyToScore && m.matchUpStatus === TO_BE_PLAYED && m.roundNumber === 1);

  // for a drawSize of 32 there should be 2 remaining matchUps readyToScore in the SOUTHEAST structure
  // 1 of the 2 first round SOUTH matchUps was a WALKOVER so only 1 remains
  expect(readyToScore.length).toEqual(1);

  scoreResults = readyToScore.map((m) => {
    const { matchUpId, drawId } = m;
    const result = tournamentEngine.setMatchUpStatus({ matchUpId, drawId, outcome });
    return result.success;
  });
  expect(unique(scoreResults)).toEqual([true]);
});

test('can automatically progress the winner in a feed in round that already had a propagated WO participant fed in', () => {
  const idPrefix = 'm';
  const drawId = 'drawId';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawId,
        drawSize: 32,
        drawType: CURTIS_CONSOLATION,
        idPrefix,
        outcomes: [
          {
            roundPosition: 1,
            scoreString: '6-2 6-1',
            roundNumber: 1,
            winningSide: 1,
          },
          {
            scoreString: '6-2 6-1',
            roundPosition: 2,
            roundNumber: 1,
            winningSide: 1,
          },
          {
            roundPosition: 15,
            scoreString: '6-2 6-1',
            roundNumber: 1,
            winningSide: 1,
          },
          {
            scoreString: '6-2 6-1',
            roundPosition: 16,
            roundNumber: 1,
            winningSide: 1,
          },
        ],
      },
    ],
    setState: true,
  });
  //setting round 2 match 1 as a WO and propagating the exit to the consolation draw
  let matchUpId = 'm-2-1';
  let result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: WALKOVER, winningSide: 2, matchUpStatusCodes: ['W0'] },
    propagateExitStatus: true,
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  //making sure the consolation draw is now set as a WO
  const consolationFedInMatchUpId = 'm-c0-2-8';
  let matchUps = factory.tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps;
  let consolationFedInMatchUp = matchUps?.find((matchUp) => matchUp.matchUpId === consolationFedInMatchUpId);
  expect(consolationFedInMatchUp?.matchUpStatus).toEqual(WALKOVER);

  //now we set the score for the first round consolation draw that will progress to the consolationFedInMatchUp
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({
    matchUpStatus: COMPLETED,
    scoreString: '6-1 6-1',
    winningSide: 1,
  });
  let firstRoundConsolationMatchUpId = 'm-c0-1-8';
  result = tournamentEngine.setMatchUpStatus({
    outcome,
    matchUpId: firstRoundConsolationMatchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  //check that the winner has progress to consolationFedInMatchUp and also then progress to round 3
  matchUps = factory.tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps;
  consolationFedInMatchUp = matchUps?.find((matchUp) => matchUp.matchUpId === consolationFedInMatchUpId);
  expect(consolationFedInMatchUp?.matchUpStatus).toEqual(WALKOVER);
  expect(consolationFedInMatchUp?.winningSide).toEqual(2);
  const winnerParticipantId = consolationFedInMatchUp?.sides[consolationFedInMatchUp?.winningSide - 1].participantId;

  const round3ConsolationMatchUpId = 'm-c0-3-4';
  const round3ConsolationMatchUp = matchUps?.find((matchUp) => matchUp.matchUpId === round3ConsolationMatchUpId);
  expect(round3ConsolationMatchUp?.sides?.[0].participantId).toBeUndefined;
  //making sure the progressed player is the one that was mark as the winner in the fed in round
  expect(round3ConsolationMatchUp?.sides?.[1].participantId).toEqual(winnerParticipantId);
});

test('FMLC: propagated WO against a consolation BYE stays a BYE and the exit cascades to the next round', () => {
  // Scenario: FMLC 8-player draw where positions 2 and 4 are BYEs.
  // - The R1 losers (BYEs) produce a double-BYE in consolation R1P1, which auto-cascades a BYE into consolation R2P1.
  // - When R2P1 is set as WALKOVER (propagated), the WO participant is fed into consolation R2P1 against that BYE.
  // Spec: a BYE is not a walkover. The feed-in matchUp stays a BYE, the participant
  // advances through it, and the WALKOVER (exit) is applied at the next round where
  // the participant lands — with the non-exit side winning and the code on the
  // participant's side (position-aware).
  const idPrefix = 'm';
  const drawId = 'drawId';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION, idPrefix }],
    setState: true,
  });

  const {
    drawDefinition: {
      structures: [mainStructure, consolationStructure],
    },
  } = tournamentEngine.getEvent({ drawId });

  // Replace positions 2 and 4 with BYEs so:
  //   - R1P1=[position1(player), BYE]   → player1 auto-advances to R2P1 (validForConsolation)
  //   - R1P2=[position3(player), BYE]   → player3 auto-advances to R2P1 (validForConsolation)
  //   - Consolation R1P1 receives [BYE, BYE] → double-BYE cascades a BYE into consolation R2P1
  removeAssignment({ drawId, structureId: mainStructure.structureId, drawPosition: 2, replaceWithBye: true });
  removeAssignment({ drawId, structureId: mainStructure.structureId, drawPosition: 4, replaceWithBye: true });

  // Set R1P3 and R1P4 scores so the bottom half of the draw completes normally
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });
  tournamentEngine.setMatchUpStatus({ matchUpId: 'm-1-3', outcome, drawId });
  tournamentEngine.setMatchUpStatus({ matchUpId: 'm-1-4', outcome, drawId });

  const result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: WALKOVER, winningSide: 2, matchUpStatusCodes: ['W1'] },
    propagateExitStatus: true,
    matchUpId: 'm-2-1',
    drawId,
  });
  expect(result.success).toEqual(true);

  const matchUps = tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps;
  const consolationMatchUps = matchUps.filter((m) => m.structureId === consolationStructure.structureId);

  // The feed-in consolation match (R2) is a BYE — the WO participant advances
  // through it rather than the matchUp becoming a WALKOVER.
  const consolationFeedInMatchUp = consolationMatchUps.find((m) => m.roundNumber === 2 && m.roundPosition === 1);
  expect(consolationFeedInMatchUp?.matchUpStatus).toEqual(BYE);
  const woPlayerId = consolationFeedInMatchUp?.sides?.find((s) => s.participantId)?.participantId;
  expect(woPlayerId).toBeDefined();

  // The exit (WALKOVER) cascades onto the next round where the participant landed.
  const consolationR3MatchUp = consolationMatchUps.find(
    (m) => m.roundNumber === 3 && m.sides?.some((s) => s.participantId === woPlayerId),
  );
  expect(consolationR3MatchUp?.matchUpStatus).toEqual(WALKOVER);

  // The side WITHOUT the exit (the empty slot awaiting the other R2 winner) wins.
  const woSideNumber = consolationR3MatchUp?.sides?.find((s) => s.participantId === woPlayerId)?.sideNumber;
  expect(consolationR3MatchUp?.winningSide).toEqual(woSideNumber === 1 ? 2 : 1);

  // The carried code is position-aware: it sits on the participant's side.
  const expectedCodes = woSideNumber === 1 ? ['W1'] : ['', 'W1'];
  expect(consolationR3MatchUp?.matchUpStatusCodes).toEqual(expectedCodes);
});

test('FMLC: WO player advanced into a pre-seeded consolation slot fires a modifyMatchUp notice', () => {
  // Regression for the notice gap exposed by the WO-vs-consolation-BYE fix.
  // The WO player advances into the consolation match (R3) whose drawPositions slot
  // was pre-seeded by the consolation BYE feed. That advancement goes through the
  // structure-level position-assignment path, which emits modifyPositionAssignments
  // but previously skipped the per-matchUp modifyMatchUp notice (positionAdded=false).
  // Consumers that render from modifyMatchUp then showed a stale bracket until reload.
  // This asserts the consolation match the WO player lands in is announced via modifyMatchUp.
  const noticedMatchUpIds = new Set<string>();
  setSubscriptions({
    subscriptions: {
      modifyMatchUp: (payload: any) => {
        if (Array.isArray(payload))
          payload.forEach(({ matchUp }) => matchUp?.matchUpId && noticedMatchUpIds.add(matchUp.matchUpId));
      },
    },
  });

  const idPrefix = 'm';
  const drawId = 'drawId';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION, idPrefix }],
    setState: true,
  });

  const {
    drawDefinition: {
      structures: [mainStructure, consolationStructure],
    },
  } = tournamentEngine.getEvent({ drawId });

  removeAssignment({ drawId, structureId: mainStructure.structureId, drawPosition: 2, replaceWithBye: true });
  removeAssignment({ drawId, structureId: mainStructure.structureId, drawPosition: 4, replaceWithBye: true });

  const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });
  tournamentEngine.setMatchUpStatus({ matchUpId: 'm-1-3', outcome, drawId });
  tournamentEngine.setMatchUpStatus({ matchUpId: 'm-1-4', outcome, drawId });

  // Capture notices only for the propagated WALKOVER mutation under test
  noticedMatchUpIds.clear();
  const result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: WALKOVER, winningSide: 2, matchUpStatusCodes: ['W1'] },
    propagateExitStatus: true,
    matchUpId: 'm-2-1',
    drawId,
  });
  expect(result.success).toEqual(true);

  const matchUps = tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps;
  const consolationMatchUps = matchUps.filter((m) => m.structureId === consolationStructure.structureId);

  const consolationFeedInMatchUp = consolationMatchUps.find((m) => m.roundNumber === 2 && m.roundPosition === 1);
  const woPlayerId = consolationFeedInMatchUp?.sides?.find(
    (s) => s.sideNumber === consolationFeedInMatchUp.winningSide,
  )?.participantId;

  // The consolation R3 match the WO player advanced into
  const consolationR3MatchUp = consolationMatchUps.find(
    (m) => m.roundNumber === 3 && m.sides?.some((s) => s.participantId === woPlayerId),
  );
  expect(consolationR3MatchUp?.matchUpId).toBeDefined();

  // It must have fired a modifyMatchUp notice (not just a structure-level position-assignment notice)
  expect(noticedMatchUpIds.has(consolationR3MatchUp?.matchUpId)).toEqual(true);

  setSubscriptions({ subscriptions: {} });
});

test('FMLC: propagated WO cascades through a consolation BYE, then a later fall-through auto-resolves the pending walkover', () => {
  // Reproduces the ClubSpark drawSize-32 scenario:
  // - Two first-round BYE winners meet in main R2P2; a WALKOVER there feeds the
  //   loser into the consolation where it advances through a BYE to a later round,
  //   leaving a pending WALKOVER whose winning side is an empty feed slot.
  // - A later main completion (R2P1) sends a second-match loser through as a BYE,
  //   which advances the consolation opponent INTO that empty winning slot. They
  //   take the walkover (auto-resolve): keep WALKOVER, they win, the exiting player
  //   keeps the position-aware code, and only the winner advances (no loser leak).
  const drawId = 'drawId';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 32, drawType: FIRST_MATCH_LOSER_CONSOLATION, idPrefix: 'm' }],
    setState: true,
  });
  const {
    drawDefinition: {
      structures: [mainStructure, consolationStructure],
    },
  } = tournamentEngine.getEvent({ drawId });
  [2, 6, 8, 10, 23, 31].forEach((drawPosition) =>
    removeAssignment({ drawId, structureId: mainStructure.structureId, drawPosition, replaceWithBye: true }),
  );

  const mainMatchUp = (roundNumber, roundPosition) =>
    tournamentEngine
      .allDrawMatchUps({ drawId, inContext: true })
      .matchUps.find(
        (m) =>
          m.structureId === mainStructure.structureId &&
          m.roundNumber === roundNumber &&
          m.roundPosition === roundPosition,
      );
  const consolationMatchUps = () =>
    tournamentEngine
      .allDrawMatchUps({ drawId, inContext: true })
      .matchUps.filter((m) => m.structureId === consolationStructure.structureId);

  const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });
  // complete main R1P2 so its winner is present in main R2P1
  tournamentEngine.setMatchUpStatus({ matchUpId: mainMatchUp(1, 2).matchUpId, outcome, drawId });

  // WALKOVER in main R2P2 (two BYE winners) — side 1 loses and is valid for consolation
  const woMatchUp = mainMatchUp(2, 2);
  const woPlayerId = woMatchUp.sides.find((s) => s.sideNumber === 1).participantId;
  const woResult = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: WALKOVER, winningSide: 2, matchUpStatusCodes: ['W1'] },
    propagateExitStatus: true,
    matchUpId: woMatchUp.matchUpId,
    drawId,
  });
  expect(woResult.success).toEqual(true);

  // the exit cascades to a pending consolation WALKOVER: WO player present, opponent empty
  let pendingWo = consolationMatchUps().find(
    (m) => m.matchUpStatus === WALKOVER && m.sides?.some((s) => s.participantId === woPlayerId),
  );
  expect(pendingWo).toBeDefined();
  const woSide = pendingWo.sides.find((s) => s.participantId === woPlayerId).sideNumber;
  // the empty (no-exit) side is the winner while it awaits the fall-through participant
  expect(pendingWo.winningSide).toEqual(woSide === 1 ? 2 : 1);
  expect(pendingWo.matchUpStatusCodes[woSide - 1]).toEqual('W1');
  // only the exiting participant is present; the winning side is still an empty feed slot
  expect(pendingWo.sides.filter((s) => s.participantId).length).toEqual(1);

  // a later main completion (R2P1) drops a second-match loser through as a BYE
  const completeResult = tournamentEngine.setMatchUpStatus({ matchUpId: mainMatchUp(2, 1).matchUpId, outcome, drawId });
  expect(completeResult.success).toEqual(true);

  // AUTO-RESOLVE: the advancing opponent now occupies the winning slot and wins the walkover
  const resolvedWo = consolationMatchUps().find((m) => m.matchUpId === pendingWo.matchUpId);
  expect(resolvedWo.matchUpStatus).toEqual(WALKOVER);
  const resolvedWoSide = resolvedWo.sides.find((s) => s.participantId === woPlayerId).sideNumber;
  const winnerParticipantId = resolvedWo.sides.find((s) => s.sideNumber === resolvedWo.winningSide)?.participantId;
  // the exiting WO player did NOT win; the fall-through participant did
  expect(resolvedWo.winningSide).not.toEqual(resolvedWoSide);
  expect(winnerParticipantId).toBeDefined();
  expect(winnerParticipantId).not.toEqual(woPlayerId);
  // the exiting player keeps the position-aware code on their side
  expect(resolvedWo.matchUpStatusCodes[resolvedWoSide - 1]).toEqual('W1');

  // no leak: the next consolation round holds only the walkover winner, not the WO player
  const nextRound = consolationMatchUps().find(
    (m) =>
      m.roundNumber === resolvedWo.roundNumber + 1 && m.sides?.some((s) => s.participantId === winnerParticipantId),
  );
  expect(nextRound).toBeDefined();
  expect(nextRound.sides.some((s) => s.participantId === woPlayerId)).toEqual(false);
});

// module-level accessors shared by the two undo tests' setup
const structureMatchUps = (drawId, structureId) =>
  tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps.filter((m) => m.structureId === structureId);
const structureMatchUpAt = (drawId, structureId, roundNumber, roundPosition) =>
  structureMatchUps(drawId, structureId).find(
    (m) => m.roundNumber === roundNumber && m.roundPosition === roundPosition,
  );

// Shared setup for the UNDO regression tests below. Builds the drawSize-32 FMLC
// cascade exactly as the forward test above, through BOTH mutations, then returns
// the handles + captured roles needed to assert the reverse. Parameterized by exit
// type so the same reversal can be verified for WALKOVER and DEFAULTED.
function buildAutoResolveCascade({ exitStatus = WALKOVER, exitCode = 'W1' } = {}) {
  const drawId = 'undoDrawId';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 32, drawType: FIRST_MATCH_LOSER_CONSOLATION, idPrefix: 'm' }],
    setState: true,
  });
  const {
    drawDefinition: {
      structures: [mainStructure, consolationStructure],
    },
  } = tournamentEngine.getEvent({ drawId });
  [2, 6, 8, 10, 23, 31].forEach((drawPosition) =>
    removeAssignment({ drawId, structureId: mainStructure.structureId, drawPosition, replaceWithBye: true }),
  );

  const mainMatchUp = (roundNumber, roundPosition) =>
    structureMatchUpAt(drawId, mainStructure.structureId, roundNumber, roundPosition);
  const consolationMatchUps = () => structureMatchUps(drawId, consolationStructure.structureId);
  const consolationMatchUp = (matchUpId) => consolationMatchUps().find((m) => m.matchUpId === matchUpId);

  const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });
  tournamentEngine.setMatchUpStatus({ matchUpId: mainMatchUp(1, 2).matchUpId, outcome, drawId });

  // WALKOVER in main R2P2 propagates the loser (pWo) into the consolation as a pending exit
  const woMatchUp = mainMatchUp(2, 2);
  const woPlayerId = woMatchUp.sides.find((s) => s.sideNumber === 1).participantId;
  tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: exitStatus, winningSide: 2, matchUpStatusCodes: [exitCode] },
    propagateExitStatus: true,
    matchUpId: woMatchUp.matchUpId,
    drawId,
  });

  const pendingWo = consolationMatchUps().find(
    (m) => m.matchUpStatus === exitStatus && m.sides?.some((s) => s.participantId === woPlayerId),
  );
  const exitMatchUpId = pendingWo.matchUpId;

  // later main R2P1 completion drops a BYE into consolation which auto-resolves the pending WO
  tournamentEngine.setMatchUpStatus({ matchUpId: mainMatchUp(2, 1).matchUpId, outcome, drawId });

  const resolvedWo = consolationMatchUp(exitMatchUpId);
  const advPlayerId = resolvedWo.sides.find((s) => s.sideNumber === resolvedWo.winningSide)?.participantId;

  return { drawId, mainMatchUp, consolationMatchUps, consolationMatchUp, exitMatchUpId, woPlayerId, advPlayerId };
}

const resetToTBP = (drawId, matchUpId) =>
  tournamentEngine.setMatchUpStatus({
    matchUpStatus: TO_BE_PLAYED,
    winningSide: undefined,
    score: { sets: [] },
    matchUpId,
    drawId,
  });

// asserts the consolation exit + its downstream are untouched by a refused reset
function expectResolvedExitUnchanged(consolationMatchUp, consolationMatchUps, exitMatchUpId, advPlayerId, exitStatus) {
  const exit = consolationMatchUp(exitMatchUpId);
  expect(exit.matchUpStatus).toEqual(exitStatus);
  expect(exit.sides.find((s) => s.sideNumber === exit.winningSide)?.participantId).toEqual(advPlayerId);
  // pAdv is still advanced beyond the exit round (the resolved walkover it won still stands)
  const beyond = consolationMatchUps().filter(
    (m) => m.roundNumber > exit.roundNumber && m.sides?.some((s) => s.participantId === advPlayerId),
  );
  expect(beyond.length).toBeGreaterThan(0);
}

// Once a propagated exit has RESOLVED downstream in the consolation — a real participant
// fell through into the empty winner slot and advanced — that downstream is active. The
// factory's standard rule applies: the source result cannot be reset until the downstream
// consolation matchUps are undone first. isActiveDownstream must see PAST the fed FMLC BYE
// the exit advanced through (its short-circuit previously masked the resolved walkover).

test('FMLC: resetting the fall-through source is BLOCKED while the consolation exit is resolved downstream', () => {
  setSubscriptions({});
  const { drawId, mainMatchUp, consolationMatchUps, consolationMatchUp, exitMatchUpId, advPlayerId } =
    buildAutoResolveCascade();

  // sanity: before the reset, the exit is a RESOLVED walkover the fall-through (pAdv) won
  const before = consolationMatchUp(exitMatchUpId);
  expect(before.matchUpStatus).toEqual(WALKOVER);
  expect(before.sides.find((s) => s.sideNumber === before.winningSide)?.participantId).toEqual(advPlayerId);

  // reset the completed main R2P1 (the fall-through source) → refused (active downstream)
  const result = resetToTBP(drawId, mainMatchUp(2, 1).matchUpId);
  expect(result.success).not.toEqual(true);
  expect(result.error).toBeDefined();

  expectResolvedExitUnchanged(consolationMatchUp, consolationMatchUps, exitMatchUpId, advPlayerId, WALKOVER);
});

test('FMLC: resetting the propagated WALKOVER is BLOCKED while its consolation exit is resolved downstream', () => {
  setSubscriptions({});
  const { drawId, mainMatchUp, consolationMatchUps, consolationMatchUp, exitMatchUpId, woPlayerId, advPlayerId } =
    buildAutoResolveCascade();

  // reset the main WALKOVER (the exit source) → refused
  const result = resetToTBP(drawId, mainMatchUp(2, 2).matchUpId);
  expect(result.success).not.toEqual(true);
  expect(result.error).toBeDefined();

  // the propagated exit + its exiting participant are untouched
  expect(consolationMatchUps().some((m) => m.sides?.some((s) => s.participantId === woPlayerId))).toEqual(true);
  expectResolvedExitUnchanged(consolationMatchUp, consolationMatchUps, exitMatchUpId, advPlayerId, WALKOVER);
});

test('FMLC — DEFAULT: the active-downstream block generalizes across exit types', () => {
  setSubscriptions({});
  const { drawId, mainMatchUp, consolationMatchUps, consolationMatchUp, exitMatchUpId, advPlayerId } =
    buildAutoResolveCascade({ exitStatus: DEFAULTED, exitCode: 'D1' });

  // the cascade produced a DEFAULTED consolation exit (not WALKOVER)
  expect(consolationMatchUp(exitMatchUpId).matchUpStatus).toEqual(DEFAULTED);

  const result = resetToTBP(drawId, mainMatchUp(2, 2).matchUpId);
  expect(result.success).not.toEqual(true);
  expect(result.error).toBeDefined();

  expectResolvedExitUnchanged(consolationMatchUp, consolationMatchUps, exitMatchUpId, advPlayerId, DEFAULTED);
});
