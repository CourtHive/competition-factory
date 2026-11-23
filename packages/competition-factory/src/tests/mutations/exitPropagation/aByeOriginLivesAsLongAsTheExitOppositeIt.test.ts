import {
  getDrawMatchUps,
  getDrawDefinition,
  observeMutation,
  clearOutcome,
  projectDraw,
} from '@Tests/testHarness/exitPropagation/transitions';
import { FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { BYE, DOUBLE_WALKOVER, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * A BYE ORIGIN LIVES AS LONG AS THE EXIT OPPOSITE IT (census A1 group R5, case 22: FEED_IN_CHAMPIONSHIP 16/11, seed
 * 20532286).
 *
 * A produced exit meeting a BYE writes a pair: its own entry, and opposite it the BYE's origin
 * (`{ matchUpStatus: BYE, previousMatchUpStatus: BYE }`). Nothing owned that second entry. `Consolation|2|2`'s double
 * walkover sends its walkover into the BYE at `Consolation|3|1`; its clear withdrew the walkover there and kept the BYE
 * origin, on a BYE matchUp that had held no provenance before. `removeDoubleExit` now withdraws the origin with the
 * exit opposite it, and the round trip restores the draw exactly.
 *
 * The other half of the rule (keep the origin in `positionClear` while the exit opposite stands, census case 16) is
 * not taken: the same shape, a seat's BYE taken back opposite a standing produced exit, holds the origin in case 16's
 * canonical draw and not in `aClearedSideIsReadFromStructure`'s direct entry (9302775), so which is right depends on
 * when the BYE origin was first written (census fork F3).
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const find = (drawId: string, key: string) =>
  getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === key);
const view = (matchUp: any) => ({
  drawPositions: (matchUp.drawPositions ?? []).filter(Boolean),
  sideExitProvenance: matchUp.sideExitProvenance,
  matchUpStatus: matchUp.matchUpStatus,
  winningSide: matchUp.winningSide,
});

/** The census replay: a step whose matchUp does not hold two participants is skipped; a refusal is part of the schedule. */
function schedule({ config, policy, steps, drawId }: { config: any; policy?: any; steps: Step[]; drawId: string }) {
  setSubscriptions({});
  expect(prepareDraw(config, drawId, policy)).toEqual(true);
  for (const step of steps) {
    const target = find(drawId, coordinate(step));
    if ((target?.sides ?? []).filter((side: any) => side?.participantId).length !== 2) continue;
    observeMutation({ propagateExitStatus: true, matchUpId: target.matchUpId, outcome: step.outcome, drawId });
  }
}

/** Apply the probe to the scheduled draw, then clear it. */
function probeAndClear(drawId: string, probe: Step) {
  const { matchUpId } = find(drawId, coordinate(probe));
  const forward = observeMutation({ propagateExitStatus: true, matchUpId, outcome: probe.outcome, drawId });
  expect(forward.error).toBeUndefined();
  const cleared = observeMutation({ propagateExitStatus: true, matchUpId, outcome: clearOutcome, drawId });
  expect(cleared.error).toBeUndefined();
}

const CASE_22 = {
  config: {
    drawType: FEED_IN_CHAMPIONSHIP,
    propagateExitStatus: true,
    participantsCount: 11,
    drawSize: 16,
    seed: 20532286,
  },
  steps: [
    at('Main|1|4', { winningSide: 1 }),
    at('Main|1|5', { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } }),
    at('Main|1|7', { matchUpStatus: DOUBLE_WALKOVER }),
    at('Main|2|2', { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } }),
    at('Main|2|1', { matchUpStatus: DOUBLE_WALKOVER }),
    at('Main|2|3', { winningSide: 2 }),
    at('Main|3|2', { matchUpStatus: WALKOVER, winningSide: 1 }),
    at('Consolation|2|3', { winningSide: 1 }),
    at('Consolation|2|3', { matchUpStatus: WALKOVER, winningSide: 2 }),
  ],
  probe: at('Consolation|2|2', { matchUpStatus: DOUBLE_WALKOVER }),
};

it('a double walkover into a BYE, cleared, leaves the BYE matchUp without the origin it paired', () => {
  const drawId = 'bye-origin-withdrawn';
  schedule({ ...CASE_22, drawId });
  const before = projectDraw(getDrawDefinition(drawId));
  const held = view(find(drawId, 'Consolation|3|1'));
  expect(held.matchUpStatus).toEqual(BYE);
  expect(held.sideExitProvenance).toBeUndefined();
  probeAndClear(drawId, CASE_22.probe);
  expect(view(find(drawId, 'Consolation|3|1'))).toEqual(held);
  expect(projectDraw(getDrawDefinition(drawId))).toEqual(before);
});
