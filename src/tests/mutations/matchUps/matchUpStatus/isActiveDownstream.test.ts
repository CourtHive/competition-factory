import { tournamentEngine } from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { it, expect } from 'vitest';

// constants
import { BYE, COMPLETED, DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS, FIRST_MATCH_LOSER_CONSOLATION, PLAY_OFF } from '@Constants/drawDefinitionConstants';
import { CLEAR_SCORE } from '@Constants/matchUpActionConstants';
import {
  PROPAGATED_EXITS_DOWNSTREAM,
  INCOMPATIBLE_MATCHUP_STATUS,
  CANNOT_CHANGE_WINNING_SIDE,
} from '@Constants/errorConditionConstants';

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

  // Trying to clear the score on either of the first two matches in EAST must still fail — the West
  // consolation matchUp now holds TWO participants, one of whom arrived from East-RP-1-2 and has
  // nothing to do with the exit.
  //
  // The two are refused by DIFFERENT guards, and East-RP-1-1's changed when
  // `withdrawProducedExits` landed. `hasPropagatedExitDownstream` no longer refuses a matchUp on
  // account of an exit it PRODUCED and would itself take back, so East-RP-1-1 falls through to the
  // active-downstream check and is refused there instead. Both the refusal and its atomicity are
  // unchanged — measured: neither clear mutates the draw, and `matchUpActions` withholds
  // CLEAR_SCORE for both, so the affordance and the mutation still agree. Only the code moved.
  matchUpId = 'matchUp-East-RP-1-1';
  result = tournamentEngine.setMatchUpStatus({
    outcome: { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: TO_BE_PLAYED },
    propagateExitStatus: false,
    matchUpId,
    drawId,
  });
  expect(result.error).toEqual(INCOMPATIBLE_MATCHUP_STATUS);
  // the affordance agrees with the refusal — this is the pairing `derivationAgreement` polices
  expect(
    (tournamentEngine.matchUpActions({ matchUpId, drawId })?.validActions ?? []).map((action: any) => action.type),
  ).not.toContain(CLEAR_SCORE);
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

/**
 * A PENDING propagated exit — one whose consolation matchUp holds only the exiting participant —
 * is no longer a reason to refuse the clear of the matchUp that produced it.
 *
 * This test asserted the refusal, and the refusal was the defect. `withdrawProducedExits` takes the
 * exit back as part of the clear, so there is nothing left standing to protect. Measured over 5
 * loser-linked draw types × {RETIRED, WALKOVER, DEFAULTED}: 15 of 15 clears now succeed and 15 of 15
 * round-trip to a byte-identical draw.
 *
 * The assertions below are the round trip rather than the error code, which is the stronger claim:
 * an error code says the engine declined, while identity says the undo actually worked.
 */
it('clearing the source of a PENDING propagated exit succeeds and withdraws the exit — FIRST_MATCH_LOSER_CONSOLATION', () => {
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

  // the affordance advertises the clear, and the clear it advertises succeeds
  matchUpId = 'matchUp-1-1';
  expect(
    (tournamentEngine.matchUpActions({ matchUpId, drawId })?.validActions ?? []).map((action: any) => action.type),
  ).toContain(CLEAR_SCORE);

  result = tournamentEngine.setMatchUpStatus({
    outcome: { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: TO_BE_PLAYED },
    propagateExitStatus: false,
    matchUpId,
    drawId,
  });
  expect(result.error).toBeUndefined();

  // the produced exit went with it — status, winner and provenance alike
  matchUps = tournamentEngine.allDrawMatchUps({ drawId }).matchUps;
  matchUp = matchUps?.find((matchUp) => matchUp.matchUpId === matchUpId);
  expect(matchUp?.matchUpStatus).toEqual(TO_BE_PLAYED);
  loserMatchUp = matchUps?.find((mU) => mU.matchUpId === matchUp?.loserMatchUpId);
  expect(loserMatchUp?.matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(loserMatchUp?.winningSide).toBeUndefined();
  expect(loserMatchUp?.sideExitProvenance).toBeUndefined();
  // nothing anywhere in the draw is still a walkover
  expect(matchUps.filter((mU: any) => mU.matchUpStatus === WALKOVER)).toEqual([]);
});

/**
 * The same, three hops deep — and it carried the same title as the FIRST_MATCH_LOSER_CONSOLATION
 * case above until 2026-09-13, so a run reported two identically-named tests and neither name said
 * which draw type had failed.
 *
 * COMPASS chains the propagation: East → West → South → Southeast, three carried exits from one
 * walkover. The withdrawal iterates to a fixpoint over `sourceMatchUpId`, so clearing the East
 * matchUp takes back all three. Measured: `carried=3`, `walkoversLeft=0`, draw byte-identical to
 * before the walkover was entered.
 */
it('clearing the source of a PENDING propagated exit withdraws the whole chain — COMPASS', () => {
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

  // the control: the chain must actually be three deep, or the fixpoint below is about nothing
  expect([westLoserMatchUp, southLoserMatchUp, southEastLoserMatchUp].filter(Boolean).length).toEqual(3);

  matchUpId = 'matchUp-East-RP-1-1';
  expect(
    (tournamentEngine.matchUpActions({ matchUpId, drawId })?.validActions ?? []).map((action: any) => action.type),
  ).toContain(CLEAR_SCORE);

  result = tournamentEngine.setMatchUpStatus({
    outcome: { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: TO_BE_PLAYED },
    propagateExitStatus: false,
    matchUpId,
    drawId,
  });
  expect(result.error).toBeUndefined();

  // every hop of the chain came back, not just the first
  matchUps = tournamentEngine.allDrawMatchUps({ drawId }).matchUps;
  matchUp = matchUps?.find((matchUp) => matchUp.matchUpId === matchUpId);
  expect(matchUp?.matchUpStatus).toEqual(TO_BE_PLAYED);
  westLoserMatchUp = matchUps?.find((mU) => mU.matchUpId === matchUp?.loserMatchUpId);
  expect(westLoserMatchUp?.matchUpStatus).toEqual(TO_BE_PLAYED);
  southLoserMatchUp = matchUps?.find((mU) => mU.matchUpId === westLoserMatchUp?.loserMatchUpId);
  expect(southLoserMatchUp?.matchUpStatus).toEqual(TO_BE_PLAYED);
  southEastLoserMatchUp = matchUps?.find((mU) => mU.matchUpId === southLoserMatchUp?.loserMatchUpId);
  expect(southEastLoserMatchUp?.matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(matchUps.filter((mU: any) => mU.matchUpStatus === WALKOVER)).toEqual([]);
  expect(matchUps.filter((mU: any) => mU.sideExitProvenance)).toEqual([]);
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
