import { getDrawDefinition, getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * A FIRST-MATCH-LOSER BYE IS CLAIMED BY THE EXIT THAT OWES IT (census A1 9000230, FIRST_MATCH_LOSER_CONSOLATION 8/8,
 * `propagateExitStatus: true`; opened by wave 4 on all three arms).
 *
 * Once `Main|1|1` is played, the loser of `Main|2|1` has already won a match, so FIRST_MATCH_LOSER gives that loser's
 * consolation seat (dp 1) a BYE, and no double exit claims it. Wave 4 taught `advanceByeToLoserMatchUp` to record no
 * claim on a BYE standing unclaimed, for the BYE a BYE matchUp's loser seat holds (`aByeMatchUpsLoserSeatKeepsItsBye`).
 * Applied to this BYE too, neither double default below recorded its claim, though each made `Main|2|1`'s loser nobody.
 * Re-scoring `Main|1|2` to a default dissolved the convergence and withdrew its BYE: with no claim left, `e42a`'s
 * (`Main|1|1`'s) did not hold it. dp 1 was emptied, `Consolation|2|1` was awarded to that empty seat, and its
 * winner's seat in `Consolation|3|1` stalled opposite `Consolation|1|2`'s winner.
 *
 * The skip is kept to the BYE it was written for: the matchUp feeding the seat holds a BYE.
 */

const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const step = (structureName: string, roundNumber: number, roundPosition: number, outcome: any) => ({
  structureName,
  roundNumber,
  roundPosition,
  outcome,
});

const CONFIG = {
  drawType: 'FIRST_MATCH_LOSER_CONSOLATION',
  propagateExitStatus: true,
  participantsCount: 8,
  seed: 9000230,
  drawSize: 8,
};

const STEPS = [
  step('Main', 1, 1, { winningSide: 1 }),
  step('Main', 1, 2, { winningSide: 1 }),
  step('Main', 1, 3, { winningSide: 1 }),
  step('Main', 1, 4, { winningSide: 1 }),
  step('Main', 1, 2, { matchUpStatus: 'DOUBLE_DEFAULT' }),
  step('Main', 1, 1, { matchUpStatus: 'DOUBLE_DEFAULT' }),
  step('Main', 1, 2, { matchUpStatus: 'DEFAULTED', winningSide: 1 }),
  step('Consolation', 1, 2, { winningSide: 2 }),
  step('Main', 2, 2, { winningSide: 1 }),
  step('Main', 3, 1, { winningSide: 1 }),
];

const ARMS: [string, any, boolean][] = [
  ['off', undefined, false],
  ['on', undefined, true],
  ['pol', { progression: { doubleExitPropagateBye: false } }, false],
];

afterEach(() => {
  delete process.env.ALLOW_CHANGE_PROPAGATION;
});

describe('a first-match-loser BYE is claimed by the exit that owes it', () => {
  it.each(ARMS)('arm %s', (_arm, policyDefinitions, allowChangePropagation) => {
    if (allowChangePropagation) process.env.ALLOW_CHANGE_PROPAGATION = '1';
    else delete process.env.ALLOW_CHANGE_PROPAGATION;
    setSubscriptions({});
    const drawId = 'fmlc-9000230';
    expect(prepareDraw(CONFIG, drawId, policyDefinitions)).toEqual(true);

    for (const { outcome, ...at } of STEPS) {
      const target = getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === coordinate(at));
      expect((target?.sides ?? []).filter((side: any) => side?.participantId).length).toEqual(2);
      const observation = observeMutation({
        propagateExitStatus: CONFIG.propagateExitStatus,
        matchUpId: target.matchUpId,
        outcome,
        drawId,
      });
      expect(observation.error).toBeUndefined();
      expect(observation.thrown).toBeUndefined();
    }

    const matchUps = getDrawMatchUps(drawId);
    const at = (key: string) => matchUps.find((matchUp: any) => coordinate(matchUp) === key);
    const occupant = (side: any) => (side?.bye && 'BYE') || (side?.participantId && 'P') || '-';

    // Main|2|1 is decided by Main|1|1's double default: its loser is nobody, so the seat its loser feeds stays a BYE
    expect(at('Main|2|1').matchUpStatus).toEqual('DEFAULTED');
    expect(at('Main|2|1').winningSide).toEqual(2);
    const drawDefinition = getDrawDefinition(drawId);
    const consolation = drawDefinition.structures.find((structure: any) => structure.structureName === 'Consolation');
    expect(consolation.positionAssignments.find((assignment: any) => assignment.drawPosition === 1)?.bye).toEqual(true);

    // ...held by the claim of the exit that still owes it
    const seatMatchUp = at('Consolation|2|1');
    expect(seatMatchUp.matchUpStatus).toEqual('BYE');
    expect(seatMatchUp.winningSide).toBeUndefined();
    expect(seatMatchUp.sides[0].bye).toEqual(true);
    expect(seatMatchUp.sideExitProvenance?.[1]?.byeClaims).toEqual([at('Main|1|1').matchUpId]);

    // with the BYE propagated (the default), the BYE's opponent goes on carrying its default and decides the final;
    // under `doubleExitPropagateBye: false` Consolation|1|1 is itself a double default and the final is decided by it
    const final = at('Consolation|3|1');
    if (!policyDefinitions) {
      expect(seatMatchUp.sides.map(occupant)).toEqual(['BYE', 'P']);
      expect(final.sides.map(occupant)).toEqual(['P', 'P']);
    }
    expect(final.matchUpStatus).toEqual('DEFAULTED');
    expect(final.winningSide).toEqual(2);

    const inconsistencies: any = getDrawInconsistencies({ drawDefinition, drawId });
    expect(inconsistencies.inconsistencies ?? []).toEqual([]);
    expect(inconsistencies.valid).not.toEqual(false);
  });
});
