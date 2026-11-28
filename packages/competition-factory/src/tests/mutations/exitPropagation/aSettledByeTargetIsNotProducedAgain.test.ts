import { playCall, prepareCall } from '@Tests/testHarness/outcome/recordedCallHarness';
import { findTarget, HELD_BYE_REMOVALS } from '@Tests/testHarness/outcome/directionFixtures';
import { deleteNotices, setSubscriptions } from '@Global/state/globalState';
import { setOutcomePipeline } from '@Tests/testHarness/outcomeModes';
import { afterEach, describe, expect, it, vi } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { setClock } from '@Tools/clock';

// constants and types
import { BYE, COMPLETED, DOUBLE_DEFAULT, WALKOVER } from '@Constants/matchUpStatusConstants';
import { MODIFY_DRAW_DEFINITION, MODIFY_MATCHUP } from '@Constants/topicConstants';
import type { OutcomePipelineMode } from '@Tests/testHarness/outcomeModes';
import type { Scenario } from '@Tests/testHarness/outcome/directionFixtures';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Tests/testHarness/outcomeModes';

// counts v1's matchUp writes on the stored record (`directionCounter.ts`: a write to a recorded call's copy is not one)
vi.mock('@Mutate/matchUps/matchUpStatus/setMatchUpState', async (importOriginal) => {
  const actual: any = await importOriginal();
  const { v1Writes } = await import('@Tests/testHarness/outcome/directionCounter');
  return {
    ...actual,
    setMatchUpState: (...args: any[]) => {
      v1Writes.count += 1;
      return actual.setMatchUpState(...args);
    },
  };
});

/**
 * A CONVERGENCE WHOSE WINNER TARGET IS A SETTLED BYE IS NOT PRODUCED AGAIN (`doubleExitAdvancement.ts`
 * `strandsItsExit`, `settledByeEnd`).
 *
 * `settleHeldExits` asks of the settled draw which convergences have not produced their exit: a double exit whose two
 * sides each record a carried exit, with a winner target that records nothing from it and has no result. A BYE records
 * no produced exit. So a converged DOUBLE_ELIMINATION Main final, whose Decider holds the propagated BYE with nobody in
 * it, read as not having produced for as long as it stood: every later `setMatchUpStatus` anywhere in the draw
 * produced there again, writing the Decider's BYE over itself value for value, announcing the Decider
 * (`modifyMatchUp`) and stamping it and its structure with the later call's instant.
 *
 * Measured 2026-11-18 (v1 alone, DOUBLE_ELIMINATION 5 of 8, seed 9300184, after the Backdraw's double default): the
 * same result entered again on `Main|1|3`, then on `Main|2|2`, each announced `Decider|1|1` and moved its `updatedAt`
 * and its structure's, and changed no other field. The 20 calls of the batch 5 ledger that a settle predicate held to
 * v1 for `settleHeldExits` are all this draw shape.
 *
 * The target is owed nothing where it is the BYE it holds (no winner, no score), nobody is in it, and no matchUp lies
 * beyond it: there is nothing a production could move. It is then not asked again.
 */

afterEach(() => {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setSubscriptions({ subscriptions: {} });
  deleteNotices();
  setClock();
});

const matchUps = () => tournamentEngine.allDrawMatchUps({ drawId: 'd', inContext: true }).matchUps as any[];
const at = (structureName: string, roundNumber: number, roundPosition: number) =>
  matchUps().find(
    (m) => m.structureName === structureName && m.roundNumber === roundNumber && m.roundPosition === roundPosition,
  );
const score = (params: Record<string, unknown>) =>
  expect(tournamentEngine.setMatchUpStatus({ drawId: 'd', ...params }).success, JSON.stringify(params)).toEqual(true);

/** a DOUBLE_ELIMINATION draw of 8 with 5, the Main semifinal a double default (ledger: de 9300184) */
function heldExit() {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: DOUBLE_ELIMINATION, participantsCount: 5, drawSize: 8, drawId: 'd' }],
    nonRandom: 9300184,
    setState: true,
  });
  const exits = { propagateExitStatus: true };
  score({ ...exits, matchUpId: at('Main', 1, 3).matchUpId, outcome: { winningSide: 1 } });
  score({ ...exits, matchUpId: at('Main', 2, 1).matchUpId, outcome: { matchUpStatus: WALKOVER, winningSide: 1 } });
  score({ ...exits, matchUpId: at('Main', 2, 2).matchUpId, outcome: { winningSide: 2 } });
  score({ ...exits, matchUpId: at('Main', 3, 1).matchUpId, outcome: { matchUpStatus: DOUBLE_DEFAULT } });
  return {
    ...exits,
    matchUpId: at('Backdraw', 3, 1).matchUpId,
    outcome: { matchUpStatus: DOUBLE_DEFAULT },
    drawId: 'd',
  };
}

/** the same double default asked for again where it stands */
function askedAgain() {
  const params = heldExit();
  score(structuredClone(params));
  return params;
}

/** a decided result made a double exit, its loser held beside a structural BYE (C21, policy off) */
const fromScenario =
  ({ drawProfile, setup = [], steps, policyDefinitions }: Scenario) =>
  () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ ...drawProfile, drawId: 'd' }],
      nonRandom: 1,
      setState: true,
    });
    if (policyDefinitions) tournamentEngine.attachPolicies({ policyDefinitions });
    for (const { target, outcome, params } of [...setup, ...steps.slice(0, -1)])
      score({ matchUpId: findTarget(target), outcome: structuredClone(outcome), ...params });
    const { target, outcome, params } = steps[steps.length - 1];
    return { drawId: 'd', matchUpId: findTarget(target), outcome, ...params };
  };
const CASCADES = HELD_BYE_REMOVALS.filter(
  ([label]) =>
    label.includes('DOUBLE_ELIMINATION 2/8 R3/1') && label.endsWith('policy off') && label.includes('DOUBLE_'),
);

const SHAPES: [string, () => Record<string, unknown>][] = [
  ['a double exit beside a held exit (ledger: exit)', heldExit],
  ['a double exit asked for again (ledger: settle)', askedAgain],
  ...CASCADES.map(([label, scenario]): [string, () => Record<string, unknown>] => [
    `${label} (ledger: cascade)`,
    fromScenario(scenario),
  ]),
];

const MODES: OutcomePipelineMode[] = [OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL];

it('CONTROL: the cascade rows are the four C21 rows of the ledger', () => expect(CASCADES).toHaveLength(4));

describe('a later call leaves the settled Decider alone', () => {
  it.each(SHAPES.flatMap(([label, build]) => MODES.map((mode) => [label, mode, build] as const)))(
    '%s, under %s',
    (_label, mode, build) => {
      const call = prepareCall(build);
      setOutcomePipeline(mode);
      setClock('2026-10-25T00:01:00.000Z');
      expect(tournamentEngine.setState(structuredClone(call.prepared)).success).toEqual(true);
      score(structuredClone(call.params));

      // CONTROL: the Main final converged, and its Decider is the BYE it holds, with nobody in it
      const final = at('Main', 4, 1);
      const decider = at('Decider', 1, 1);
      expect(final.winnerMatchUpId).toEqual(decider.matchUpId);
      expect(final.matchUpStatus).toEqual(call.params.outcome && (call.params.outcome as any).matchUpStatus);
      expect(decider.matchUpStatus).toEqual(BYE);
      expect(decider.sides.some((side: any) => side.participantId)).toEqual(false);

      const storedDecider = () => {
        const { drawDefinition } = tournamentEngine.getEvent({ drawId: 'd' });
        const structure = drawDefinition.structures.find((s: any) => s.structureName === 'Decider');
        return JSON.stringify({ updatedAt: structure.updatedAt, matchUp: structure.matchUps[0] });
      };
      // later calls, each its own engine call at a later instant: a decided result entered again where there is one,
      // or the call itself asked again
      const others = matchUps().filter(
        (m) =>
          m.matchUpStatus === COMPLETED &&
          m.matchUpId !== call.params.matchUpId &&
          m.sides.filter((side: any) => side.participantId).length === 2,
      );
      const later = [
        ...others.map((m) => ({ matchUpId: m.matchUpId, outcome: { winningSide: m.winningSide, score: m.score } })),
        structuredClone(call.params),
        structuredClone(call.params),
      ].slice(0, 3);
      expect(later.length).toBeGreaterThan(1);
      for (const [index, params] of later.entries()) {
        const before = storedDecider();
        deleteNotices();
        const announced: string[] = [];
        setSubscriptions({
          subscriptions: {
            [MODIFY_MATCHUP]: (payloads: any[]) => payloads.forEach((p) => announced.push(p.matchUp.matchUpId)),
            [MODIFY_DRAW_DEFINITION]: () => undefined,
          },
        });
        setClock(`2026-10-25T00:0${index + 2}:00.000Z`);
        score({ ...params });
        setSubscriptions({ subscriptions: {} });
        // nothing of the Decider moved, its stamp included, and it was not announced
        expect(storedDecider()).toEqual(before);
        expect(announced).not.toContain(decider.matchUpId);
      }
    },
  );
});

describe('the call itself is v2s, and leaves what v1 leaves', () => {
  it.each(SHAPES)('%s', (_label, build) => {
    const call = prepareCall(build);
    const v1 = playCall(OUTCOME_PIPELINE_V1, call);
    expect(v1.result.success, JSON.stringify(v1.result)).toEqual(true);
    const compared = playCall(OUTCOME_PIPELINE_DIFFERENTIAL, call);
    const v2 = playCall(OUTCOME_PIPELINE_V2, call);
    expect(v2.v1Writes).toEqual(0);
    for (const actual of [compared, v2]) expect({ ...actual, v1Writes: 0 }).toEqual({ ...v1, v1Writes: 0 });
  });
});
