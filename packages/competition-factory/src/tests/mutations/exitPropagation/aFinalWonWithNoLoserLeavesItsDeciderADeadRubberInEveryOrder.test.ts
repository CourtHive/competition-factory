import { PRODUCED_EXIT_POLICY } from '@Tests/testHarness/exitPropagation/producedExitPolicy';
import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { BYE, DEAD_RUBBER, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * A FINAL WON WITH NO LOSER LEAVES ITS DECIDER A DEAD RUBBER, IN EVERY ORDER (census R11, DOUBLE_ELIMINATION 8/5,
 * seed 21037067, `propagateExitStatus: true`).
 *
 * Three results: `Main|2|2` WALKOVER ws1, `Main|1|2` WALKOVER ws2 and `Main|2|1` DOUBLE_WALKOVER. The Backdraw
 * produces no champion, so the Main final `Main|4|1` is won against a produced exit relayed from it, and has no loser.
 * The published rule (`double-elimination.mdx`, "won against an exit (no loser to send) → DEAD_RUBBER") makes the
 * decider a DEAD_RUBBER holding the champion.
 *
 * Before the fix the answer depended on entry order and policy. Under `doubleExitPropagateBye: false`, orders 012 and
 * 102 ended with the decider a BYE `[BYE, champion]` and a `byeClaims` entry naming the final, while order 120 ended
 * DEAD_RUBBER; on the default policy every order ended BYE. The BYE came from `propagateUnfillableLoserBye`: the
 * decider is the one target that a final's winner link and loser link both feed, so the loser-seat BYE landed in the
 * winner's seat, where `reconcileDecider` could not repair it.
 *
 * Orders that enter `Main|2|1` before both of its feeders are decided are refused (`ERR_INVALID_MATCHUP_STATUS`) and
 * are skipped; the control below makes sure enough orders still ran.
 */

const CONFIG = {
  drawType: DOUBLE_ELIMINATION,
  propagateExitStatus: true,
  participantsCount: 5,
  seed: 21037067,
  drawSize: 8,
};
const RESULTS = [
  { key: 'Main|2|2', outcome: { matchUpStatus: WALKOVER, winningSide: 1 } },
  { key: 'Main|1|2', outcome: { matchUpStatus: WALKOVER, winningSide: 2 } },
  { key: 'Main|2|1', outcome: { matchUpStatus: DOUBLE_WALKOVER } },
];
const ORDERS = ['012', '021', '102', '120', '201', '210'];
const POLICIES = [
  { policy: 'default', policyDefinitions: undefined },
  { policy: 'doubleExitPropagateBye: false', policyDefinitions: PRODUCED_EXIT_POLICY },
];

const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const participantsIn = (matchUp: any) =>
  (matchUp.sides ?? []).filter((side: any) => side?.participantId).map((side: any) => side.participantId);

function play(order: string, policyDefinitions: any, drawId: string) {
  setSubscriptions({});
  expect(prepareDraw(CONFIG, drawId, policyDefinitions)).toEqual(true);
  const find = (key: string) => getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === key);

  for (const index of order.split('').map(Number)) {
    const { key, outcome } = RESULTS[index];
    const result: any = observeMutation({
      propagateExitStatus: CONFIG.propagateExitStatus,
      matchUpId: find(key).matchUpId,
      outcome,
      drawId,
    });
    if (result.error) return { refused: result.error.code ?? result.error.message ?? String(result.error) };
    expect(result.thrown).toBeUndefined();
  }

  return { matchUps: getDrawMatchUps(drawId) };
}

it.each(POLICIES)('the decider is a DEAD_RUBBER holding the champion in every accepted order — $policy', (cases) => {
  const completed: string[] = [];
  const refused: string[] = [];

  for (const order of ORDERS) {
    const played: any = play(order, cases.policyDefinitions, `decider-no-loser-${order}`);
    if (played.refused) {
      refused.push(order);
      continue;
    }
    completed.push(order);

    const final = played.matchUps.find((matchUp: any) => coordinate(matchUp) === 'Main|4|1');
    const decider = played.matchUps.find((matchUp: any) => matchUp.structureName === 'Decider');

    // CONTROL: the arrangement under test happened -- the final was won by a lone participant against an exit
    expect(final.winningSide, `${order}: the final is decided`).toBeDefined();
    expect(participantsIn(final), `${order}: by a winner who had no opponent`).toHaveLength(1);

    expect(decider.matchUpStatus, `${order}: the decider is not needed`).toEqual(DEAD_RUBBER);
    expect(decider.winningSide, `${order}: and nobody won it`).toBeUndefined();
    expect(participantsIn(decider), `${order}: the champion is seated there`).toEqual(participantsIn(final));
    expect(
      (decider.sides ?? []).some((side: any) => side?.bye),
      `${order}: and no BYE`,
    ).toEqual(false);
    expect(decider.matchUpStatus).not.toEqual(BYE);
  }

  // CONTROL on the sweep: refused orders are skipped, so an all-refused run would pass by checking nothing
  expect(completed.length, `completed ${completed.join(',')}; refused ${refused.join(',')}`).toBeGreaterThanOrEqual(3);
});
