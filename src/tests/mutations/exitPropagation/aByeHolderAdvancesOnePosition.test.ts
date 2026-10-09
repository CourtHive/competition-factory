import { TWO_POSITIONS_FROM_ONE_FEEDER } from '@Query/drawDefinition/getStructureInconsistencies';
import { getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, expect, it } from 'vitest';

// constants
import { BYE, DEFAULTED, DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { OUTCOME_PIPELINE_DIFFERENTIAL } from '@Constants/outcomePipelineConstants';
import { FEED_IN_CHAMPIONSHIP_TO_SF } from '@Constants/drawDefinitionConstants';

/**
 * ONE position goes on from a matchUp, whatever it held when it first advanced.
 *
 * Census w2 9100198 (FEED_IN_CHAMPIONSHIP_TO_SF 16/11), shrunk. `Consolation|4|1` holds only a propagated BYE (dp1)
 * while its other seat waits on a produced exit, and that lone position stood in `Consolation|5|1` as the pending
 * exit's reservation. When a participant then arrived opposite the BYE and passed it, THEIR position went on. It was
 * added BESIDE the BYE's, so `5|1` held two positions from one feeder (`[1, 3]`, read as a BYE), and the next arrival
 * from `4|2` evicted the BYE and un-decided `5|1` (MONOTONIC_DECISION). The arrival here comes from undoing and
 * re-entering a convergence's origin; a relabel of it reaches the same advance (S2D F2).
 *
 * The reservation itself now goes with the exit that made it, when that exit is withdrawn
 * (`aPendingExitsReservationGoesWithIt`): after the clear, `5|1` holds nothing, as it does in the draw where
 * `Main|2|4`'s result was never entered. The arrival then goes on alone, as before.
 */
const drawId = 'bye-holder-advances-one';
const key = (m: any) => `${m.structureName}|${m.roundNumber}|${m.roundPosition}`;
const find = (k: string) => getDrawMatchUps(drawId).find((m: any) => key(m) === k);
const clear = { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: TO_BE_PLAYED };

afterEach(() => setOutcomePipeline());

function score(k: string, outcome: any) {
  const result: any = tournamentEngine.setMatchUpStatus({
    matchUpId: find(k).matchUpId,
    propagateExitStatus: true,
    outcome,
    drawId,
  });
  expect(result.error, k).toBeUndefined();
}

it('a participant passing a BYE holder replaces the lone position it had already advanced', () => {
  setOutcomePipeline(OUTCOME_PIPELINE_DIFFERENTIAL);
  setSubscriptions({});
  const config = {
    drawType: FEED_IN_CHAMPIONSHIP_TO_SF,
    propagateExitStatus: true,
    participantsCount: 11,
    seed: 9100198,
    drawSize: 16,
  };
  expect(prepareDraw(config as any, drawId)).toEqual(true);

  score('Main|1|2', { matchUpStatus: WALKOVER, winningSide: 2 });
  score('Main|1|7', { winningSide: 2 });
  score('Main|2|4', { matchUpStatus: WALKOVER, winningSide: 2 });
  score('Main|1|4', { matchUpStatus: DEFAULTED, winningSide: 1 });
  score('Main|2|3', { matchUpStatus: WALKOVER, winningSide: 2 });
  score('Main|2|1', { matchUpStatus: DOUBLE_WALKOVER });
  score('Main|2|2', { winningSide: 2 });
  score('Main|2|4', clear);

  // CONTROL: Consolation|4|1 holds only its BYE; the reservation its withdrawn exit had made in 5|1 went with the exit
  const holder = find('Consolation|4|1');
  expect(holder.matchUpStatus).toEqual(BYE);
  const [byePosition] = holder.drawPositions.filter(Boolean);
  expect(byePosition).toBeDefined();
  expect((find('Consolation|5|1').drawPositions ?? []).filter(Boolean)).toEqual([]);

  score('Main|2|4', { winningSide: 2 });
  const issues = (tournamentEngine.getDrawInconsistencies({ drawId }) as any).inconsistencies ?? [];
  expect(issues.filter((issue: any) => issue.issueType === TWO_POSITIONS_FROM_ONE_FEEDER)).toEqual([]);

  const passed = find('Consolation|4|1');
  const arrived = passed.drawPositions.find((position: number) => position && position !== byePosition);
  expect(arrived).toBeDefined();
  const next = find('Consolation|5|1');
  expect(next.drawPositions.filter(Boolean)).toEqual([arrived]);
  expect(next.matchUpStatus).toEqual(TO_BE_PLAYED);

  // the opponent from 4|2 now arrives beside them, and nothing that was decided is undone
  score('Consolation|3|2', { winningSide: 2 });
  expect(find('Consolation|5|1').drawPositions.filter(Boolean)).toContain(arrived);
  expect((tournamentEngine.getDrawInconsistencies({ drawId }) as any).valid).toEqual(true);
});
