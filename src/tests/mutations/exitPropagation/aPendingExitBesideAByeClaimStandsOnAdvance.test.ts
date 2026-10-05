import { getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replay } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * A PENDING PRODUCED EXIT STANDS WHEN A POSITION ADVANCES INTO IT, EVEN WHERE A BYE HAS CLAIMED THE OTHER SEAT.
 *
 * Census w2 9100521 (COMPASS 32/29), shrunk to six steps. `South|3|1` holds a produced WALKOVER from a double
 * walkover upstream, pending, beside a BYE's claim on the other seat (`BYE>BYE` in provenance). A position then
 * advances into it past a BYE in `South|2|2`: here an EMPTY one, structurally, as a BYE placeholder does.
 * `arrivalIntoProvenanceOnlyExit` is the rule that places the arrival beside a pending exit (a participant takes it;
 * an empty position leaves it pending, since a produced exit awards no empty seat, CA 2026-10-03). It counted every
 * provenance entry as an exit, so the BYE's claim made the lone pending exit look like a convergence, the rule
 * declined, and the generic advance overwrote the matchUp TO_BE_PLAYED while its provenance still recorded the
 * walkover (ORIGIN_ON_UNDECIDED_MATCHUP, PROPAGATED_EXIT_LOST). It counts exits only.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (coordinate: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = coordinate.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};

const config = { drawType: COMPASS, drawSize: 32, participantsCount: 29, seed: 9100521, propagateExitStatus: true };
const steps = [
  at('East|1|13', { matchUpStatus: DOUBLE_WALKOVER }),
  at('East|1|11', { winningSide: 2 }),
  at('East|1|12', { winningSide: 2 }),
  at('East|1|4', { matchUpStatus: WALKOVER, winningSide: 2 }),
  at('East|1|7', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('West|1|6', { matchUpStatus: DOUBLE_DEFAULT }),
];
const key = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

it('the census replay holds every property', () => {
  setSubscriptions({});
  expect(replay(config, steps, 'bye-claim-replay')).toBeNull();
});

it('the produced walkover stands, pending, with the advanced position beside it', () => {
  const drawId = 'bye-claim';
  setSubscriptions({});
  prepareDraw(config, drawId);
  const find = (coordinate: string) => getDrawMatchUps(drawId).find((matchUp) => key(matchUp) === coordinate);
  for (const step of steps) {
    const target = find(key(step));
    const result: any = tournamentEngine.setMatchUpStatus({
      propagateExitStatus: config.propagateExitStatus,
      matchUpId: target.matchUpId,
      outcome: step.outcome,
      drawId,
    });
    expect(result.success).toEqual(true);
  }
  const matchUp = find('South|3|1');
  // CONTROL: the shape is reached, a position advanced into the produced walkover beside the BYE's claim
  expect(matchUp.drawPositions.filter(Boolean)).toHaveLength(1);
  expect(Object.values(matchUp.sideExitProvenance ?? {}).map((entry: any) => entry.matchUpStatus)).toContain('BYE');
  expect(matchUp.matchUpStatus).toEqual(WALKOVER);
  expect(matchUp.winningSide).toBeUndefined();
  expect(tournamentEngine.getDrawInconsistencies({ drawId }).inconsistencies ?? []).toEqual([]);
});
