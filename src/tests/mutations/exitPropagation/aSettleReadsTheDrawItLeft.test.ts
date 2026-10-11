import { getDrawDefinition, getDrawMatchUps, hash } from '@Tests/testHarness/exitPropagation/transitions';
import { reconcileStaleExitOrigins } from '@Mutate/matchUps/matchUpStatus/reconcileStaleExitOrigins';
import { getTournamentRecords, setSubscriptions } from '@Global/state/globalState';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { decorateResult } from '@Functions/global/decorateResult';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { CANNOT_CHANGE_OUTCOME } from '@Constants/errorConditionConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * THE SETTLE STEP READS THE DRAW THE CALL LEFT, AND A REFUSAL SETTLES NOTHING — census family F2, 2026-10-11.
 *
 * Census seed 20464093 (DOUBLE_ELIMINATION 8/8, `propagateExitStatus`), shrunk to its four steps on `dev` 43ced17b72.
 * The double default at `Main|1|3` sends both its participants into the Backdraw, where `Backdraw|1|2` converges two
 * defaults and the exit it produces is relayed on to `Backdraw|3|1`. Correcting `Main|1|3` to a walkover takes that
 * relay's ground away: `Backdraw|2|2`, which it passed, is no longer a BYE, so the entry on `Backdraw|3|1` is stale and
 * the call's own settle step (`reconcileStaleExitOrigins`) withdraws it.
 *
 * It did not. The settle step was handed `result.context.matchUpsMap`, and `decorateResult` deep-copied every context:
 * the map described the draw as the direction left it, and what the reconciliation wrote landed on objects no longer
 * in it. `Backdraw|3|1` stayed DEFAULTED. The next call, `Backdraw|1|2` won by side 1, is refused
 * (`CANNOT_CHANGE_OUTCOME`), and its settle step — run after the refusal — repaired the stale entry: a refusal that
 * wrote. That is 53 of the 92 F2 instances; the settle running after a refusal at all is 55.
 *
 * Falsified, one change at a time: without the refusal gate, the planted stale entry is repaired by the refused call;
 * with contexts deep-copied again, the `decorateResult` assertion fails; with contexts deep-copied AND the settle handed
 * the context's map, the correction also leaves the stale entry and differs from forward play at `Backdraw|3|1`. Either
 * guard on the stale origin closes it alone, so handing the settle the (now live) context map fails nothing. On `dev`
 * before the change all four fail.
 */
const key = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const CONFIG = {
  drawType: DOUBLE_ELIMINATION,
  propagateExitStatus: true,
  participantsCount: 8,
  seed: 20464093,
  drawSize: 8,
};
type Step = [string, any];

const CORRECTION: Step[] = [
  ['Main|1|2', { matchUpStatus: DEFAULTED, winningSide: 1 }],
  ['Main|1|3', { matchUpStatus: DOUBLE_DEFAULT }],
  ['Main|1|1', { matchUpStatus: DEFAULTED, winningSide: 1 }],
  ['Main|1|3', { matchUpStatus: WALKOVER, winningSide: 2 }],
];
// the same results recorded as they finally stand, never through the double default
const FORWARD: Step[] = [CORRECTION[0], CORRECTION[2], CORRECTION[3]];
const REFUSED: Step = ['Backdraw|1|2', { winningSide: 1 }];

const at = (drawId: string, coordinates: string) =>
  getDrawMatchUps(drawId).find((matchUp: any) => key(matchUp) === coordinates);

function apply(drawId: string, [coordinates, outcome]: Step) {
  const target = at(drawId, coordinates);
  expect(target, coordinates).toBeDefined();
  const before = JSON.stringify(getDrawDefinition(drawId));
  const result = tournamentEngine.setMatchUpStatus({
    propagateExitStatus: true,
    matchUpId: target.matchUpId,
    outcome,
    drawId,
  });
  return { error: result.error, mutated: JSON.stringify(getDrawDefinition(drawId)) !== before };
}

function play(drawId: string, steps: Step[]) {
  setSubscriptions({});
  expect(prepareDraw(CONFIG, drawId)).toEqual(true);
  for (const step of steps) expect(apply(drawId, step).error, step[0]).toBeUndefined();
}

const view = (drawId: string) =>
  Object.fromEntries(
    getDrawMatchUps(drawId).map((matchUp: any) => [
      key(matchUp),
      [
        matchUp.matchUpStatus,
        matchUp.winningSide,
        (matchUp.sides ?? []).map((side: any) => (side.bye ? 'BYE' : side.participant?.participantName)),
      ],
    ]),
  );

/** would the reconciliation, asked of the draw as it stands, change anything? Asked of a copy */
function hasStaleOrigin(drawId: string) {
  const copy = structuredClone(getDrawDefinition(drawId));
  const before = hash(copy);
  reconcileStaleExitOrigins({ drawDefinition: copy });
  return hash(copy) !== before;
}

/** the STORED matchUp, on the live record — the engine's getters return copies */
function storedMatchUp(drawId: string, matchUpId: string) {
  for (const record of Object.values(getTournamentRecords()) as any[]) {
    for (const event of record.events ?? []) {
      const drawDefinition = event.drawDefinitions?.find((draw: any) => draw.drawId === drawId);
      for (const structure of drawDefinition?.structures ?? []) {
        const matchUp = structure.matchUps?.find((candidate: any) => candidate.matchUpId === matchUpId);
        if (matchUp) return matchUp;
      }
    }
  }
  return undefined;
}

it('a context carries references: decorateResult does not copy what it is handed', () => {
  const matchUpsMap = { drawMatchUps: [{ matchUpId: 'm' }] };
  const result: any = decorateResult({ result: {}, context: { matchUpsMap, empty: undefined } });
  expect(result.context.matchUpsMap).toBe(matchUpsMap);
  expect('empty' in result.context).toEqual(false);
});

it('the correction leaves no stale origin, and the draw forward play leaves', () => {
  play('corrected', CORRECTION);
  expect(hasStaleOrigin('corrected')).toEqual(false);
  expect(at('corrected', 'Backdraw|3|1').matchUpStatus).toEqual(TO_BE_PLAYED);
  // read before the next draw is prepared: each `prepareDraw` replaces the tournament
  const corrected = view('corrected');

  play('forward', FORWARD);
  expect(corrected).toEqual(view('forward'));
});

it('the refusal that followed it changes nothing', () => {
  play('refused', CORRECTION);
  const refused = apply('refused', REFUSED);
  expect(refused.error).toEqual(CANNOT_CHANGE_OUTCOME);
  expect(refused.mutated).toEqual(false);
});

it('a refusal repairs nothing, even a stale entry an earlier call left', () => {
  play('planted', CORRECTION);
  // the entry the earlier call left before the fix: the produced default relayed past a seat that is no longer a BYE
  const relay = storedMatchUp('planted', at('planted', 'Backdraw|3|1').matchUpId);
  relay.matchUpStatus = DEFAULTED;
  relay.sideExitProvenance = {
    2: {
      sourceMatchUpId: at('planted', 'Backdraw|1|2').matchUpId,
      previousMatchUpStatus: DOUBLE_DEFAULT,
      matchUpStatus: DEFAULTED,
    },
  };
  expect(hasStaleOrigin('planted')).toEqual(true);

  const refused = apply('planted', REFUSED);
  expect(refused.error).toEqual(CANNOT_CHANGE_OUTCOME);
  expect(refused.mutated).toEqual(false);
  // still there for a call that is accepted to settle
  expect(hasStaleOrigin('planted')).toEqual(true);
});
