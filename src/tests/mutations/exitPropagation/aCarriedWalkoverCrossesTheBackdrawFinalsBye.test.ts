import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replayFailure as replay } from '@Tests/testHarness/exitPropagation/sweep';
import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { OUTCOME_PIPELINE_DIFFERENTIAL } from '@Constants/outcomePipelineConstants';
import { BYE, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * A CARRIED WALKOVER CROSSES THE BACKDRAW FINAL'S BYE INTO THE GRAND FINAL (census de 9304724, DOUBLE_ELIMINATION 8/6,
 * both arms; found by the outcome v2 S0 census replay under `differential`; CA ruling 2026-10-23).
 *
 * Three first-round matchUps are double walkovers or BYEs, so the whole Backdraw is BYEs. `Main|3|1`, the Main
 * structure's final, is recorded WALKOVER won by P5. P6, who lost by walkover, drops into the Backdraw final, which holds
 * a BYE, and passes it into the grand final (`Main|4|1`) against P5. P6 carries the walkover, so the grand final is a
 * WALKOVER won by P5.
 *
 * v1 left the grand final TO_BE_PLAYED: RULE 1 re-propagates a carried exit onto wherever the carrier lands, and looked
 * for that only in the holder's own structure. The Backdraw final is that structure's last round; its winner goes on
 * across the DOUBLE_ELIMINATION link. v2 already planned it, and the differential reported the divergence.
 */
type Step = [string, any];
const config = {
  drawType: DOUBLE_ELIMINATION,
  propagateExitStatus: true,
  participantsCount: 6,
  drawSize: 8,
  seed: 9304724,
};
const steps: Step[] = [
  ['Main|1|3', { winningSide: 2 }],
  ['Main|1|2', { matchUpStatus: DOUBLE_WALKOVER }],
  ['Main|1|3', { winningSide: 1 }],
  ['Main|1|3', { matchUpStatus: DOUBLE_WALKOVER }],
];
const FINAL_WALKOVER: Step = ['Main|3|1', { matchUpStatus: WALKOVER, winningSide: 1 }];
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const find = (drawId: string, key: string) =>
  getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === key);
const enter = (drawId: string, [key, outcome]: Step) =>
  observeMutation({ propagateExitStatus: true, matchUpId: find(drawId, key).matchUpId, outcome, drawId });

it('the census schedule replays clean', () => {
  setSubscriptions({});
  const schedule = [...steps, FINAL_WALKOVER].map(([key, outcome]) => {
    const [structureName, roundNumber, roundPosition] = key.split('|');
    return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
  });
  expect(replay(config, schedule, 'carried-walkover-backdraw-bye-replay')).toBeNull();
});

it('the grand final is a walkover won by the Main final winner, with v2 agreeing', () => {
  setSubscriptions({});
  const drawId = 'carried-walkover-backdraw-bye';
  expect(prepareDraw(config, drawId)).toEqual(true);
  for (const step of steps) expect(enter(drawId, step).error).toBeUndefined();
  // CONTROL: the Backdraw is all BYEs, and the Backdraw final is one
  expect(find(drawId, 'Backdraw|4|1').matchUpStatus).toEqual(BYE);
  const mainFinal = find(drawId, 'Main|3|1');
  const winner = mainFinal.sides.find((side: any) => side.sideNumber === 1).participantId;
  const carrier = mainFinal.sides.find((side: any) => side.sideNumber === 2).participantId;

  setOutcomePipeline(OUTCOME_PIPELINE_DIFFERENTIAL);
  const result = enter(drawId, FINAL_WALKOVER);
  expect(result.thrown, 'v2 and v1 disagree').toBeUndefined();
  expect(result.error).toBeUndefined();

  const grandFinal = find(drawId, 'Main|4|1');
  const sideOf = (participantId: string) =>
    grandFinal.sides.find((side: any) => side.participantId === participantId)?.sideNumber;
  // CONTROL: the carrier crossed the BYE into the grand final, opposite the Main final's winner
  expect(sideOf(carrier)).toBeDefined();
  expect(grandFinal).toMatchObject({ matchUpStatus: WALKOVER, winningSide: sideOf(winner) });
});
