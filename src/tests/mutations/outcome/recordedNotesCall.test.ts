import { expectRecordedWhole, playCall, prepareCall } from '@Tests/testHarness/outcome/recordedCallHarness';
import { findTarget, R1, won } from '@Tests/testHarness/outcome/directionFixtures';
import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { afterEach, describe, expect, it, vi } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { setClock } from '@Tools/clock';

// constants and types
import type { OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
import { DOUBLE_DEFAULT, DOUBLE_WALKOVER, IN_PROGRESS } from '@Constants/matchUpStatusConstants';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Constants/outcomePipelineConstants';

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

afterEach(() => {
  recorder.refuse = false;
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setSubscriptions({ subscriptions: {} });
  setClock();
});

/**
 * A CALL THAT CARRIES NOTES THE PLANNERS DO NOT WRITE IS RECORDED WHOLE (`notes`, `outcome/plan.ts` `RECORDED_WHOLE`).
 *
 * v1 writes a call's notes onto its matchUp inside the score write (`addNotes`), and forwards the call's parameters,
 * notes among them, to the exits a double exit writes. The planners write notes on the call's own matchUp on the clean
 * routes and abstain `notes` from the rest. The notes are a matchUp's own field wherever v1 writes them, so they are
 * in the recording.
 *
 * NOT RECORDED: notes that are not data. `addNotes` also stores the `{ testing: true }` object a test hands it, as it
 * is; one that holds a function cannot be held by an op, the recording is not made, and the call stays v1's.
 */

const draw = () =>
  mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8, drawId: 'd' }], nonRandom: 1, setState: true });
const call = (outcome: Record<string, unknown> | undefined, notes: unknown, setup?: Record<string, unknown>) => () => {
  draw();
  const matchUpId = findTarget(R1(1));
  if (setup)
    expect(tournamentEngine.setMatchUpStatus({ drawId: 'd', matchUpId, outcome: setup }).success).toEqual(true);
  return { drawId: 'd', matchUpId, notes, ...(outcome ? { outcome } : {}) };
};

const ROWS: [string, () => Record<string, unknown>][] = [
  ['a matchUp put in progress', call({ matchUpStatus: IN_PROGRESS }, 'first note')],
  [
    'a matchUp in progress, noted again',
    call({ matchUpStatus: IN_PROGRESS }, 'second note', { matchUpStatus: IN_PROGRESS }),
  ],
  ['a double walkover', call({ matchUpStatus: DOUBLE_WALKOVER }, 'retired hurt')],
  ['a double default', call({ matchUpStatus: DOUBLE_DEFAULT }, 'neither arrived')],
  ['a winner entered over a double walkover', call(won(1), 'played after all', { matchUpStatus: DOUBLE_WALKOVER })],
];

const notesOf = (record: string) =>
  JSON.parse(record)
    .events[0].drawDefinitions[0].structures[0].matchUps.filter((matchUp: any) => matchUp.notes !== undefined)
    .map((matchUp: any) => matchUp.notes);

describe('a call that carries notes the planners do not write is recorded whole', () => {
  it.each(ROWS)('%s', (_label, build) => {
    const prepared = prepareCall(build);
    const v1 = expectRecordedWhole(prepared, 'notes', recorder);
    // CONTROL: v1 wrote the call's notes
    expect(notesOf(v1.record)).toContain(prepared.params.notes);
  });
});

describe('notes that are not data', () => {
  it('a notes object holding a function is not recorded: the call stays v1s, and leaves what v1 leaves', () => {
    const notes = { fx: { square: (x: number) => x * x }, keep: { num: 1 }, testing: true };
    const prepared = prepareCall(call(undefined, undefined));
    // the notes are handed over as they are: a function cannot be copied
    const play = (mode: OutcomePipelineMode) =>
      playCall(mode, { prepared: prepared.prepared, params: { ...prepared.params, notes } }, true);
    const v1 = play(OUTCOME_PIPELINE_V1);
    expect(v1.result.success).toEqual(true);
    expect(v1.v1Writes).toBeGreaterThan(0);
    const v2 = play(OUTCOME_PIPELINE_V2);
    expect(v2.v1Writes).toEqual(v1.v1Writes);
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL);
    for (const actual of [v2, compared]) {
      expect(actual.result).toEqual(v1.result);
      expect(actual.record).toEqual(v1.record);
      expect(actual.notices).toEqual(v1.notices);
    }
  });
});
