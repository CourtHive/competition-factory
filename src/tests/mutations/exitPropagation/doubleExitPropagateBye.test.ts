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
 * `doubleExitAdvancement` guards its loser handling with `loserMatchUp.matchUpStatus !== BYE`, and
 * `handleLoserMatchUp` is the only place the flag is consulted. When the loser matchUp is already a
 * BYE — because ONE of its two positions is a draw BYE — the branch is skipped entirely, even though
 * the OTHER position is vacant and is precisely the slot the rule is about. The policy is attached
 * and readable throughout; it simply never gets asked.
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
const unclaimable = (matchUps: any[]): string[] =>
  matchUps
    .filter((m: any) => {
      if (!isExit(m.matchUpStatus) || !m.winningSide) return false;
      const winnerSide = (m.sides ?? []).find((s: any) => s.sideNumber === m.winningSide);
      return !winnerSide?.participantId && !winnerSide?.bye;
    })
    .map(key);

test('with the policy OFF nothing changes — the default is untouched by this fix', () => {
  const matchUps = build('deb-off', false);
  const consolation = matchUps().find((m: any) => key(m) === 'Consolation|2|2');
  expect(consolation?.matchUpStatus).toEqual(WALKOVER);
  // CONTROL: the defect must still be present here, or the ON case below proves nothing.
  expect(unclaimable(matchUps())).toEqual(['Consolation|2|2']);
});

test('with the policy ON the double exit produces a BYE, and nothing is left unclaimable', () => {
  const matchUps = build('deb-on', true);

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
