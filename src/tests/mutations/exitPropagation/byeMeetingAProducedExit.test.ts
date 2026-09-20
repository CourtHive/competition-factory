import { getDrawMatchUps, clearOutcome } from '@Tests/testHarness/exitPropagation/transitions';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { DOUBLE_WALKOVER, TO_BE_PLAYED, COMPLETED, WALKOVER, BYE } from '@Constants/matchUpStatusConstants';

/**
 * A BYE MEETING A PRODUCED EXIT.
 *
 * CA's rule, 2026-09-20, arrived at by driving both of these in TMX:
 *
 *   *"An advancing participant encountering a BYE should always be advanced; a propagated exit
 *   encountering a BYE should be advanced. In both cases the BYE remains a BYE"* — and, to be
 *   explicit, *"the BYE remains a BYE means the `matchUpStatus: BYE` does not change."*
 *
 * Three things therefore hold at once, and they are independent:
 *
 *   1. the matchUp's `matchUpStatus` stays `BYE` — the produced exit never overwrites it;
 *   2. the arriving exit is recorded on ITS OWN side in `matchUpStatusCodes`;
 *   3. the exit is carried onward, exactly as a participant would be.
 *
 * Both scenarios below are hand-drivable in TMX with ordinary scores — no policy, no
 * `propagateExitStatus`, no `allowChangePropagation` — which is what the client sends.
 */

const at = (drawId: string, stage: string, roundNumber: number, roundPosition: number): any =>
  getDrawMatchUps(drawId).find(
    (m: any) => m.stage === stage && m.roundNumber === roundNumber && m.roundPosition === roundPosition,
  );

const codeFor = (matchUp: any, sideNumber: number) =>
  (matchUp?.matchUpStatusCodes ?? []).find((code: any) => code?.sideNumber === sideNumber);

test('a converged double exit reaches the BYE, and the BYE stays a BYE', () => {
  setSubscriptions({});
  const drawId = 'bye-meets-exit-fmlc';
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 8, drawId }],
    nonRandom: 1,
  });
  tournamentEngine.setState(tournamentRecord);
  // CONTROL: the draw must exist, or every assertion below is about nothing
  expect(getDrawMatchUps(drawId).length).toBeGreaterThan(0);

  for (const roundPosition of [1, 2]) {
    const target = at(drawId, 'MAIN', 1, roundPosition);
    expect(target, `MAIN|1|${roundPosition}`).toBeTruthy();
    const result: any = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_WALKOVER },
      matchUpId: target.matchUpId,
      drawId,
    });
    expect(result.error, `MAIN|1|${roundPosition}`).toBeUndefined();
  }

  // the two exits converge: nobody wins it, and BOTH origins are recorded
  const convergence = at(drawId, 'CONSOLATION', 1, 1);
  expect(convergence.matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(convergence.winningSide).toBeUndefined();
  expect(codeFor(convergence, 1)).toEqual({
    previousMatchUpStatus: DOUBLE_WALKOVER,
    matchUpStatus: WALKOVER,
    sideNumber: 1,
  });
  expect(codeFor(convergence, 2)).toEqual({
    previousMatchUpStatus: DOUBLE_WALKOVER,
    matchUpStatus: WALKOVER,
    sideNumber: 2,
  });

  // 1. the BYE is still a BYE — this is the assertion the rule is about
  const meetsTheBye = at(drawId, 'CONSOLATION', 2, 1);
  expect(meetsTheBye.matchUpStatus).toEqual(BYE);

  // 2. and it records the arriving exit on the side the exit arrived on. The fed position is
  //    sideNumber 1 (draw-positions.md rule 4), so the side advanced from CONSOLATION|1|1 is 2.
  expect(codeFor(meetsTheBye, 2)).toEqual({
    previousMatchUpStatus: DOUBLE_WALKOVER,
    matchUpStatus: WALKOVER,
    sideNumber: 2,
  });

  // the side that has NOT yet received the exit is still a reserved slot, not an origin
  expect(codeFor(meetsTheBye, 1)).toEqual({ sideNumber: 1 });

  // 3. and the exit is carried ONWARD through the BYE
  const onward = at(drawId, 'CONSOLATION', 3, 1);
  expect(onward.matchUpStatus).toEqual(WALKOVER);
  // the side carrying the exit does not win it; the side yet to arrive does
  expect(onward.winningSide).toEqual(2);

  // DELIBERATELY NOT PINNED: `onward.matchUpStatusCodes`. It is `[]` today — the BYE-advance site
  // writes `matchUpStatusCodes: []` unconditionally, which `knownFailures.ts` already names as
  // residue of the same family. That is an OPEN gap, not certified behaviour, and pinning the
  // current value would freeze the defect. Assert it when the origin is carried through.
});

test('a BYE that meets a produced exit keeps BOTH origins, and stays a BYE', () => {
  setSubscriptions({});
  const drawId = 'bye-meets-exit-se';
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ participantsCount: 7, idPrefix: 'match', seedsCount: 1, drawSize: 8, drawId }],
    nonRandom: 1,
  });
  tournamentEngine.setState(tournamentRecord);

  const { structureId } = tournamentEngine.getEvent({ drawId }).drawDefinition.structures[0];
  const { validActions } = tournamentEngine.positionActions({ drawPosition: 1, structureId, drawId });
  const assignBye: any = validActions.find((action: any) => action.type === BYE);
  // CONTROL: the BYE action must be offered, or the scenario never sets itself up
  expect(assignBye, 'no BYE action offered at drawPosition 1').toBeTruthy();
  expect(tournamentEngine[assignBye.method](assignBye.payload).success).toEqual(true);

  for (const matchUpId of ['match-1-3', 'match-1-4']) {
    const result: any = tournamentEngine.setMatchUpStatus({ outcome: { winningSide: 1 }, matchUpId, drawId });
    expect(result.success, matchUpId).toEqual(true);
  }

  const result: any = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    matchUpId: 'match-1-2',
    drawId,
  });
  expect(result.success).toEqual(true);

  const meetsTheBye = getDrawMatchUps(drawId).find((m: any) => m.matchUpId === 'match-2-1');
  // the BYE is untouched by the exit that arrived beside it
  expect(meetsTheBye.matchUpStatus).toEqual(BYE);
  // and BOTH origins are recorded: the BYE's own, and the exit's
  expect(codeFor(meetsTheBye, 1)).toEqual({ previousMatchUpStatus: BYE, matchUpStatus: BYE, sideNumber: 1 });
  expect(codeFor(meetsTheBye, 2)).toEqual({
    previousMatchUpStatus: DOUBLE_WALKOVER,
    matchUpStatus: WALKOVER,
    sideNumber: 2,
  });

  // 3. AND THE EXIT IS CARRIED ONWARD, which is the part of the rule this scenario left undone.
  //
  // CA, 2026-09-20, naming the expected record outright: *"the produced walkover should be
  // progressed by the BYE to R3P1 and R3P1 should be matchUpStatus: WALKOVER with winningSide: 2."*
  //
  // `match-2-1` holds exactly one drawPosition and it is the BYE, so there is no participant to
  // advance; the cascade used to stop here and leave `match-3-1` as `TO_BE_PLAYED` with no codes.
  const onward = getDrawMatchUps(drawId).find((m: any) => m.matchUpId === 'match-3-1');
  expect(onward.matchUpStatus).toEqual(WALKOVER);
  // the side the exit arrives on does not win it; the side yet to arrive does
  expect(onward.winningSide).toEqual(2);

  // and the ORIGIN survives the hop through the BYE — it is the double walkover that produced the
  // exit, not the BYE it travelled through. Asserted per side, because the two are independent.
  expect(codeFor(onward, 1)).toEqual({
    previousMatchUpStatus: DOUBLE_WALKOVER,
    matchUpStatus: WALKOVER,
    sideNumber: 1,
  });
  // the side still to be filled by the winner of match-2-2 is a reserved slot, not an origin
  expect(codeFor(onward, 2)).toEqual({ sideNumber: 2 });
  expect(onward.sideExitProvenance?.[1]).toEqual({
    previousMatchUpStatus: DOUBLE_WALKOVER,
    matchUpStatus: WALKOVER,
    sourceMatchUpId: 'match-1-2',
  });
});

/**
 * THE ROUND TRIP, AND WHAT HAPPENS WHEN THE MATCH IS ACTUALLY PLAYED.
 *
 * CA, 2026-09-20, after confirming the forward record in TMX:
 *
 *   *"that looks perfect. let's ensure this is pinned with a named test and include undo of the
 *   R1p2 DOUBLE_WALKOVER, then enter a winner and confirm the progression."*
 *
 * Carrying an exit onward is only half a correct cascade. The other half is that it can be taken
 * back: a director who records a double walkover and then corrects it must be left with a draw that
 * is indistinguishable from one where it never happened, and the slot the exit occupied must accept
 * a real winner afterwards. The three stages are asserted separately because they fail separately —
 * the forward write landing does not imply the unwind reaches `match-3-1`, and an unwind that
 * blanks the status can still leave `winningSide` or provenance behind.
 */
test('a BYE carries a produced exit onward, gives it back on undo, then carries the winner', () => {
  setSubscriptions({});
  const drawId = 'bye-meets-exit-round-trip';
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ participantsCount: 7, idPrefix: 'rt', seedsCount: 1, drawSize: 8, drawId }],
    nonRandom: 1,
  });
  tournamentEngine.setState(tournamentRecord);

  const matchUp = (matchUpId: string): any => getDrawMatchUps(drawId).find((m: any) => m.matchUpId === matchUpId);
  const sideOf = (m: any, sideNumber: number) => (m?.sides ?? []).find((side: any) => side.sideNumber === sideNumber);

  const { structureId } = tournamentEngine.getEvent({ drawId }).drawDefinition.structures[0];
  const { validActions } = tournamentEngine.positionActions({ drawPosition: 1, structureId, drawId });
  const assignBye: any = validActions.find((action: any) => action.type === BYE);
  // CONTROL: the BYE action must be offered, or the scenario never sets itself up
  expect(assignBye, 'no BYE action offered at drawPosition 1').toBeTruthy();
  expect(tournamentEngine[assignBye.method](assignBye.payload).success).toEqual(true);

  for (const matchUpId of ['rt-1-3', 'rt-1-4']) {
    const played: any = tournamentEngine.setMatchUpStatus({ outcome: { winningSide: 1 }, matchUpId, drawId });
    expect(played.success, matchUpId).toEqual(true);
  }

  // CONTROL: `rt-2-1` must already be the BYE-held matchUp, or the exit below meets nothing
  expect(matchUp('rt-2-1').matchUpStatus).toEqual(BYE);
  // and the participant who will win `rt-1-2` once it is re-scored
  const contenderId = sideOf(matchUp('rt-1-2'), 1)?.participantId;
  expect(contenderId).toBeTruthy();

  // ---- 1. FORWARD: the exit is produced, meets the BYE, and travels past it -------------------
  const applied: any = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    matchUpId: 'rt-1-2',
    drawId,
  });
  expect(applied.success).toEqual(true);

  expect(matchUp('rt-2-1').matchUpStatus).toEqual(BYE);
  expect(codeFor(matchUp('rt-2-1'), 2)).toEqual({
    previousMatchUpStatus: DOUBLE_WALKOVER,
    matchUpStatus: WALKOVER,
    sideNumber: 2,
  });
  expect(matchUp('rt-3-1').matchUpStatus).toEqual(WALKOVER);
  expect(matchUp('rt-3-1').winningSide).toEqual(2);
  expect(codeFor(matchUp('rt-3-1'), 1)).toEqual({
    previousMatchUpStatus: DOUBLE_WALKOVER,
    matchUpStatus: WALKOVER,
    sideNumber: 1,
  });

  // ---- 2. UNDO: clearing R1P2 takes the exit back out of BOTH matchUps ------------------------
  const cleared: any = tournamentEngine.setMatchUpStatus({ outcome: clearOutcome, matchUpId: 'rt-1-2', drawId });
  expect(cleared.error).toBeUndefined();
  expect(cleared.success).toEqual(true);

  expect(matchUp('rt-1-2').matchUpStatus).toEqual(TO_BE_PLAYED);

  // the BYE keeps its own origin and loses only the exit's — the two are independent facts and the
  // unwind must not take the wrong one
  expect(matchUp('rt-2-1').matchUpStatus).toEqual(BYE);
  expect(codeFor(matchUp('rt-2-1'), 1)).toEqual({
    previousMatchUpStatus: BYE,
    matchUpStatus: BYE,
    sideNumber: 1,
  });
  expect(codeFor(matchUp('rt-2-1'), 2)).toEqual({ sideNumber: 2 });
  expect(matchUp('rt-2-1').sideExitProvenance?.[2]).toBeUndefined();

  // and the matchUp the exit travelled ON to is returned whole. Asserted field by field rather than
  // through the status alone: a blanked status with a surviving `winningSide` or provenance is the
  // residue shape this family of defects keeps producing.
  expect(matchUp('rt-3-1').matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(matchUp('rt-3-1').winningSide).toBeUndefined();
  expect(matchUp('rt-3-1').matchUpStatusCodes ?? []).toEqual([]);
  expect(matchUp('rt-3-1').sideExitProvenance).toBeUndefined();

  // ---- 3. RE-SCORE: a real winner takes the path the exit vacated ----------------------------
  const { outcome }: any = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-2', winningSide: 1 });
  const rescored: any = tournamentEngine.setMatchUpStatus({ outcome, matchUpId: 'rt-1-2', drawId });
  expect(rescored.error).toBeUndefined();
  expect(rescored.success).toEqual(true);
  expect(matchUp('rt-1-2').matchUpStatus).toEqual(COMPLETED);
  expect(matchUp('rt-1-2').winningSide).toEqual(1);

  // the BYE is STILL a BYE — that does not change because somebody arrived beside it
  expect(matchUp('rt-2-1').matchUpStatus).toEqual(BYE);
  expect(sideOf(matchUp('rt-2-1'), 2)?.participantId).toEqual(contenderId);

  // and the winner is advanced THROUGH it, which is the first half of CA's rule: *"an advancing
  // participant encountering a BYE should always be advanced."* `rt-3-1` now holds them on the side
  // the exit occupied a moment ago, and holds nothing else — no walkover, no winningSide, no codes.
  expect(sideOf(matchUp('rt-3-1'), 1)?.participantId).toEqual(contenderId);
  expect(matchUp('rt-3-1').matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(matchUp('rt-3-1').winningSide).toBeUndefined();
  expect(matchUp('rt-3-1').matchUpStatusCodes ?? []).toEqual([]);
});
