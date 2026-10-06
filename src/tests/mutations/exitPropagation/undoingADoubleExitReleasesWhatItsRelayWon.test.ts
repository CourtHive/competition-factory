import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, expect, it } from 'vitest';

// constants
import { BYE, DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { OUTCOME_PIPELINE_DIFFERENTIAL } from '@Constants/outcomePipelineConstants';
import { DOUBLE_ELIMINATION, FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';

/**
 * A matchUp left undecided by a removal releases the winner its result had advanced.
 *
 * Census w1 9000562 (FEED_IN_CHAMPIONSHIP 16/11), shrunk from 30 steps to 7, found by `ADVANCED_FROM_UNDECIDED`.
 * `Main|2|3` a DOUBLE_WALKOVER puts a propagated BYE in `Consolation|2|2`, and the walkover a loser carries there
 * passes it into `Consolation|3|1`, deciding it: its other occupant wins and advances to `Consolation|4|1`.
 * Re-scoring `Main|2|3` as a played result clears that BYE, which takes the carrier back out of `3|1`, and `3|1`
 * reverts to TO_BE_PLAYED, holding `Main|2|3`'s loser opposite its old winner. The winner stayed in `4|1`, advanced
 * out of an undecided matchUp, since only the removed position's own advancements were taken back.
 *
 * Census de 9301695 (DOUBLE_ELIMINATION 16/15), shrunk from 30 steps to 5, is the same rule past a BYE: the double
 * exit's propagated BYE let `Backdraw|2|3`'s occupant pass into `3|2` and `4|2`, and undoing it left them there.
 */
const drawId = 'undo-double-exit-relay';
const key = (m: any) => `${m.structureName}|${m.roundNumber}|${m.roundPosition}`;
const find = (k: string) => getDrawMatchUps(drawId).find((m: any) => key(m) === k);
const occupants = (m: any) => m.sides.map((side: any) => side.participantId).filter(Boolean);

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

it('undoing a double exit releases what the walkover it relayed past a BYE had advanced', () => {
  setOutcomePipeline(OUTCOME_PIPELINE_DIFFERENTIAL);
  setSubscriptions({});
  const config = {
    drawType: FEED_IN_CHAMPIONSHIP,
    propagateExitStatus: true,
    participantsCount: 11,
    seed: 9000562,
    drawSize: 16,
  };
  expect(prepareDraw(config as any, drawId)).toEqual(true);

  score('Main|2|4', { matchUpStatus: WALKOVER, winningSide: 2 });
  score('Main|1|2', { winningSide: 1 });
  score('Main|1|5', { winningSide: 1 });
  score('Main|1|4', { matchUpStatus: WALKOVER, winningSide: 2 });
  score('Main|2|3', { matchUpStatus: WALKOVER, winningSide: 1 });
  score('Main|2|3', { matchUpStatus: DOUBLE_WALKOVER });

  // CONTROL: the walkover relayed past the BYE decided Consolation|3|1, and its winner stands in 4|1
  const relayed = find('Consolation|3|1');
  expect(relayed.matchUpStatus).toEqual(WALKOVER);
  const winner = relayed.sides.find((side: any) => side.sideNumber === relayed.winningSide).participantId;
  expect(occupants(find('Consolation|4|1'))).toContain(winner);

  score('Main|2|3', { winningSide: 2 });

  // Consolation|3|1 is to be played again, by its old winner and Main|2|3's loser, and 4|1 no longer holds the winner
  const reverted = find('Consolation|3|1');
  expect(reverted.matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(occupants(reverted)).toContain(winner);
  expect(occupants(find('Consolation|4|1'))).not.toContain(winner);
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  expect((getDrawInconsistencies({ drawDefinition, drawId }) as any).inconsistencies ?? []).toEqual([]);
});

it('undoing a double exit releases what its propagated BYE had advanced', () => {
  setOutcomePipeline(OUTCOME_PIPELINE_DIFFERENTIAL);
  setSubscriptions({});
  const config = {
    drawType: DOUBLE_ELIMINATION,
    propagateExitStatus: true,
    participantsCount: 15,
    seed: 9301695,
    drawSize: 16,
  };
  expect(prepareDraw(config as any, drawId)).toEqual(true);

  score('Main|1|3', { matchUpStatus: WALKOVER, winningSide: 2 });
  score('Main|1|4', { matchUpStatus: WALKOVER, winningSide: 1 });
  score('Main|1|5', { matchUpStatus: DOUBLE_WALKOVER });
  score('Main|1|4', { winningSide: 2 });

  // CONTROL: Backdraw|2|3 is a BYE, and its occupant has passed it into 3|2 and 4|2
  const passed = find('Backdraw|2|3');
  expect(passed.matchUpStatus).toEqual(BYE);
  const occupant = occupants(passed)[0];
  expect(occupants(find('Backdraw|3|2'))).toContain(occupant);
  expect(occupants(find('Backdraw|4|2'))).toContain(occupant);

  score('Main|1|5', { winningSide: 2 });

  // the BYE is gone: the occupant waits in 2|3 for the arrival it now needs, and stands nowhere further on
  expect(find('Backdraw|2|3').matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(occupants(find('Backdraw|2|3'))).toContain(occupant);
  expect(occupants(find('Backdraw|3|2'))).not.toContain(occupant);
  expect(occupants(find('Backdraw|4|2'))).not.toContain(occupant);
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  expect((getDrawInconsistencies({ drawDefinition, drawId }) as any).inconsistencies ?? []).toEqual([]);
});
