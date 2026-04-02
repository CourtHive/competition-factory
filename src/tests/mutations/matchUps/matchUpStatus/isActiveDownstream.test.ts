import { tournamentEngine } from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { it, expect } from 'vitest';

// Constants
import { CANNOT_CHANGE_WINNING_SIDE, PROPAGATED_EXITS_DOWNSTREAM } from '@Constants/errorConditionConstants';
import { BYE, COMPLETED, DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS, FIRST_MATCH_LOSER_CONSOLATION, PLAY_OFF } from '@Constants/drawDefinitionConstants';

it('will not allow winningSide change when active downstream', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawType: COMPASS,
        drawId: 'did',
        idPrefix: 'm',
        drawSize: 8,
        outcomes: [
          {
            scoreString: '6-1 6-2',
            roundPosition: 1,
            roundNumber: 1,
            winningSide: 1,
          },
          {
            scoreString: '6-1 6-2',
            roundPosition: 2,
            roundNumber: 1,
            winningSide: 1,
          },
          {
            matchUpStatus: WALKOVER,
            stage: PLAY_OFF,
            stageSequence: 2,
            roundPosition: 1,
            roundNumber: 1,
            winningSide: 2,
          },
        ],
      },
    ],
    setState: true,
  });

  let { completedMatchUps, pendingMatchUps } = tournamentEngine.tournamentMatchUps();
  const confirmation = completedMatchUps.map((m) => ({
    structureName: m.structureName,
    matchUpStatus: m.matchUpStatus,
    roundPosition: m.roundPosition,
    roundNumber: m.roundNumber,
    matchUpId: m.matchUpId,
  }));
  expect(confirmation).toEqual([
    { structureName: 'East', matchUpStatus: 'COMPLETED', roundPosition: 1, roundNumber: 1, matchUpId: 'm-East-RP-1-1' },
    { structureName: 'East', matchUpStatus: 'COMPLETED', roundPosition: 2, roundNumber: 1, matchUpId: 'm-East-RP-1-2' },
    { structureName: 'West', matchUpStatus: 'WALKOVER', roundPosition: 1, roundNumber: 1, matchUpId: 'm-West-RP-1-1' },
  ]);

  let targetMatchUp = completedMatchUps.find((m) => m.matchUpId === 'm-East-RP-1-1');
  expect(targetMatchUp.winningSide).toEqual(1);

  const initialPropagatedLoserId = completedMatchUps.find((m) => m.matchUpId === 'm-West-RP-1-1').sides[0].participant
    .participantId;

  let southFinal = pendingMatchUps.find((m) => m.matchUpId === 'm-South-RP-1-1');
  const initialWoPropagatedParticipant = southFinal.sides[0].participant;
  expect(initialWoPropagatedParticipant.participantId).toEqual(initialPropagatedLoserId);

  let result = tournamentEngine.setMatchUpStatus({
    matchUpId: 'm-East-RP-1-1',
    outcome: { winningSide: 2 },
    drawId: 'did',
  });
  expect(result.error).toEqual(CANNOT_CHANGE_WINNING_SIDE);

  result = tournamentEngine.setMatchUpStatus({
    allowChangePropagation: true,
    matchUpId: 'm-East-RP-1-1',
    outcome: { winningSide: 2 },
    drawId: 'did',
  });
  expect(result.success).toEqual(true);

  ({ completedMatchUps, pendingMatchUps } = tournamentEngine.tournamentMatchUps());
  targetMatchUp = completedMatchUps.find((m) => m.matchUpId === 'm-East-RP-1-1');
  expect(targetMatchUp.winningSide).toEqual(2);

  const propagatedLoserId = completedMatchUps.find((m) => m.matchUpId === 'm-West-RP-1-1').sides[0].participant
    .participantId;
  expect(propagatedLoserId).not.toEqual(initialPropagatedLoserId);

  southFinal = pendingMatchUps.find((m) => m.matchUpId === 'm-South-RP-1-1');
  const walkoverPropagatedParticipant = southFinal.sides[0].participant;

  expect(initialWoPropagatedParticipant.participantId).not.toEqual(walkoverPropagatedParticipant.participantId);
});

it('Does mark a downstream as active if we are trying to reset the score for one of the source matches of a propagated exit status consolation match with both players set', () => {
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

  //let's set the first match in EAST as a WALKOVER
  //and we propgate the exit status
  let matchUpId = 'matchUp-East-RP-1-1';
  let result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: WALKOVER, winningSide: 2 },
    propagateExitStatus: true,
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);
  //let's set the second match in EAST as a normal score
  matchUpId = 'matchUp-East-RP-1-2';
  result = tournamentEngine.setMatchUpStatus({
    outcome: { winningSide: 2, scoreStringSide1: '11-3', scoreStringSide2: '3-11' },
    propagateExitStatus: false,
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  //the first Match in WEST should be a WALKOVER with a winner

  let matchUps = tournamentEngine.allDrawMatchUps({ drawId }).matchUps;
  let matchUp = matchUps?.find((matchUp) => matchUp.matchUpId === matchUpId);
  expect(matchUp?.matchUpStatus).toEqual(COMPLETED);
  let westLoserMatchUp = matchUps?.find((mU) => mU.matchUpId === matchUp?.loserMatchUpId);
  expect(westLoserMatchUp?.matchUpStatus).toEqual(WALKOVER);
  let southLoserMatchUp = matchUps?.find((mU) => mU.matchUpId === westLoserMatchUp?.loserMatchUpId);
  expect(southLoserMatchUp?.matchUpStatus).toEqual(WALKOVER);
  let southEastLoserMatchUp = matchUps?.find((mU) => mU.matchUpId === southLoserMatchUp?.loserMatchUpId);
  expect(southEastLoserMatchUp?.matchUpStatus).toEqual(WALKOVER);

  //trying to clear the score on any of the first two matches in EAST should fail
  //because they will have an active downstream
  matchUpId = 'matchUp-East-RP-1-1';
  result = tournamentEngine.setMatchUpStatus({
    outcome: { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: TO_BE_PLAYED },
    propagateExitStatus: false,
    matchUpId,
    drawId,
  });
  expect(result.error).toEqual(PROPAGATED_EXITS_DOWNSTREAM);
  matchUpId = 'matchUp-East-RP-1-2';
  result = tournamentEngine.setMatchUpStatus({
    outcome: { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: TO_BE_PLAYED },
    propagateExitStatus: false,
    matchUpId,
    drawId,
  });
  expect(result.error).toEqual(PROPAGATED_EXITS_DOWNSTREAM);

  //and make sure that the existing matches have not been changed
  matchUps = tournamentEngine.allDrawMatchUps({ drawId }).matchUps;
  matchUp = matchUps?.find((matchUp) => matchUp.matchUpId === matchUpId);
  expect(matchUp?.matchUpStatus).toEqual(COMPLETED);
  westLoserMatchUp = matchUps?.find((mU) => mU.matchUpId === matchUp?.loserMatchUpId);
  expect(westLoserMatchUp?.matchUpStatus).toEqual(WALKOVER);
  southLoserMatchUp = matchUps?.find((mU) => mU.matchUpId === westLoserMatchUp?.loserMatchUpId);
  expect(southLoserMatchUp?.matchUpStatus).toEqual(WALKOVER);
  southEastLoserMatchUp = matchUps?.find((mU) => mU.matchUpId === southLoserMatchUp?.loserMatchUpId);
  expect(southEastLoserMatchUp?.matchUpStatus).toEqual(WALKOVER);
});

it('Does mark downstream as active if we are trying to reset the score for one of the source matches of a propagated exit status consolation match with only one player', () => {
  const idPrefix = 'matchUp';
  const drawId = 'drawId';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [
      // uuids are popped and therefore assigned in reverse order
      // in this instance the uuids are assigned to structureIds in the order they are generated
      { drawId, drawSize: 32, drawType: FIRST_MATCH_LOSER_CONSOLATION, idPrefix },
    ],
    setState: true,
  });

  //let's set the first match in MAIN as a WALKOVER
  //and we propgate the exit status
  let matchUpId = 'matchUp-1-1';
  let result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: WALKOVER, winningSide: 2 },
    propagateExitStatus: true,
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  //the first Match in CONSOLATION should be a WALKOVER with a winner
  let matchUps = tournamentEngine.allDrawMatchUps({ drawId }).matchUps;
  let matchUp = matchUps?.find((matchUp) => matchUp.matchUpId === matchUpId);
  expect(matchUp?.matchUpStatus).toEqual(WALKOVER);
  let loserMatchUp = matchUps?.find((mU) => mU.matchUpId === matchUp?.loserMatchUpId);
  expect(loserMatchUp?.matchUpStatus).toEqual(WALKOVER);

  //trying to clear the score on any of the first two matches in MAIN should fail
  //because they will have an active downstream
  matchUpId = 'matchUp-1-1';
  result = tournamentEngine.setMatchUpStatus({
    outcome: { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: TO_BE_PLAYED },
    propagateExitStatus: false,
    matchUpId,
    drawId,
  });
  expect(result.error).toEqual(PROPAGATED_EXITS_DOWNSTREAM);

  //and make sure that the existing matches have not been changed
  matchUps = tournamentEngine.allDrawMatchUps({ drawId }).matchUps;
  matchUp = matchUps?.find((matchUp) => matchUp.matchUpId === matchUpId);
  expect(matchUp?.matchUpStatus).toEqual(WALKOVER);
  loserMatchUp = matchUps?.find((mU) => mU.matchUpId === matchUp?.loserMatchUpId);
  expect(loserMatchUp?.matchUpStatus).toEqual(WALKOVER);
});

it('Does mark downstream as active if we are trying to reset the score for one of the source matches of a propagated exit status consolation match with only one player', () => {
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

  //let's set the first match in EAST as a WALKOVER
  //and we propgate the exit status
  let matchUpId = 'matchUp-East-RP-1-1';
  let result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: WALKOVER, winningSide: 2 },
    propagateExitStatus: true,
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  //the first Match in WEST should be a WALKOVER with a winner

  let matchUps = tournamentEngine.allDrawMatchUps({ drawId }).matchUps;
  let matchUp = matchUps?.find((matchUp) => matchUp.matchUpId === matchUpId);
  expect(matchUp?.matchUpStatus).toEqual(WALKOVER);
  let westLoserMatchUp = matchUps?.find((mU) => mU.matchUpId === matchUp?.loserMatchUpId);
  expect(westLoserMatchUp?.matchUpStatus).toEqual(WALKOVER);
  let southLoserMatchUp = matchUps?.find((mU) => mU.matchUpId === westLoserMatchUp?.loserMatchUpId);
  expect(southLoserMatchUp?.matchUpStatus).toEqual(WALKOVER);
  let southEastLoserMatchUp = matchUps?.find((mU) => mU.matchUpId === southLoserMatchUp?.loserMatchUpId);
  expect(southEastLoserMatchUp?.matchUpStatus).toEqual(WALKOVER);

  //trying to clear the score on any of the first two matches in EAST should fail
  //because they will have an active downstream
  matchUpId = 'matchUp-East-RP-1-1';
  result = tournamentEngine.setMatchUpStatus({
    outcome: { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: TO_BE_PLAYED },
    propagateExitStatus: false,
    matchUpId,
    drawId,
  });
  expect(result.error).toEqual(PROPAGATED_EXITS_DOWNSTREAM);

  //and make sure that the existing matches have not been changed
  matchUps = tournamentEngine.allDrawMatchUps({ drawId }).matchUps;
  matchUp = matchUps?.find((matchUp) => matchUp.matchUpId === matchUpId);
  expect(matchUp?.matchUpStatus).toEqual(WALKOVER);
  westLoserMatchUp = matchUps?.find((mU) => mU.matchUpId === matchUp?.loserMatchUpId);
  expect(westLoserMatchUp?.matchUpStatus).toEqual(WALKOVER);
  southLoserMatchUp = matchUps?.find((mU) => mU.matchUpId === westLoserMatchUp?.loserMatchUpId);
  expect(southLoserMatchUp?.matchUpStatus).toEqual(WALKOVER);
  southEastLoserMatchUp = matchUps?.find((mU) => mU.matchUpId === southLoserMatchUp?.loserMatchUpId);
  expect(southEastLoserMatchUp?.matchUpStatus).toEqual(WALKOVER);
});

it('Does NOT mark downstream as active if the consolation match has the result of a double walkover and allows to clear score in source match', () => {
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

  //let's set the first match in EAST as a WALKOVER
  //and we propgate the exit status
  let matchUpId = 'matchUp-East-RP-1-1';
  let result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    propagateExitStatus: false,
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  //the first Match in WEST should be WALKOVER with a winner
  //but no participants
  let matchUps = tournamentEngine.allDrawMatchUps({ drawId }).matchUps;
  let matchUp = matchUps?.find((matchUp) => matchUp.matchUpId === matchUpId);
  expect(matchUp?.matchUpStatus).toEqual(DOUBLE_WALKOVER);
  let westLoserMatchUp = matchUps?.find((mU) => mU.matchUpId === matchUp?.loserMatchUpId);
  expect(westLoserMatchUp?.matchUpStatus).toEqual(WALKOVER);
  let southLoserMatchUp = matchUps?.find((mU) => mU.matchUpId === westLoserMatchUp?.loserMatchUpId);
  expect(southLoserMatchUp?.matchUpStatus).toEqual(BYE);
  let southEastLoserMatchUp = matchUps?.find((mU) => mU.matchUpId === southLoserMatchUp?.loserMatchUpId);
  expect(southEastLoserMatchUp?.matchUpStatus).toEqual(BYE);

  //trying to clear the score on any of the first two matches in EAST should work
  //because they will have no active downstream
  matchUpId = 'matchUp-East-RP-1-1';
  result = tournamentEngine.setMatchUpStatus({
    outcome: { scoreStringSide1: '', scoreStringSide2: '', matchUpStatus: TO_BE_PLAYED },
    propagateExitStatus: false,
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  matchUps = tournamentEngine.allDrawMatchUps({ drawId }).matchUps;
  matchUp = matchUps?.find((matchUp) => matchUp.matchUpId === matchUpId);
  expect(matchUp?.matchUpStatus).toEqual(TO_BE_PLAYED);
  westLoserMatchUp = matchUps?.find((mU) => mU.matchUpId === matchUp?.loserMatchUpId);
  expect(westLoserMatchUp?.matchUpStatus).toEqual(TO_BE_PLAYED);
  southLoserMatchUp = matchUps?.find((mU) => mU.matchUpId === westLoserMatchUp?.loserMatchUpId);
  expect(southLoserMatchUp?.matchUpStatus).toEqual(TO_BE_PLAYED);
  southEastLoserMatchUp = matchUps?.find((mU) => mU.matchUpId === southLoserMatchUp?.loserMatchUpId);
  expect(southEastLoserMatchUp?.matchUpStatus).toEqual(TO_BE_PLAYED);
});
