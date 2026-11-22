import { expectReturnParity } from '@Tests/testHarness/outcome/returnParity';
import * as stateWriter from '@Mutate/matchUps/matchUpStatus/setMatchUpState';
import * as recording from '@Mutate/matchUps/outcome/plan/recordedCall';
import type { Tournament } from '@Types/tournamentTypes';
import { playCall, type RecordedCall } from './recordedCallHarness';
import { expect, vi } from 'vitest';

export function compareHeldClaims(call: RecordedCall, native: boolean) {
  const reference = playCall('v1', call);
  expect(reference.result.success).toBe(true);
  const recorder = vi.spyOn(recording, 'recordWholeCall');
  if (native) recorder.mockReturnValue(undefined);
  const writer = vi.spyOn(stateWriter, 'setMatchUpState');
  for (const mode of ['v2', 'differential'] as const) {
    recorder.mockClear();
    const actual = playCall(mode, call);
    expect(recorder.mock.calls.length === 0).toBe(native);
    if (native && mode === 'v2') expect(writer).not.toHaveBeenCalled();
    expectReturnParity(actual, reference);
    expect(actual.arrayStack).toBe(reference.arrayStack);
    expect(actual.graph).toStrictEqual(reference.graph);
    expect(actual.record).toBe(reference.record);
    expect(actual.notices).toStrictEqual(reference.notices);
  }
  return JSON.parse(reference.record) as Tournament;
}
