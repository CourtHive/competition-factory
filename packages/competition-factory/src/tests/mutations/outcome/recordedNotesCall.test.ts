import { expectRecordedWhole, playCall, prepareCall } from '@Tests/testHarness/outcome/recordedCallHarness';
import { objectGraph, storedGraph, storedRecord } from '@Tests/testHarness/outcome/objectGraph';
import { findTarget, R1, won } from '@Tests/testHarness/outcome/directionFixtures';
import { setSubscriptions } from '@Global/state/globalState';
import { setOutcomePipeline } from '@Tests/testHarness/outcomeModes';
import { afterEach, describe, expect, it, vi } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { setClock } from '@Tools/clock';

// constants and types
import type { OutcomePipelineMode } from '@Tests/testHarness/outcomeModes';
import { DOUBLE_DEFAULT, DOUBLE_WALKOVER, IN_PROGRESS } from '@Constants/matchUpStatusConstants';
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
 * Notes that are not data are recorded too (below): `addNotes` also stores the `{ testing: true }` object a test hands
 * it, as it is, a function among its fields included.
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

/**
 * NOTES THAT ARE NOT DATA (recorded). `addNotes` stores the object a test hands it (`testing: true`) as
 * it is: the stored matchUp holds the caller's very object, a function among its fields included. A function cannot be
 * copied, so the recorded op's own copy of the matchUp holds the notes copied as far as they can be and the function
 * by reference (`cloneData`), and apply leaves on the stored matchUp what the copy's run left on the copy: the caller's
 * object itself, as v1 does.
 */
describe('notes that are not data', () => {
  // `makeDeepCopy.test.ts`'s notes: a function, an object with its own `toString`, another with its own `toJSON`
  const handed = () => ({
    _id: { fx: (x: number) => x * x },
    foo: { toString: () => '######' },
    bar: { toJSON: () => '{ "some": "json" }' },
    keep: { num: 1, str: 'string', obj: { a: 1, b: 2 } },
    testing: true,
  });
  const noted = (record = storedRecord()) =>
    (record.events?.[0].drawDefinitions?.[0].structures?.[0].matchUps ?? []).find((matchUp) => matchUp.notes);

  it('a notes object holding functions is recorded whole, and the stored matchUp holds the very object v1 stores', () => {
    const notes = handed();
    const bare = prepareCall(call(undefined, undefined));
    // the notes are handed over as they are, the same object in every play: a function cannot be copied
    const prepared = { prepared: bare.prepared, params: { ...bare.params, notes } };
    const before = objectGraph(notes);
    // the record and the result object for object (`storedGraph`: a function is compared by identity), the notices
    // and the record as text
    expectRecordedWhole(prepared, 'notes', recorder, true);

    for (const mode of [OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL] as const) {
      const played = playCall(mode, prepared, true);
      expect(played.result.success).toEqual(true);
      expect(played.v1Writes > 0).toEqual(false);
      // CONTROL (v1) and the claim (v2, differential): the caller's object itself, every object under it and each
      // function the very one handed over
      const stored = noted()?.notes as unknown as ReturnType<typeof handed>;
      expect(stored).toBe(notes);
      expect(stored._id).toBe(notes._id);
      expect(stored._id.fx).toBe(notes._id.fx);
      expect(stored._id.fx(3)).toEqual(9);
      expect(stored.foo.toString).toBe(notes.foo.toString);
      expect(stored.bar.toJSON).toBe(notes.bar.toJSON);
      expect(stored.keep).toBe(notes.keep);
      expect(stored.keep.obj).toBe(notes.keep.obj);
      // and nothing wrote into what the caller handed over
      expect(objectGraph(notes)).toEqual(before);
    }
  });

  it('a record that holds such notes takes later calls in every mode, as v1 does', () => {
    const notes = handed();
    const bare = prepareCall(call(undefined, undefined));
    const noting: Record<string, unknown> = { ...bare.params, notes };
    const later = (matchUpId: string) => [
      // a result on the matchUp that holds the notes, then a double exit beside it
      { drawId: 'd', matchUpId, outcome: won(1) },
      { drawId: 'd', matchUpId: findTarget(R1(2)), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
    ];
    const play = (mode: OutcomePipelineMode) => {
      const first = playCall(mode, { prepared: bare.prepared, params: noting }, true);
      setOutcomePipeline(mode);
      const results = later(noting.matchUpId as string).map((params) => {
        const { stack: _stack, ...result }: any = tournamentEngine.setMatchUpStatus(params);
        return result;
      });
      setOutcomePipeline(OUTCOME_PIPELINE_V1);
      expect(noted()?.notes).toBe(notes);
      return { first: first.result, results, graph: storedGraph(results) };
    };
    const v1 = play(OUTCOME_PIPELINE_V1);
    // CONTROL: v1 accepts each
    expect(v1.results.map((result) => result.success)).toEqual([true, true]);
    expect(play(OUTCOME_PIPELINE_V2)).toEqual(v1);
    expect(play(OUTCOME_PIPELINE_DIFFERENTIAL)).toEqual(v1);
  });
});
