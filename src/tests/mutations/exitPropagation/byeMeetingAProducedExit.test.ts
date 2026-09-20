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
    drawProfiles: [{ drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 8, idPrefix: 'fmlc', drawId }],
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

  // AND NOW THE CODES, which this test deliberately left unpinned while they were `[]`.
  //
  // The comment that stood here said: *"the BYE-advance site writes `matchUpStatusCodes: []`
  // unconditionally … pinning the current value would freeze the defect. Assert it when the origin
  // is carried through."* It is carried through as of 2026-09-20, so this is that assertion.
  expect(codeFor(onward, 1)).toEqual({
    previousMatchUpStatus: DOUBLE_WALKOVER,
    matchUpStatus: WALKOVER,
    sideNumber: 1,
  });
  expect(codeFor(onward, 2)).toEqual({ sideNumber: 2 });
  // the origin is the CONSOLATION convergence that produced this exit, not the Main matchUp two
  // steps back: `sourceMatchUpId` names the immediate producer at every hop.
  expect(onward.sideExitProvenance?.[1]).toEqual({
    previousMatchUpStatus: DOUBLE_WALKOVER,
    matchUpStatus: WALKOVER,
    sourceMatchUpId: 'fmlc-c-1-1',
  });
});

/**
 * A PRODUCED EXIT ADVANCED THROUGH A BYE IS NOT AN ORPHAN.
 *
 * The rule the test above asserts structurally, stated as the consequence that actually matters and
 * pinned against the engine's own detector rather than against a field.
 *
 * `advanceByeAdvancedDrawPosition` wrote `matchUpStatusCodes: []` unconditionally and stamped no
 * provenance, so a matchUp came out of the cascade as an exit WITH a winningSide and no record of
 * where it came from. `getStructureInconsistencies`' `EXIT_WITHOUT_LOSER` exempts a
 * propagation-produced exit through `isPropagatedExit`, which reads the PRESENCE of provenance — so
 * an unstamped produced exit is indistinguishable from the thing that rule exists to catch: *"a
 * walkover recorded against a drawPosition that lost its participant"*.
 *
 * Thirteen `exitPropagationMatrix` cells were reporting exactly this, across
 * FIRST_MATCH_LOSER_CONSOLATION 8/7, 16/15 and 16/13 and DOUBLE_ELIMINATION 16/13, every one the
 * same shape: `WALKOVER ws=2 dps=[4,null] codes=null prov=null`. `knownFailures.ts` had named the
 * site for weeks.
 *
 * ASSERTED THROUGH `getDrawInconsistencies`, deliberately. A test that only re-read the provenance
 * field would pass if the exemption were later keyed on something else; this one fails if the exit
 * ever becomes indistinguishable from an orphan again, whatever the mechanism.
 */
test('a produced exit advanced through a BYE carries its origin, so the draw holds no orphaned exit', () => {
  setSubscriptions({});
  const drawId = 'bye-exit-not-an-orphan';
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 8, idPrefix: 'orph', drawId }],
    nonRandom: 1,
  });
  tournamentEngine.setState(tournamentRecord);

  for (const roundPosition of [1, 2]) {
    const target = getDrawMatchUps(drawId).find(
      (m: any) => m.stage === 'MAIN' && m.roundNumber === 1 && m.roundPosition === roundPosition,
    );
    expect(target, `MAIN|1|${roundPosition}`).toBeTruthy();
    const result: any = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_WALKOVER },
      matchUpId: target.matchUpId,
      drawId,
    });
    expect(result.error).toBeUndefined();
  }

  // CONTROL: the shape the rule is about must actually be present, or this asserts nothing. A
  // single exit, a winningSide, and a losing side that holds a drawPosition but no participant.
  const produced = getDrawMatchUps(drawId).find(
    (m: any) => m.stage === 'CONSOLATION' && m.roundNumber === 3 && m.roundPosition === 1,
  );
  expect(produced?.matchUpStatus).toEqual(WALKOVER);
  expect(produced?.winningSide).toEqual(2);
  const losingSide = (produced?.sides ?? []).find((side: any) => side.sideNumber !== produced.winningSide);
  expect(losingSide?.drawPosition, 'the losing side must hold a drawPosition').toBeTruthy();
  expect(losingSide?.participantId, 'and no participant').toBeUndefined();
  expect(losingSide?.bye, 'and it must not be a BYE, which the rule excludes separately').toBeFalsy();

  // the origin is what keeps it out of the orphan bucket
  expect(produced?.sideExitProvenance?.[1]?.previousMatchUpStatus).toEqual(DOUBLE_WALKOVER);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const { inconsistencies }: any = tournamentEngine.getDrawInconsistencies({ drawDefinition, drawId });
  expect((inconsistencies ?? []).map((i: any) => i.issueType)).toEqual([]);
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

  // AND IT WAITS FOR ITS WINNER. `match-3-1` holds no drawPosition yet, and the engine reads a
  // winningSide OFF the arriving position rather than pre-computing it — so a pending exit
  // legitimately carries none. CA ruled this 2026-09-20 after seeing the mechanism work:
  // *"that is unnecessary if the winningSide will display the checkmark once a participant
  // arrives."* An earlier revision of this test pinned `winningSide: 2` here, which held only
  // because the cascade awarded it eagerly — the one place in the engine that did.
  expect(onward.winningSide).toBeUndefined();

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

  // ---- 4. and the winningSide ARRIVES with the opponent ---------------------------------------
  //
  // This is the half that makes the pending state above correct rather than incomplete, and it is
  // the reason the eager award was dropped: the answer is the same either way, and this one is
  // derived from a real drawPosition instead of computed ahead of it.
  const { outcome }: any = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-2', winningSide: 1 });
  const resolved: any = tournamentEngine.setMatchUpStatus({ outcome, matchUpId: 'match-2-2', drawId });
  expect(resolved.success).toEqual(true);

  const settled = getDrawMatchUps(drawId).find((m: any) => m.matchUpId === 'match-3-1');
  expect(settled.matchUpStatus).toEqual(WALKOVER);
  expect(settled.winningSide).toEqual(2);
  // the winner of `match-2-2` is a real participant, and they hold the winning side
  const winningSide = (settled.sides ?? []).find((side: any) => side.sideNumber === settled.winningSide);
  expect(winningSide?.participantId).toBeTruthy();
  // the exit's own origin is untouched by the arrival
  expect(codeFor(settled, 1)).toEqual({
    previousMatchUpStatus: DOUBLE_WALKOVER,
    matchUpStatus: WALKOVER,
    sideNumber: 1,
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
  // pending: no drawPosition has arrived, so no winningSide yet. The test above pins the
  // resolution; this one deliberately leaves the opponent unplayed so the undo is measured
  // against the carry alone.
  expect(matchUp('rt-3-1').winningSide).toBeUndefined();
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

/**
 * THE SAME SCENARIO IN A DRAW THAT HAS A CONSOLATION.
 *
 * CA, 2026-09-20, driving FIRST_MATCH_LOSER_CONSOLATION 8 in TMX with BYEs on Main drawPositions 1
 * and 2 and `MAIN|1|2` a DOUBLE_WALKOVER:
 *
 *   *"what I notice is that the DOUBLE_WALKOVER from Main R1P2 does not produce a WALKOVER as the
 *   matchUpStatusCode provenance for consolation dp4 as it should, and also that the missing
 *   WALKOVER is not advanced past the [...] BYE in consolation R2P1 which should produce a
 *   matchUpStatus: WALKOVER in consolation R3P1 with winningSide: 2."*
 *
 * The Main draw behaves exactly as the single-elimination scenario above — that half was already
 * fixed. What this pins is the LOSER side of the same double exit, and it is a different code path:
 * `doubleExitAdvancement` skipped its loser handling entirely whenever the loser target already
 * read `BYE`, so the consolation slot that would have received the loser got no record at all.
 *
 * It also takes TWO hops rather than one. `CONSOLATION|1|1` is BYE-held, and so is its winner
 * target `CONSOLATION|2|1`; only `CONSOLATION|3|1` can receive the walkover. The intermediate hop
 * is asserted, not just the ends, because skipping it would lose where the exit went.
 */
test('a double exit records its loser slot in the consolation and the exit walks two BYEs', () => {
  setSubscriptions({});
  const drawId = 'bye-meets-exit-fmlc-loser';
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawType: FIRST_MATCH_LOSER_CONSOLATION,
        participantsCount: 7,
        seedsCount: 1,
        drawSize: 8,
        idPrefix: 'fl',
        drawId,
      },
    ],
    nonRandom: 1,
  });
  tournamentEngine.setState(tournamentRecord);

  const matchUp = (matchUpId: string): any => getDrawMatchUps(drawId).find((m: any) => m.matchUpId === matchUpId);

  const { structureId } = tournamentEngine.getEvent({ drawId }).drawDefinition.structures[0];
  const { validActions } = tournamentEngine.positionActions({ drawPosition: 1, structureId, drawId });
  const assignBye: any = validActions.find((action: any) => action.type === BYE);
  // CONTROL: the BYE action must be offered, or the scenario never sets itself up
  expect(assignBye, 'no BYE action offered at drawPosition 1').toBeTruthy();
  expect(tournamentEngine[assignBye.method](assignBye.payload).success).toEqual(true);

  const applied: any = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    matchUpId: 'fl-1-2',
    drawId,
  });
  expect(applied.success).toEqual(true);

  // ---- the MAIN draw, unchanged from the single-elimination scenario ---------------------------
  expect(matchUp('fl-2-1').matchUpStatus).toEqual(BYE);
  expect(matchUp('fl-3-1').matchUpStatus).toEqual(WALKOVER);
  expect(matchUp('fl-3-1').winningSide).toBeUndefined();

  // ---- 1. the LOSER slot records the exit, and the BYE beside it stays a BYE -------------------
  // `CONSOLATION|1|1` holds drawPositions [3, 4]: dp3 is the BYE fed from the Main BYE, dp4 is the
  // slot that would have received `fl-1-2`'s loser. Nobody lost, so dp4 carries the produced exit.
  const loserSlot = matchUp('fl-c-1-1');
  expect(loserSlot.matchUpStatus).toEqual(BYE);
  expect(codeFor(loserSlot, 2)).toEqual({
    previousMatchUpStatus: DOUBLE_WALKOVER,
    matchUpStatus: WALKOVER,
    sideNumber: 2,
  });
  expect(loserSlot.sideExitProvenance?.[2]?.sourceMatchUpId).toEqual('fl-1-2');
  // dp3's side is a BYE the draw put there, not an origin this cascade established
  expect(codeFor(loserSlot, 1)).toEqual({ sideNumber: 1 });

  // ---- 2. the INTERMEDIATE hop is recorded, and is still a BYE ---------------------------------
  // `CONSOLATION|2|1` holds [1, 4]: dp1 is a draw BYE and dp4 is the position that advanced through
  // `CONSOLATION|1|1`. It is a feed round, so the advanced position is side 2 (draw-positions rule 4).
  const secondBye = matchUp('fl-c-2-1');
  expect(secondBye.matchUpStatus).toEqual(BYE);
  expect(codeFor(secondBye, 2)).toEqual({
    previousMatchUpStatus: DOUBLE_WALKOVER,
    matchUpStatus: WALKOVER,
    sideNumber: 2,
  });

  // ---- 3. and the walkover comes to rest where a live opponent can still arrive ----------------
  const onward = matchUp('fl-c-3-1');
  expect(onward.matchUpStatus).toEqual(WALKOVER);
  // pending, for the same reason as the Main draw above: nobody has arrived on the other side
  expect(onward.winningSide).toBeUndefined();
  expect(codeFor(onward, 1)).toEqual({
    previousMatchUpStatus: DOUBLE_WALKOVER,
    matchUpStatus: WALKOVER,
    sideNumber: 1,
  });
  // the ORIGIN survives both hops — it is the double walkover, not either BYE it passed through
  expect(onward.sideExitProvenance?.[1]?.sourceMatchUpId).toEqual('fl-1-2');

  // ---- 4. AND ALL THREE COME BACK OUT when the double walkover is removed --------------------
  //
  // CA, 2026-09-20: *"When I remove it the consolation R1P1 matchUpStatusCodes don't clear and the
  // WALKOVER remains advanced to consolation R3P1."* Measured: THREE consolation matchUps kept
  // residue, because `removeDoubleExit` had the mirror image of the forward guard and skipped a
  // BYE-held loser target on the way back.
  const cleared: any = tournamentEngine.setMatchUpStatus({ outcome: clearOutcome, matchUpId: 'fl-1-2', drawId });
  expect(cleared.error).toBeUndefined();
  expect(cleared.success).toEqual(true);
  expect(matchUp('fl-1-2').matchUpStatus).toEqual(TO_BE_PLAYED);

  // every consolation matchUp the exit touched is returned whole. Asserted field by field, because
  // a blanked status with a surviving winningSide or provenance is this family's residue shape.
  for (const matchUpId of ['fl-c-1-1', 'fl-c-2-1']) {
    const restored = matchUp(matchUpId);
    // the BYEs are still BYEs — the clear must not take the DRAW's own state with it
    expect(restored.matchUpStatus, matchUpId).toEqual(BYE);
    // and they carry NO codes at all, not a reserved slot: these BYEs came from the draw and were
    // never stamped, so there is no surviving origin to project. `fl-2-1` below is the contrast —
    // its side 1 keeps `{BYE -> BYE}` because the BYE propagation DID record it.
    expect(restored.matchUpStatusCodes ?? [], matchUpId).toEqual([]);
    expect(restored.sideExitProvenance, matchUpId).toBeUndefined();
  }

  const restoredOnward = matchUp('fl-c-3-1');
  expect(restoredOnward.matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(restoredOnward.winningSide).toBeUndefined();
  expect(restoredOnward.matchUpStatusCodes ?? []).toEqual([]);
  expect(restoredOnward.sideExitProvenance).toBeUndefined();
  // the drawPosition that reached the consolation final through the DRAW's own BYE cascade is still
  // there: nothing was advanced by this cascade, so nothing is un-advanced by its removal
  expect(restoredOnward.drawPositions?.filter(Boolean)).toEqual([4]);

  // and the Main draw unwinds as the single-elimination scenario already pins
  expect(matchUp('fl-3-1').matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(matchUp('fl-3-1').winningSide).toBeUndefined();
  expect(matchUp('fl-2-1').matchUpStatus).toEqual(BYE);
  expect(codeFor(matchUp('fl-2-1'), 1)).toEqual({ previousMatchUpStatus: BYE, matchUpStatus: BYE, sideNumber: 1 });
  expect(codeFor(matchUp('fl-2-1'), 2)).toEqual({ sideNumber: 2 });
});
