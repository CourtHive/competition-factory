import { expectRecordedWhole, playCall, prepareCall } from '@Tests/testHarness/outcome/recordedCallHarness';
import { findTarget, R1, won } from '@Tests/testHarness/outcome/directionFixtures';
import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { afterEach, describe, expect, it, vi } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { setClock } from '@Tools/clock';

// constants
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Constants/outcomePipelineConstants';
import { DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';

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
 * A CALL THAT CARRIES A SCHEDULE THE PLANNERS DO NOT WRITE IS RECORDED WHOLE (`schedule`, `outcome/plan.ts`
 * `RECORDED_WHOLE`).
 *
 * v1 writes a call's schedule onto its matchUp as timeItems after the result (`setMatchUpState`'s schedule step), each
 * stamped with the call's instant. The planners write the schedules `scheduleOps` plans and abstain `schedule` from
 * the rest, including a start and an end time. A repeated double exit can carry a native date update. The timeItems are the matchUp's own
 * field, so they are in the recording. A schedule v1 refuses (an end before its start, a time out of order with a
 * linked matchUp) is refused before any plan, as it was (`scheduleRefusedBeforeTheOutcome.test.ts`).
 */

const draw = () =>
  mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8, drawId: 'd' }], nonRandom: 1, setState: true });
const startDate = () => tournamentEngine.getTournament().tournamentRecord.startDate;

const ROWS: [string, () => Record<string, unknown>][] = [
  [
    'a result with a start and an end time',
    () => {
      draw();
      return {
        schedule: { startTime: '10:00', endTime: '11:30' },
        matchUpId: findTarget(R1(1)),
        outcome: won(1),
        drawId: 'd',
      };
    },
  ],
  [
    'a double exit asked for again, with a scheduled date',
    () => {
      draw();
      const matchUpId = findTarget(R1(1));
      const outcome = { matchUpStatus: DOUBLE_WALKOVER };
      expect(tournamentEngine.setMatchUpStatus({ drawId: 'd', matchUpId, outcome }).success).toEqual(true);
      return { drawId: 'd', matchUpId, outcome, schedule: { scheduledDate: startDate() } };
    },
  ],
];

const timeItems = (record: string, matchUpId: unknown) =>
  JSON.parse(record)
    .events[0].drawDefinitions[0].structures[0].matchUps.find((matchUp: any) => matchUp.matchUpId === matchUpId)
    .timeItems?.map((item: any) => item.itemType) ?? [];

describe('a call that carries a schedule the planners do not write is recorded whole', () => {
  it.each(ROWS)('%s', (_label, build) => {
    const call = prepareCall(build);
    if (call.params.schedule && 'scheduledDate' in Object(call.params.schedule)) {
      // The date is planned even when the recorder is unavailable. Compare ordered notices and all stored stamps.
      recorder.refuse = true;
      const v1 = playCall(OUTCOME_PIPELINE_V1, call);
      expect(v1.result.success).toBe(true);
      expect(v1.v1Writes).toBeGreaterThan(0);
      for (const mode of [OUTCOME_PIPELINE_DIFFERENTIAL, OUTCOME_PIPELINE_V2] as const) {
        const actual = playCall(mode, call);
        if (mode === OUTCOME_PIPELINE_V2) expect(actual.v1Writes).toBe(0);
        expect({ ...actual, v1Writes: 0 }).toEqual({ ...v1, v1Writes: 0 });
      }
      return;
    }
    const v1 = expectRecordedWhole(call, 'schedule', recorder);
    // CONTROL: v1 wrote the start and the end, a timeItem for each
    const before = timeItems(JSON.stringify(call.prepared), call.params.matchUpId);
    const written = timeItems(v1.record, call.params.matchUpId);
    if ((call.params.schedule as any).startTime) expect(written.length - before.length).toEqual(2);
  });
});
