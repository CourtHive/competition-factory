import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { BYE, DOUBLE_WALKOVER, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';

/**
 * CLEARING A SECOND-ROUND DOUBLE EXIT IN AN FMLC WITHDRAWS THE BYE IT PROPAGATED — all the way.
 *
 * CA, 2026-09-30, in TMX on this exact draw: *"in A I removed the DOUBLE_WALKOVER in MAIN|2|1 and the
 * consolation structure did not change.. the BYE propagated to dp1 / CONSOLATION|2|1 should have been
 * withdrawn as well as its advance to the consolation final and Marshall Yeats should have been left
 * as the sole participant in a TO_BE_PLAYED matchUp."*
 *
 * ## The defect it was written against
 *
 * `removeDoubleExit` carried an FMLC-only test — "was this BYE propagated by two double exits?" — that
 * paired the source's roundPosition with the ROUND-1 matchUps of its structure. For a ROUND-2 source it
 * collected nothing, `[].every(...)` is `true`, and it returned SUCCESS having withdrawn nothing. The
 * `byeClaims` ledger answers that question by record and had superseded the test; the test is gone.
 *
 * ## Why every part is asserted separately
 *
 * The BYE lives in three places — the positionAssignment, the consolation matchUp it sits in, and the
 * final it advanced into — and each is written by a different step of the unwind. Any one can be left
 * behind alone, and a test on the final alone would pass with the assignment still marked.
 */

const played = {
  score: {
    sets: [
      { side1Score: 6, side2Score: 3, winningSide: 1 },
      { side1Score: 6, side2Score: 3, winningSide: 1 },
    ],
  },
  winningSide: 1,
};
const all = (drawId: string): any[] => tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps ?? [];
const participants = (matchUp: any) => (matchUp.sides ?? []).filter((side: any) => side.participantId).length;

it('withdraws the propagated BYE, its advancement into the final, and the assignment marker', () => {
  setSubscriptions({});
  const drawId = 'clear-r2-double-exit';
  mocksEngine.generateTournamentRecord({
    policyDefinitions: { [POLICY_TYPE_PROGRESSION]: { propagateExitStatus: false } },
    drawProfiles: [{ drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 8, participantsCount: 5, drawId }],
    nonRandom: 7000118,
    setState: true,
  });

  // the consolation final holds ONE seat from generation: a fed seat advanced over its opponent's BYE
  const consolationFinal = () => all(drawId).find((m) => m.structureName === 'Consolation' && m.roundNumber === 3);
  const [fedSeat] = (consolationFinal().drawPositions ?? []).filter(Boolean);
  expect(fedSeat).toBeDefined();
  const holderId = all(drawId).find(
    (m) => m.structureName === 'Consolation' && m.roundNumber === 2 && m.drawPositions?.includes(fedSeat),
  ).matchUpId;
  const holder = () => all(drawId).find((m) => m.matchUpId === holderId);
  // the ROUND-2 Main matchUp whose loser is fed onto that seat — the source the removed test could not pair
  const source = all(drawId).find((m) => m.loserMatchUpId === holderId);
  expect(source.roundNumber).toEqual(2);

  // play everything else that is playable, so the other consolation finalist arrives
  const downstream = new Set([source.matchUpId, source.winnerMatchUpId, source.loserMatchUpId]);
  for (let guard = 0; guard < 20; guard++) {
    const target = all(drawId).find(
      (m) => !downstream.has(m.matchUpId) && m.matchUpStatus === TO_BE_PLAYED && participants(m) === 2,
    );
    if (!target) break;
    expect(tournamentEngine.setMatchUpStatus({ matchUpId: target.matchUpId, drawId, outcome: played }).success).toEqual(
      true,
    );
  }

  let result: any = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    matchUpId: source.matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  // CONTROL: the arrangement under test — the BYE reached the fed seat and rode into the final
  const assignment = () =>
    tournamentEngine
      .getEvent({ drawId })
      .drawDefinition.structures.find((s: any) => s.structureName === 'Consolation')
      .positionAssignments.find((a: any) => a.drawPosition === fedSeat);
  expect(assignment()).toEqual({ drawPosition: fedSeat, bye: true, byeFromPropagation: true });
  expect(holder().matchUpStatus).toEqual(BYE);
  expect(consolationFinal().matchUpStatus).toEqual(BYE);
  expect(participants(consolationFinal())).toEqual(1);

  // the clear, as TMX sends it
  result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: TO_BE_PLAYED, score: { sets: [] }, winningSide: undefined },
    allowChangePropagation: true,
    matchUpId: source.matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  // 1. the assignment no longer carries the BYE or its marker
  expect(assignment()).toEqual({ drawPosition: fedSeat });
  // 2. the consolation matchUp the BYE sat in reads its own draw BYE again, on the OTHER seat only
  expect(holder().matchUpStatus).toEqual(BYE);
  expect(holder().sides.find((side: any) => side.drawPosition === fedSeat)?.bye).toBeFalsy();
  // 3. the final is back to waiting, with the other finalist alone and the fed seat's advancement kept
  const final = consolationFinal();
  expect(final.matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(participants(final)).toEqual(1);
  expect(final.drawPositions).toContain(fedSeat);
  expect(final.sides.find((side: any) => side.drawPosition === fedSeat)?.bye).toBeFalsy();
});
