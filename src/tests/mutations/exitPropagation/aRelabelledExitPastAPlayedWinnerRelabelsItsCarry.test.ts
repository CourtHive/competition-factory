import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * AN EXIT RE-ENTERED AS THE OTHER EXIT RELABELS ITS CARRY, EVEN AFTER ITS WINNER HAS PLAYED ON (census 6141627,
 * COMPASS 16/14, found by the independent do/undo probe).
 *
 * A walkover re-entered as a default for the same winner relabels the exit its loser carries (CA, 2026-10-04: "the
 * carry follows the label"). Once that winner had played on, the re-entry took `relabelWithoutDirection`, which called
 * `relabelLoserExit` without the status being entered, so `relabelsTheCarry` never fired and the carry kept saying
 * WALKOVER. The draw then differed from the one the default entered directly reaches.
 */

type Step = [string, any];
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const config = { drawType: COMPASS, propagateExitStatus: true, participantsCount: 16, drawSize: 16, seed: 6141627 };

function play(steps: Step[], drawId: string) {
  setSubscriptions({});
  expect(prepareDraw(config, drawId)).toEqual(true);
  for (const [key, outcome] of steps) {
    const target = getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === key);
    const observation = observeMutation({ propagateExitStatus: true, matchUpId: target.matchUpId, outcome, drawId });
    expect(observation.error).toBeUndefined();
  }
  return Object.fromEntries(
    getDrawMatchUps(drawId).map((matchUp: any) => [
      coordinate(matchUp),
      {
        matchUpStatus: matchUp.matchUpStatus,
        winningSide: matchUp.winningSide,
        provenance: Object.values(matchUp.sideExitProvenance ?? {}).map((entry: any) => entry?.matchUpStatus),
        occupants: (matchUp.sides ?? []).map((side: any) => side?.participantId),
      },
    ]),
  );
}

it('a walkover re-entered as a default after its winner played on carries the default', () => {
  const relabelled = play(
    [
      ['East|1|1', { winningSide: 1 }],
      ['East|1|2', { matchUpStatus: WALKOVER, winningSide: 1 }],
      ['East|2|1', { winningSide: 1 }],
      ['East|1|2', { matchUpStatus: DEFAULTED, winningSide: 1 }],
    ],
    'relabel-past-played-winner',
  );
  expect(relabelled['East|1|2'].matchUpStatus).toEqual(DEFAULTED);
  expect(relabelled['West|1|1'].provenance).toContain(DEFAULTED);
  expect(relabelled['West|1|1'].provenance).not.toContain(WALKOVER);

  const direct = play(
    [
      ['East|1|1', { winningSide: 1 }],
      ['East|1|2', { matchUpStatus: DEFAULTED, winningSide: 1 }],
      ['East|2|1', { winningSide: 1 }],
    ],
    'relabel-past-played-winner-direct',
  );
  expect(relabelled).toEqual(direct);
});
