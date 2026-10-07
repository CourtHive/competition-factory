import { getDrawMatchUps, clearOutcome } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { OUTCOME_PIPELINE_DIFFERENTIAL } from '@Constants/outcomePipelineConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * Census w2 9100389 (DOUBLE_ELIMINATION 8/8), the steps that matter of its first fifteen.
 *
 * A Backdraw double default sends a DEFAULTED on to `Backdraw|3|1`, which the Main dp5 loser wins; a Main double
 * walkover then places a propagated BYE beside them at `Backdraw|4|1`, and they pass it over the link into the Main
 * final, on their own Main drawPosition (the DOUBLE_ELIMINATION rematch). Undoing the Backdraw double default takes
 * them back out of the final — and took them out of Main drawPosition 5 as well, under a COMPLETED `Main|1|3`
 * (DRAW_POSITION_UNASSIGNED). `removeDirectedWinner` read "one instance of the position left in Main" as "placed
 * here by the link", after `releaseLinkedWinnerAdvancement` had already taken the final's instance back.
 */
const drawId = 'backdraw-champion-keeps-main-seat';
const key = (m: any) => `${m.structureName}|${m.roundNumber}|${m.roundPosition}`;
const find = (k: string) => getDrawMatchUps(drawId).find((m: any) => key(m) === k);

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

it('undoing the Backdraw double exit that sent the champion to the final leaves their Main seat', () => {
  setOutcomePipeline(OUTCOME_PIPELINE_DIFFERENTIAL);
  setSubscriptions({});
  const config = {
    drawType: DOUBLE_ELIMINATION,
    propagateExitStatus: true,
    participantsCount: 8,
    seed: 9100389,
    drawSize: 8,
  };
  expect(prepareDraw(config as any, drawId)).toEqual(true);

  score('Main|1|2', { winningSide: 2 });
  score('Main|1|4', { matchUpStatus: DOUBLE_WALKOVER });
  score('Main|1|4', clearOutcome);
  score('Main|1|3', { matchUpStatus: DEFAULTED, winningSide: 1 });
  score('Main|1|2', { matchUpStatus: WALKOVER, winningSide: 1 });
  score('Main|1|4', { matchUpStatus: DOUBLE_WALKOVER });
  score('Main|1|1', { winningSide: 2 });
  score('Main|1|2', { winningSide: 2 });
  score('Main|1|4', { matchUpStatus: DOUBLE_DEFAULT });
  score('Main|1|3', { winningSide: 2 });
  score('Backdraw|1|2', { matchUpStatus: DOUBLE_DEFAULT });

  // the DEFAULTED the double default sent on waits for the Main dp5 loser, who is behind the Main|2|1 loser's seat
  const champion = find('Main|1|3').sides.find((side: any) => side.sideNumber === 1).participantId;
  expect(champion).toBeDefined();
  expect(find('Backdraw|3|1').matchUpStatus).toEqual(DEFAULTED);
  expect(find('Backdraw|3|1').winningSide).toBeUndefined();

  score('Main|2|1', { matchUpStatus: DOUBLE_WALKOVER });

  // the control: the double walkover's BYE frees them, they win the DEFAULTED, its BYE lands beside them at the
  // Backdraw final, and they pass it into the Main final on Main dp5
  expect(find('Backdraw|3|1').winningSide).toEqual(1);
  expect(find('Backdraw|3|1').sides.find((side: any) => side.sideNumber === 1).participantId).toEqual(champion);
  const backdrawFinal = find('Backdraw|4|1');
  expect(backdrawFinal.sides.map((side: any) => side.bye ?? side.participantId)).toEqual([true, champion]);
  const final = find('Main|4|1');
  expect(final.drawPositions).toEqual([5, 6]);
  expect(final.sides.find((side: any) => side.sideNumber === 1).participantId).toEqual(champion);

  score('Backdraw|1|2', clearOutcome);

  // out of the Backdraw final and the Main final, and still at Main dp5
  expect(find('Backdraw|3|1').winningSide).toBeUndefined();
  expect(find('Backdraw|4|1').drawPositions).toEqual([1]);
  expect(find('Main|4|1').drawPositions).toEqual([6]);
  const mainR1 = find('Main|1|3');
  expect(mainR1.drawPositions).toEqual([5, 6]);
  expect(mainR1.sides.find((side: any) => side.sideNumber === 1).participantId).toEqual(champion);
  const { positionAssignments } = tournamentEngine.getPositionAssignments({ drawId, structureId: mainR1.structureId });
  expect(positionAssignments.find((assignment: any) => assignment.drawPosition === 5)?.participantId).toEqual(champion);
  expect((tournamentEngine.getDrawInconsistencies({ drawId }) as any).valid).toEqual(true);
});
