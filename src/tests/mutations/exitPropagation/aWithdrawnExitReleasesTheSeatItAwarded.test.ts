import { getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, expect, it } from 'vitest';

// constants
import { OUTCOME_PIPELINE_DIFFERENTIAL } from '@Constants/outcomePipelineConstants';
import { DEFAULTED, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { OLYMPIC } from '@Constants/drawDefinitionConstants';

/**
 * A withdrawn exit releases what it advanced, even into a seat another exit has already awarded.
 *
 * Census w2 9100343 (OLYMPIC 16/11), shrunk from 14 steps to 5. `East|1|4` WALKOVER carries its loser's exit
 * into `West|2|1`; the winner there advances to `West|3|1`, which an exit carried from `East|1|5` has already
 * DEFAULTED towards that seat. Re-scoring `East|1|4` to the other winner withdrew the walkover at `West|2|1`
 * and left the winner in `West|3|1`, advanced out of an undecided matchUp, because a decided matchUp keeps its
 * positions. `getDrawInconsistencies` did not see it. The next relabel, `East|1|2` COMPLETED to a WALKOVER
 * won by the other side, then reported success over WINNING_SIDE_ADVANCEMENT_MISMATCH (F3: since #5156 it
 * returned the refusal instead).
 *
 * The 2026-10-02 relabel ruling already states the rule: a withdrawal releases what the carried exit
 * advanced. A winningSide awarded by an exit on the other side is not a result of that matchUp's own; it
 * names the seat, which stands empty again, pending whoever arrives next.
 */
const drawId = 'withdrawn-exit-releases-seat';
const key = (m: any) => `${m.structureName}|${m.roundNumber}|${m.roundPosition}`;
const find = (k: string) => getDrawMatchUps(drawId).find((m: any) => key(m) === k);
const occupant = (m: any, sideNumber: number) =>
  m.sides.find((side: any) => side.sideNumber === sideNumber)?.participantId;

afterEach(() => setOutcomePipeline());

function score(k: string, outcome: any) {
  const result: any = tournamentEngine.setMatchUpStatus({
    matchUpId: find(k).matchUpId,
    propagateExitStatus: true,
    outcome,
    drawId,
  });
  expect(result.error, k).toBeUndefined();
  expect((tournamentEngine.getDrawInconsistencies({ drawId }) as any).inconsistencies ?? [], k).toEqual([]);
}

it('re-scoring a walkover to the other winner releases the seat its exit had awarded downstream', () => {
  setOutcomePipeline(OUTCOME_PIPELINE_DIFFERENTIAL);
  setSubscriptions({});
  const config = { participantsCount: 11, propagateExitStatus: true, drawSize: 16, drawType: OLYMPIC, seed: 9100343 };
  expect(prepareDraw(config as any, drawId)).toEqual(true);

  score('East|1|5', { matchUpStatus: DEFAULTED, winningSide: 1 });
  score('East|1|2', { winningSide: 1 });
  score('East|1|4', { matchUpStatus: WALKOVER, winningSide: 1 });

  // CONTROL: the carried walkover awarded West|2|1, and its winner stands in West|3|1's awarded seat
  const advanced = occupant(find('West|2|1'), find('West|2|1').winningSide);
  expect(find('West|2|1').matchUpStatus).toEqual(WALKOVER);
  expect(find('West|3|1').sides.map((side: any) => side.participantId)).toContain(advanced);

  score('East|1|4', { winningSide: 2 });

  // the walkover is withdrawn, and so is the seat it won: West|3|1's default stands, pending an arrival
  expect(find('West|2|1').matchUpStatus).toEqual(TO_BE_PLAYED);
  const final = find('West|3|1');
  expect(final.sides.map((side: any) => side.participantId)).not.toContain(advanced);
  expect(final.matchUpStatus).toEqual(DEFAULTED);
  expect(occupant(final, final.winningSide)).toBeUndefined();
});

it('the relabel that followed is then accepted, and the opponent takes the seat', () => {
  setOutcomePipeline(OUTCOME_PIPELINE_DIFFERENTIAL);
  setSubscriptions({});
  const config = { participantsCount: 11, propagateExitStatus: true, drawSize: 16, drawType: OLYMPIC, seed: 9100343 };
  expect(prepareDraw(config as any, drawId)).toEqual(true);

  score('East|1|5', { matchUpStatus: DEFAULTED, winningSide: 1 });
  score('East|1|2', { winningSide: 1 });
  score('East|1|4', { matchUpStatus: WALKOVER, winningSide: 1 });
  score('East|1|4', { winningSide: 2 });

  // East|1|2 COMPLETED -> a WALKOVER won by the other side: its new loser carries the walkover into West|2|1
  const newLoser = occupant(find('East|1|2'), 1);
  score('East|1|2', { matchUpStatus: WALKOVER, winningSide: 2 });

  const semi = find('West|2|1');
  expect(semi.matchUpStatus).toEqual(WALKOVER);
  const opponent = occupant(semi, semi.winningSide);
  expect(opponent).toBeDefined();
  expect(opponent).not.toEqual(newLoser);

  // the opponent arrives in West|3|1's awarded seat and is its winner
  const final = find('West|3|1');
  expect(occupant(final, final.winningSide)).toEqual(opponent);
});
