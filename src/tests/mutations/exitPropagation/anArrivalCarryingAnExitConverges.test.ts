import { getDrawDefinition, getDrawMatchUps, hash } from '@Tests/testHarness/exitPropagation/transitions';
import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { OUTCOME_PIPELINE_DIFFERENTIAL } from '@Constants/outcomePipelineConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * An arrival carrying an exit CONVERGES with the exit standing where it lands; it never takes it (F3, CA
 * 2026-10-04: fix the arrival itself).
 *
 * The early-exit census arm (`exitBeforeArrivalCensus`), COMPASS 8/7 seed 9700004. `East|1|4`'s loser carries a
 * WALKOVER into West, passes a BYE and reaches `West|1|2`, which holds a carried DEFAULTED pending for its empty
 * side. Read as an ordinary arrival the loser took that walkover and advanced into `West|2|1`, a DEFAULTED a
 * director had recorded towards its vacant seat; `progressExitStatus` RULE 4's convergence was then refused
 * after the draw had moved. Now the arrival is placed and nothing is awarded: `West|1|2` converges, its produced
 * exit reaches `West|2|1`, and there it meets the recorded exit, so `West|2|1` converges too. The defaulted
 * participant never wins it (factory-e2, 2026-10-04: *"a player recorded as WALKOVER/DEFAULTED has exited and
 * can't later win that matchUp"*).
 */
const drawId = 'arrival-converges';
const key = (m: any) => `${m.structureName}|${m.roundNumber}|${m.roundPosition}`;
const find = (k: string) => getDrawMatchUps(drawId).find((m: any) => key(m) === k);

afterEach(() => setOutcomePipeline());

it('a loser carrying a walkover converges where it lands, and so does the recorded exit one round on', () => {
  setOutcomePipeline(OUTCOME_PIPELINE_DIFFERENTIAL);
  setSubscriptions({});
  const config = { participantsCount: 7, propagateExitStatus: true, drawSize: 8, drawType: COMPASS, seed: 9700004 };
  expect(prepareDraw(config as any, drawId)).toEqual(true);

  const steps: [string, any][] = [
    ['East|1|3', { matchUpStatus: DEFAULTED, winningSide: 2 }],
    ['East|1|2', { winningSide: 1 }],
    ['West|2|1', { matchUpStatus: DEFAULTED, winningSide: 2 }],
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

  // CONTROL: West|2|1 is a recorded exit whose occupant has defaulted, awaiting its other seat
  const recorded = find('West|2|1');
  const defaulted = recorded.sides.find((side: any) => side.participantId)?.participantId;
  expect(recorded.matchUpStatus).toEqual(DEFAULTED);
  expect(recorded.sides.find((side: any) => side.participantId).sideNumber).not.toEqual(recorded.winningSide);

  const before = hash(getDrawDefinition(drawId));
  const result: any = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: WALKOVER, winningSide: 1 },
    matchUpId: find('East|1|4').matchUpId,
    propagateExitStatus: true,
    drawId,
  });
  expect(result.error).toBeUndefined();
  expect(hash(getDrawDefinition(drawId))).not.toEqual(before);

  const landed = find('West|1|2');
  expect(landed.matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(landed.winningSide).toBeUndefined();

  const onward = find('West|2|1');
  expect(onward.matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(onward.winningSide).toBeUndefined();
  expect(onward.sides.map((side: any) => side.participantId)).toContain(defaulted);
  expect((tournamentEngine.getDrawInconsistencies({ drawId }) as any).inconsistencies ?? []).toEqual([]);
});
