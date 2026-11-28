import {
  CARRIED,
  CONSOLATION,
  MAIN,
  R1,
  cleared,
  play,
  walkover,
  won,
} from '@Tests/testHarness/outcome/directionFixtures';
import { setSchemaWriteMode } from '@Global/state/globalState';
import { afterEach, describe, expect, it, vi } from 'vitest';

// constants and types
import { DOUBLE_ELIMINATION, FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { BRIDGE, LEGACY, NATIVE, type SchemaWriteMode } from '@Constants/schemaWriteModeConstants';
import { ABANDONED, DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';
import type { Scenario } from '@Tests/testHarness/outcome/directionFixtures';
import type { AbstainReason } from '@Mutate/matchUps/outcome/types';
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

// CONTROL: with `refuse` set no recording is made, and the call's answer is the abstention its planners returned
const recorder = vi.hoisted(() => ({ refuse: false }));
vi.mock('@Mutate/matchUps/outcome/plan/recordedCall', async (original) => {
  const actual = await original<typeof import('@Mutate/matchUps/outcome/plan/recordedCall')>();
  const recordWholeCall: typeof actual.recordWholeCall = (args) =>
    recorder.refuse ? undefined : actual.recordWholeCall(args);
  return { ...actual, recordWholeCall };
});

/**
 * RECORDED, THE WHOLE CALL, FOR MORE OF THE PLANNERS' ABSTENTIONS (`outcome/plan.ts` `recordedWhole`). A call the
 * planners abstain from as a route or a link they do not plan (`route`, `link`), for the client's positional codes
 * (`status-codes`), for provenance on its matchUp (`provenance`) or for LEGACY or BRIDGE write mode (`write-mode`) is
 * read off v1's whole write on a copy of the record, as an `exit`, a `cascade` or a `loser` is.
 *
 * Each row is first played with no recording, to show which abstention the planners return for it; then recorded: the
 * shadow is applied and compared under `differential`, and under `v2` v1 is not asked to write the stored record, which
 * is left as v1 leaves it, with v1's notices and v1's result.
 */

afterEach(() => {
  recorder.refuse = false;
  setSchemaWriteMode(NATIVE);
});

const SINGLE_8 = { drawSize: 8 };
const FMLC_8 = { drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 8 };
const BACKDRAW = (roundNumber: number) => ({ structureName: 'Backdraw', roundNumber });

const ROWS: [string, AbstainReason, Scenario, SchemaWriteMode?][] = [
  [
    'a status that directs nothing, on a route the planners do not plan',
    'route',
    { drawProfile: SINGLE_8, steps: [{ target: R1(1), outcome: { matchUpStatus: ABANDONED } }] },
  ],
  [
    "a winner changed where the winner's link leaves the structure",
    'link',
    {
      drawProfile: { drawType: DOUBLE_ELIMINATION, drawSize: 4 },
      setup: [
        { target: R1(1, 'Main'), outcome: won(1) },
        { target: R1(2, 'Main'), outcome: won(1) },
        { target: MAIN(2, 1), outcome: won(1) },
        { target: BACKDRAW(1), outcome: won(1) },
        { target: BACKDRAW(2), outcome: won(1) },
      ],
      steps: [{ target: BACKDRAW(2), outcome: won(2) }],
    },
  ],
  [
    "a single exit with the client's reason",
    'status-codes',
    { drawProfile: SINGLE_8, steps: [{ target: R1(1), outcome: { ...walkover(1), sideStatusCodes: { 2: 'W1' } } }] },
  ],
  [
    "a double exit with the client's reasons",
    'status-codes',
    {
      drawProfile: SINGLE_8,
      steps: [
        { target: R1(1), outcome: { matchUpStatus: DOUBLE_WALKOVER, sideStatusCodes: { 1: 'WOWO', 2: 'WOWO' } } },
      ],
    },
  ],
  [
    'a carried exit entered again where it stands',
    'provenance',
    {
      drawProfile: FMLC_8,
      setup: [
        { target: R1(1, 'Main'), outcome: walkover(1), params: CARRIED },
        { target: R1(2, 'Main'), outcome: won(1) },
      ],
      steps: [{ target: CONSOLATION(1, 1), outcome: walkover(2) }],
    },
  ],
  [
    'LEGACY: a first winner',
    'write-mode',
    { drawProfile: SINGLE_8, steps: [{ target: R1(1), outcome: won(1) }] },
    LEGACY,
  ],
  [
    'BRIDGE: a directed result cleared',
    'write-mode',
    {
      drawProfile: SINGLE_8,
      setup: [{ target: R1(1), outcome: won(1) }],
      steps: [{ target: R1(1), outcome: cleared }],
    },
    BRIDGE,
  ],
  // the planners name the first reason that holds: LEGACY is asked ahead of a schedule or notes the call carries
  [
    'LEGACY: a first winner carrying a schedule',
    'write-mode',
    {
      drawProfile: SINGLE_8,
      steps: [{ target: R1(1), outcome: won(1), params: { schedule: { scheduledTime: '10:00' } } }],
    },
    LEGACY,
  ],
  [
    'LEGACY: a first winner carrying notes',
    'write-mode',
    { drawProfile: SINGLE_8, steps: [{ target: R1(1), outcome: won(1), params: { notes: 'noted' } }] },
    LEGACY,
  ],
];

describe('a call the planners abstain from is recorded whole', () => {
  it.each(ROWS)('%s (%s)', (_label, _reason, scenario, writeMode = NATIVE) => {
    setSchemaWriteMode(writeMode);
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    expect(v1.results.every((result: any) => result.success)).toEqual(true);

    recorder.refuse = true;
    play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    recorder.refuse = false;

    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v2.v1Writes).toEqual(0);
    for (const actual of [compared, v2]) {
      expect(actual.results).toEqual(v1.results);
      expect(actual.record).toEqual(v1.record);
      expect(actual.notices).toEqual(v1.notices);
    }
  });
});

/**
 * The recorder discards a run that leaves a scored time on a matchUp with no result (`hasStaleScoredTime`), the plan's
 * own cleanup. That reads `schedule.scoredTime`, which is where v1 keeps the stamp in every write mode: LEGACY and
 * BRIDGE write no timeItem for it, so there is no second form for the guard to miss.
 */
describe('the scored time v1 stamps is `schedule.scoredTime` in every write mode', () => {
  it.each([NATIVE, BRIDGE, LEGACY] as const)('%s', (writeMode) => {
    setSchemaWriteMode(writeMode);
    const first = (record: string) => JSON.parse(record).events[0].drawDefinitions[0].structures[0].matchUps[0];
    const scored: Scenario = { drawProfile: SINGLE_8, steps: [{ target: R1(1), outcome: won(1) }] };
    for (const mode of [OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const) {
      const stamped = first(play(mode, scored).record);
      expect(stamped.schedule.scoredTime).toBeDefined();
      expect(JSON.stringify(stamped.timeItems ?? [])).not.toContain('2026-10-25T00:01');
      const unstamped = first(
        play(mode, { ...scored, steps: [...scored.steps, { target: R1(1), outcome: cleared }] }).record,
      );
      expect(unstamped.schedule).toEqual({});
      expect(JSON.stringify(unstamped)).not.toContain('2026-10-25T00:01');
    }
  });
});
