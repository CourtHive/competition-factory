import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { isExit } from '@Validators/isExit';
import { expect, test } from 'vitest';

// constants
import { POLICY_TYPE_PROGRESSION, POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { DOUBLE_WALKOVER, WALKOVER, BYE } from '@Constants/matchUpStatusConstants';
import { FEED_IN_CHAMPIONSHIP_TO_SF } from '@Constants/drawDefinitionConstants';

/**
 * `doubleExitPropagateBye` must reach a loser matchUp that is ALREADY a BYE.
 *
 * ## The rule
 *
 * CA, 2026-09-18: *a DOUBLE_WALKOVER in a source structure can logically only produce a BYE in a
 * target structure.* A double exit removes BOTH competitors, so the downstream loser slot will
 * receive nobody — and a position that will receive nobody is a BYE. Producing a WALKOVER there puts
 * a RESULT where a COMPETITOR belongs, and the slot can then never be claimed.
 *
 * `POLICY_PROGRESSION_DEFAULT` already names this — `progression.doubleExitPropagateBye`, *"a BYE
 * will propagate to loser position instead of a produced WALKOVER … significant for providers who do
 * not award ranking points for first round walkovers"*. It defaults to FALSE and this test does not
 * change that: everything here is opt-in.
 *
 * ## The gap
 *
 * `doubleExitAdvancement` guarded its loser handling with `loserMatchUp.matchUpStatus !== BYE`, and
 * `handleLoserMatchUp` was the only place the flag was consulted. When the loser matchUp is already
 * a BYE — because ONE of its two positions is a draw BYE — the branch was skipped entirely, even
 * though the OTHER position is vacant and is precisely the slot the rule is about. The policy was
 * attached and readable throughout; it simply never got asked.
 *
 * ## What changed on 2026-09-20, and why these tests were re-authored
 *
 * That guard had a SECOND consequence, independent of the policy: with the flag OFF the vacant slot
 * got no record either — not the BYE, and not the produced exit that belongs there. CA drove it in
 * TMX on FIRST_MATCH_LOSER_CONSOLATION and ruled that the exit must be recorded on the loser
 * drawPosition's own side and carried onward, with the BYE beside it left alone. Closing that put
 * the produced exit into the linked structure BY DEFAULT.
 *
 * So the OFF case can no longer assert that the unclaimable defect is still present — it is gone,
 * measured `['Consolation|2|2'] -> []` — and it can no longer be the ON case's control on that
 * basis. **The control is now the loser drawPosition itself**, which is the one coordinate the flag
 * decides: `vacant` with the flag off, a propagated BYE with it on. That is a stronger control than
 * the defect's presence, because it states the policy's actual contract rather than a symptom.
 *
 * CA, 2026-09-20, on what the policy governs: *"doubleExitPropagateBye: true is ONLY referring to
 * connected structure propagation … because in the structure in which the doubleExit occurs there
 * still should be a produced exit."* Measured and true — all three consultation sites in `src/` are
 * on the loser-target path, and the Main structure is byte-identical either way. The third test
 * below pins that.
 *
 * ## The scenario
 *
 * `Mentat/testing/EXIT_CASCADE_MANUAL_REPRODUCTIONS.md` scenario H, records in
 * `CourtHive/repro-H-ficsf8-*`. Three entries, no matchUp scored twice. `Main R1 M3` is a double
 * walkover, so it has no loser; the consolation slot that would have received that loser stays vacant
 * and `Consolation|2|2` ends up a WALKOVER awarded to an empty position that nobody can ever fill —
 * verified elsewhere by playing the draw to exhaustion.
 */

const key = (m: any) => `${m.structureName}|${m.roundNumber}|${m.roundPosition}`;

function build(drawId: string, propagateBye: boolean) {
  setSubscriptions({});
  const policyDefinitions: any = { [POLICY_TYPE_SCORING]: { propagateExitStatus: true } };
  if (propagateBye) policyDefinitions[POLICY_TYPE_PROGRESSION] = { doubleExitPropagateBye: true };
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ participantsCount: 6, drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP_TO_SF, drawId }],
    policyDefinitions,
    nonRandom: 500023,
    setState: true,
  });
  const matchUps = (): any[] => tournamentEngine.allDrawMatchUps({ inContext: true, drawId }).matchUps ?? [];
  for (const step of [
    { s: 'Main', r: 1, p: 3, outcome: { matchUpStatus: DOUBLE_WALKOVER } },
    { s: 'Main', r: 1, p: 2, outcome: { winningSide: 1 } },
    { s: 'Main', r: 2, p: 1, outcome: { matchUpStatus: WALKOVER, winningSide: 1 } },
  ]) {
    const target = matchUps().find((m: any) => key(m) === `${step.s}|${step.r}|${step.p}`);
    // CONTROL: a coordinate naming no matchUp would skip the step that builds the state.
    expect(target, `${step.s}|${step.r}|${step.p} names no matchUp`).toBeTruthy();
    const result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: target.matchUpId,
      outcome: step.outcome,
      drawId,
    });
    expect(result?.error, `step refused: ${JSON.stringify(result?.error)}`).toBeUndefined();
  }
  return matchUps;
}

/** An exit awarded to a position holding nobody — the shape that can never be claimed. */
/**
 * The loser drawPosition of the double walkover — the ONE coordinate this policy decides.
 *
 * `Main|1|3` is the double walkover and its loser feeds consolation drawPosition 5. Everything else
 * in the consolation is the same under both settings, so this assignment is the control pair: the
 * OFF test asserts it vacant, the ON test asserts it a propagated BYE.
 */
const loserSlot = (drawId: string): any => {
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const consolation = drawDefinition.structures.find((s: any) => s.structureName === 'Consolation');
  return (consolation?.positionAssignments ?? []).find((a: any) => a.drawPosition === LOSER_DRAW_POSITION);
};

const LOSER_DRAW_POSITION = 5;

const unclaimable = (matchUps: any[]): string[] =>
  matchUps
    .filter((m: any) => {
      if (!isExit(m.matchUpStatus) || !m.winningSide) return false;
      const winnerSide = (m.sides ?? []).find((s: any) => s.sideNumber === m.winningSide);
      return !winnerSide?.participantId && !winnerSide?.bye;
    })
    .map(key);

test('with the policy OFF the loser slot keeps the produced exit rather than becoming a BYE', () => {
  const matchUps = build('deb-off', false);

  // CONTROL, and the whole contract of the flag: the slot the double walkover's loser would have
  // filled is left VACANT — not a BYE — and the ON case below asserts the same coordinate is one.
  expect(loserSlot('deb-off'), 'the loser slot must not be a BYE with the flag off').toEqual({
    drawPosition: LOSER_DRAW_POSITION,
  });

  // and the produced exit is recorded there, on that position's own side. The matchUp itself stays
  // BYE because its OTHER position (drawPosition 6) carries a draw BYE — CA's rule, 2026-09-20:
  // a propagated exit meeting a BYE is advanced, and the BYE remains a BYE.
  const fed = matchUps().find((m: any) => key(m) === 'Consolation|1|2');
  expect(fed?.matchUpStatus, 'the draw BYE beside the loser slot is untouched').toEqual(BYE);
  expect((fed?.matchUpStatusCodes ?? []).find((c: any) => c?.sideNumber === 1)).toEqual({
    previousMatchUpStatus: DOUBLE_WALKOVER,
    matchUpStatus: WALKOVER,
    sideNumber: 1,
  });

  // NOT a control any more, and deliberately asserted the other way round from what this test used
  // to say. Recording the exit and carrying it onward resolves the dead slot by default, so with
  // the flag off there is now nothing awarded to a position nobody can fill either.
  expect(unclaimable(matchUps()), 'nothing may be left awarded to an empty position').toEqual([]);
});

test('the policy governs the LINKED structure only — the source structure is untouched', () => {
  // Captured IMMEDIATELY after each build, never lazily. `build` calls `setState: true`, so the
  // engine holds one tournament at a time and a closure read after the second build reports on
  // whichever record is loaded then — measured: the second reads empty.
  const mainState = (matchUps: () => any[]) =>
    matchUps()
      .filter((m: any) => m.stage === 'MAIN')
      .map((m: any) => `${key(m)} ${m.matchUpStatus} ws=${m.winningSide ?? '-'}`)
      .sort((a: string, b: string) => a.localeCompare(b));

  const off = mainState(build('deb-src-off', false));
  const on = mainState(build('deb-src-on', true));

  /**
   * CA, 2026-09-20: *"in the structure in which the doubleExit occurs there still should be a
   * produced exit."* The flag decides what lands at the loser drawPosition in the TARGET structure
   * and nothing else; a double exit still produces a WALKOVER for its own winner target.
   *
   * Asserted as a whole-structure comparison rather than on one matchUp, so a future change that
   * leaks the policy into the source structure anywhere fails here.
   */
  expect(on).toEqual(off);
  // CONTROL: the comparison is worthless unless the source structure is non-empty and the double
  // exit actually produced something in it
  expect(off.length).toBeGreaterThan(0);
  expect(off.some((line: string) => line.includes(WALKOVER))).toBe(true);
});

test('with the policy ON the double exit produces a BYE, and nothing is left unclaimable', () => {
  const matchUps = build('deb-on', true);

  // CONTROL, paired with the OFF test above: the SAME coordinate, now a BYE this cascade placed.
  // `byeFromPropagation` distinguishes it from the draw's own BYEs, which sit at 3 and 6 under both
  // settings and would make a bare `bye: true` assertion pass for the wrong reason.
  expect(loserSlot('deb-on'), 'the loser slot must be a propagated BYE with the flag on').toEqual({
    drawPosition: LOSER_DRAW_POSITION,
    byeFromPropagation: true,
    bye: true,
  });

  // the loser slot of the double walkover is now a BYE
  const fed = matchUps().find((m: any) => key(m) === 'Consolation|1|2');
  expect(fed?.matchUpStatus, 'expected the fed consolation matchUp to be a BYE').toEqual(BYE);
  expect(
    (fed?.sides ?? []).every((s: any) => s.bye),
    'expected BYEs on both sides',
  ).toBe(true);

  // and the produced WALKOVER is gone: the feed entrant meets a BYE and advances
  const consolation = matchUps().find((m: any) => key(m) === 'Consolation|2|2');
  expect(consolation?.matchUpStatus, 'expected a BYE rather than a produced WALKOVER').toEqual(BYE);
  expect(consolation?.winningSide, 'a BYE matchUp never carries a winningSide').toBeFalsy();

  expect(unclaimable(matchUps()), 'nothing may be left awarded to an empty position').toEqual([]);

  // the invariant the produced-WALKOVER alternative breaks when it lands on a BYE
  const byeWithWinningSide = matchUps()
    .filter((m: any) => (m.sides ?? []).some((s: any) => s.bye) && m.winningSide)
    .map(key);
  expect(byeWithWinningSide, 'a matchUp containing a BYE may never carry a winningSide').toEqual([]);

  /**
   * And the withdrawn competitor's WALKOVER FOLLOWS THEM through the BYE.
   *
   * This is `progressExitStatus` RULE 1 — a participant whose opponent is a BYE advances through it
   * and the exit is re-propagated onto wherever they land — and it is the reason this belongs in the
   * cascade rather than being applied afterwards. Assigning the BYE as a retrofit
   * (`assignDrawPositionBye` once the state already exists) leaves the final `TO_BE_PLAYED` between
   * both players, which would schedule someone who has withdrawn.
   *
   * Asserted structurally rather than by name: `nonRandom` does not fix participant names across
   * differing generation contexts, so a name-based assertion here would be a fixture trap.
   */
  const final = matchUps().find((m: any) => key(m) === 'Consolation|3|1');
  expect(final?.matchUpStatus, 'the exit must follow the participant to the final').toEqual(WALKOVER);
  expect(final?.winningSide, 'the final must be awarded').toBeTruthy();
  const finalWinner = (final?.sides ?? []).find((s: any) => s.sideNumber === final.winningSide);
  expect(finalWinner?.participantId, 'the walkover must be won by a real participant').toBeTruthy();
  const finalLoser = (final?.sides ?? []).find((s: any) => s.sideNumber !== final.winningSide);
  expect(finalLoser?.participantId, 'the withdrawn competitor is the losing side').toBeTruthy();
  expect(Object.keys(final?.sideExitProvenance ?? {}), 'the exit must be stamped with its origin').toHaveLength(1);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId: 'deb-on' });
  const integrity: any = getDrawInconsistencies({ drawDefinition, drawId: 'deb-on' });
  expect((integrity?.inconsistencies ?? []).map((i: any) => i.issueType)).toEqual([]);
});
