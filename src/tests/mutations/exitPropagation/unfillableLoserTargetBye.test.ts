import { PRODUCED_EXIT_POLICY } from '@Tests/testHarness/exitPropagation/producedExitPolicy';
import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_WALKOVER, TO_BE_PLAYED, BYE } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * **P39 — the seat a produced exit feeds can never be filled, so it is a BYE.**
 *
 * CA's originally filed report, and the last stranded participant in it. COMPASS 16/14, ONE
 * `DOUBLE_WALKOVER` at `East|1|2`, played to exhaustion: `West|2|1` ends `WALKOVER ws=2` holding one
 * participant, and its loser target `Southwest|1|1` dp1 received **nothing** — so a real participant
 * sat on dp2 of that matchUp facing an opponent who could never arrive.
 *
 * ## The asymmetry that made it a gate rather than an absence
 *
 * In the SAME draw `North|1|1` dp1 does receive `bye: true, byeFromPropagation: true`, and so does
 * `Northwest|1|1` in turn — the BYE cascade works. It fires from `advanceDrawPosition`, whose gate is
 * *the losing drawPosition is a BYE*. At `West|2|1` the losing position (dp2) is **EMPTY**: not a BYE
 * and not a participant, because the double walkover upstream meant nobody was ever placed there.
 * Measured: `advanceDrawPosition` is not even called for `West|2|1` — every one of its ten calls in
 * this draw advances a BYE — because a produced exit resolves through the ARRIVAL path instead.
 *
 * `propagateConsolationBye`, which does sit on the arrival path, is gated on
 * `linkCondition === FIRST_MATCHUP`. Per CA 2026-09-26 that constant names a link TRAVERSAL that
 * never occurs in COMPASS, so nothing was missing from the draw definition — the gate asks an
 * unrelated question.
 *
 * ## What this asserts, and why each part separately
 *
 * The seat is asserted by NAME and by `byeFromPropagation`, the participant beside it is asserted to
 * be real, and `North|1|1` is asserted too — as a CONTROL. If a change breaks the ordinary BYE cascade
 * while satisfying the new one, `North` is what says so, and the two are independent mechanisms.
 */

const occupantsOf = (m: any) => (m?.sides ?? []).filter((s: any) => s?.participantId && !s?.bye);
const playableShape = (m: any) => !m.winningSide && (!m.matchUpStatus || m.matchUpStatus === 'TO_BE_PLAYED');

const allMatchUps = (drawId: string) => tournamentEngine.allDrawMatchUps({ inContext: true, drawId }).matchUps ?? [];

const matchUpAt = (drawId: string, structureName: string, roundNumber: number, roundPosition: number) =>
  (allMatchUps(drawId) as any[]).find(
    (m) => m.structureName === structureName && m.roundNumber === roundNumber && m.roundPosition === roundPosition,
  );

const assignmentAt = (drawId: string, structureName: string, drawPosition: number) => {
  const drawDefinition: any = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const structure = drawDefinition.structures?.find((s: any) => s.structureName === structureName);
  return (structure?.positionAssignments ?? []).find((a: any) => a.drawPosition === drawPosition);
};

function compassPlayedOut(participantsCount: number, drawId: string) {
  setSubscriptions({});
  const { drawIds } = mocksEngine.generateTournamentRecord({
    policyDefinitions: PRODUCED_EXIT_POLICY,
    drawProfiles: [{ drawType: COMPASS, drawSize: 16, participantsCount, drawId }],
    nonRandom: 20223109,
    setState: true,
  });
  expect(drawIds).toContain(drawId);

  const source: any = matchUpAt(drawId, 'East', 1, 2);
  tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    matchUpId: source.matchUpId,
    drawId,
  });

  let played = 1;
  while (played) {
    played = 0;
    for (const matchUp of allMatchUps(drawId) as any[]) {
      if (!playableShape(matchUp) || occupantsOf(matchUp).length !== 2) continue;
      const result: any = tournamentEngine.setMatchUpStatus({
        outcome: { winningSide: 1 },
        matchUpId: matchUp.matchUpId,
        drawId,
      });
      if (!result.error) played++;
    }
  }

  return {
    at: (structureName: string, roundNumber: number, roundPosition: number) =>
      matchUpAt(drawId, structureName, roundNumber, roundPosition),
    assignmentOf: (structureName: string, drawPosition: number) => assignmentAt(drawId, structureName, drawPosition),
  };
}

it('propagates a BYE into a first-round seat whose feeder produced an exit and no loser', () => {
  const { at, assignmentOf } = compassPlayedOut(14, 'p39-compass-14');

  // the source state: a produced exit, decided, whose losing drawPosition holds nobody at all
  const west21: any = at('West', 2, 1);
  expect(west21.matchUpStatus).toEqual('WALKOVER');
  expect(west21.winningSide).toEqual(2);
  expect(occupantsOf(west21).length).toEqual(1);
  expect(assignmentOf('West', 2)?.participantId).toBeUndefined();
  expect(assignmentOf('West', 2)?.bye).toBeUndefined();

  // THE FIX: the seat it feeds is resolved as a propagated BYE rather than left empty forever
  const southwest11: any = at('Southwest', 1, 1);
  expect(southwest11.matchUpStatus).toEqual(BYE);
  expect(assignmentOf('Southwest', 1)?.bye).toEqual(true);
  expect(assignmentOf('Southwest', 1)?.byeFromPropagation).toEqual(true);

  // and the participant who was stranded is a real one, on the other side of that matchUp
  expect(occupantsOf(southwest11).length).toEqual(1);
  expect(occupantsOf(southwest11)[0].drawPosition).toEqual(2);

  // CONTROL: the ordinary BYE cascade, a DIFFERENT mechanism, still works in the same draw
  const north11: any = at('North', 1, 1);
  expect(north11.matchUpStatus).toEqual(BYE);
  expect(assignmentOf('North', 1)?.byeFromPropagation).toEqual(true);
});

/**
 * The 12-participant draw, which strands the same seat. It is kept because it is the case the
 * `STALLED_POSITION` detector reports as its one remaining COMPASS finding, so the two measurements
 * are about the same state and a future reader can tie them together.
 */
it('resolves the same seat at 12 participants, where four byes make the cascade deeper', () => {
  const { at, assignmentOf } = compassPlayedOut(12, 'p39-compass-12');

  const southwest11: any = at('Southwest', 1, 1);
  expect(southwest11.matchUpStatus).toEqual(BYE);
  expect(assignmentOf('Southwest', 1)?.byeFromPropagation).toEqual(true);
});

/**
 * WHY THERE IS NO WITHDRAWAL, pinned as an ORDERING rather than argued.
 *
 * `propagateConsolationBye`'s docblock records the defect that follows a reservation nobody revisits —
 * *"Correct when placed — and never revisited."* A withdrawal for this BYE was written and then found to
 * be unreachable, so it was deleted rather than shipped: dead code that looks load-bearing is worse than
 * none.
 *
 * The reason is an ordering, and this test is what holds it. Playing N steps and then attempting to
 * clear the originating `DOUBLE_WALKOVER`, the REFUSAL arrives BEFORE the PLACEMENT:
 *
 *   steps 1..8   BYE not yet placed    clear PERMITTED
 *   step  10     BYE not yet placed    clear REFUSED (ERR_INCOMPATIBLE_MATCHUP_STATUS)
 *   steps 12+    BYE placed            clear REFUSED
 *
 * So there is no state in which a stale reservation can exist. Same conclusion
 * `propagateConsolationBye` reaches for itself: *"Once a consolation result exists the correction is
 * REFUSED outright ... so there is no stale reservation left to withdraw."*
 *
 * **If that refusal ever loosens, this test fails and a withdrawal becomes necessary.** That is the
 * whole point of pinning it: the safety of omitting the withdrawal is a property of the refusal, not of
 * the propagation, and nothing else would notice the refusal moving.
 */
it('is safe without a withdrawal, because the correction is refused before the BYE is ever placed', () => {
  const played = (steps: number) => {
    setSubscriptions({});
    const drawId = `p39-window-${steps}`;
    mocksEngine.generateTournamentRecord({
      policyDefinitions: PRODUCED_EXIT_POLICY,
      drawProfiles: [{ drawType: COMPASS, drawSize: 16, participantsCount: 14, drawId }],
      nonRandom: 20223109,
      setState: true,
    });
    const source: any = matchUpAt(drawId, 'East', 1, 2);
    tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_WALKOVER },
      matchUpId: source.matchUpId,
      drawId,
    });

    let taken = 0;
    while (taken < steps) {
      const next: any = (allMatchUps(drawId) as any[]).find((m) => playableShape(m) && occupantsOf(m).length === 2);
      if (!next) break;
      const result: any = tournamentEngine.setMatchUpStatus({
        outcome: { winningSide: 1 },
        matchUpId: next.matchUpId,
        drawId,
      });
      if (result.error) break;
      taken += 1;
    }

    const byePlaced = assignmentAt(drawId, 'Southwest', 1)?.byeFromPropagation === true;
    const cleared: any = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: TO_BE_PLAYED, winningSide: undefined, score: undefined },
      matchUpId: source.matchUpId,
      drawId,
    });
    return { byePlaced, clearRefused: !!cleared.error };
  };

  // early: nothing placed yet, and the correction is still available — the CONTROL that proves this
  // test can distinguish the two states at all
  const early = played(4);
  expect(early.byePlaced).toEqual(false);
  expect(early.clearRefused).toEqual(false);

  // by the time the BYE exists, the correction is already refused, so it can never go stale
  const late = played(16);
  expect(late.byePlaced).toEqual(true);
  expect(late.clearRefused).toEqual(true);
});
