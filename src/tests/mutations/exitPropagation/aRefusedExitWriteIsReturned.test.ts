import { getDrawDefinition, getDrawMatchUps, hash } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { OLYMPIC } from '@Constants/drawDefinitionConstants';

/**
 * A REFUSED EXIT WRITE IS RETURNED, never dropped (F3, CA 2026-10-04: "land guard, then build the swap").
 *
 * `setMatchUpStatus`'s progress loop read only `progressExitStatus`'s `context`, so a refusal inside the
 * cascade reported success over a draw it had left half-written. Census w2 9100343 (OLYMPIC 16/11), shrunk
 * from 14 steps to 5: `East|1|2` COMPLETED is re-entered as a WALKOVER won by the other side. The swap seats
 * the new loser in the old loser's West positions, `West|3|1` included; their carried WALKOVER then loses
 * `West|2|1`, and the opponent cannot take the `West|3|1` seat the swap already filled. v1 reported success
 * and `getDrawInconsistencies` reported WINNING_SIDE_ADVANCEMENT_MISMATCH.
 *
 * This pins the REFUSAL. It is not the destination: "an exit carried into a swap" (Mentat S2c) is to accept
 * this relabel correctly, and when it does this test changes with it.
 */
const drawId = 'refused-exit-write';
const key = (m: any) => `${m.structureName}|${m.roundNumber}|${m.roundPosition}`;
const find = (k: string) => getDrawMatchUps(drawId).find((m: any) => key(m) === k);

function setup() {
  setSubscriptions({});
  const config = { participantsCount: 11, propagateExitStatus: true, drawSize: 16, drawType: OLYMPIC, seed: 9100343 };
  expect(prepareDraw(config as any, drawId)).toEqual(true);
  const steps: [string, any][] = [
    ['East|1|5', { matchUpStatus: DEFAULTED, winningSide: 1 }],
    ['East|1|2', { winningSide: 1 }],
    ['East|1|4', { matchUpStatus: WALKOVER, winningSide: 1 }],
    ['East|1|4', { winningSide: 2 }],
  ];
  for (const [k, outcome] of steps) {
    const result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: find(k).matchUpId,
      propagateExitStatus: true,
      outcome,
      drawId,
    });
    expect(result.error, k).toBeUndefined();
  }
}

const relabel = { matchUpStatus: WALKOVER, winningSide: 2 };

it('a cascade write refused inside the relabel is returned, not reported as success', () => {
  setup();
  const result: any = tournamentEngine.setMatchUpStatus({
    matchUpId: find('East|1|2').matchUpId,
    propagateExitStatus: true,
    outcome: relabel,
    drawId,
  });
  expect(result.success).toBeUndefined();
  expect(result.error?.code).toEqual('ERR_EXISTING_POSITION_ASSIGNMENT');
});

it('through an execution queue with rollbackOnError, the refused relabel leaves the draw as it was', () => {
  setup();
  const before = hash(getDrawDefinition(drawId));
  const result: any = tournamentEngine.executionQueue(
    [
      {
        method: 'setMatchUpStatus',
        params: { matchUpId: find('East|1|2').matchUpId, propagateExitStatus: true, outcome: relabel, drawId },
      },
    ],
    true,
  );
  expect(result.error).toBeDefined();
  expect(result.rolledBack).toEqual(true);
  expect(hash(getDrawDefinition(drawId))).toEqual(before);
  expect((tournamentEngine.getDrawInconsistencies({ drawId }) as any).inconsistencies ?? []).toEqual([]);
});
