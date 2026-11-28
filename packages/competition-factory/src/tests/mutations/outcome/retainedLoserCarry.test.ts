import { playCall, prepareCall } from '@Tests/testHarness/outcome/recordedCallHarness';
import { setSubscriptions } from '@Global/state/globalState';
import { setOutcomePipeline } from '@Tests/testHarness/outcomeModes';
import * as stateWriter from '@Mutate/matchUps/matchUpStatus/setMatchUpState';
import { expectReturnParity } from '@Tests/testHarness/outcome/returnParity';
import * as recording from '@Mutate/matchUps/outcome/plan/recordedCall';
import { afterEach, expect, it, vi } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { setClock } from '@Tools/clock';

// constants and types
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { DEFAULTED, WALKOVER } from '@Constants/matchUpStatusConstants';
import type { HydratedMatchUp } from '@Types/hydrated';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Tests/testHarness/outcomeModes';

afterEach(() => {
  vi.restoreAllMocks();
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setSubscriptions({ subscriptions: {} });
  setClock();
});

function converged(status: typeof WALKOVER | typeof DEFAULTED) {
  return prepareCall(() => {
    const drawId = 'd';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: DOUBLE_ELIMINATION, drawSize: 8, drawId }],
      setState: true,
      nonRandom: 1,
    });
    const matches = (): HydratedMatchUp[] => tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps;
    const main = matches().filter((m) => m.structureName === 'Main' && m.roundNumber === 1);
    const source = main[0];
    const other = main.find((m) => m.matchUpId !== source.matchUpId && m.loserMatchUpId === source.loserMatchUpId);
    expect(other).toBeDefined();
    const params = {
      drawId,
      matchUpId: source.matchUpId,
      outcome: { winningSide: 1, matchUpStatus: status },
      propagateExitStatus: true,
    };
    expect(tournamentEngine.setMatchUpStatus(params).success).toBe(true);
    expect(tournamentEngine.setMatchUpStatus({ ...params, matchUpId: other!.matchUpId }).success).toBe(true);
    const landing = matches().find((m) => m.matchUpId === source.loserMatchUpId);
    expect(
      Object.values(landing?.sideExitProvenance ?? {})
        .map((entry) => entry.sourceMatchUpId)
        .sort(),
    ).toEqual([source.matchUpId, other!.matchUpId].sort());
    return params;
  });
}

it.each([WALKOVER, DEFAULTED] as const)(
  're-entering %s preserves the two origins of a backdraw convergence',
  (status) => {
    const call = converged(status);
    const recorder = vi.spyOn(recording, 'recordWholeCall').mockReturnValue(undefined);
    const writer = vi.spyOn(stateWriter, 'setMatchUpState');
    const reference = playCall(OUTCOME_PIPELINE_V1, call);
    expect(reference.result.success).toBe(true);
    for (const mode of [OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL] as const) {
      writer.mockClear();
      const actual = playCall(mode, call);
      if (mode === OUTCOME_PIPELINE_V2) expect(writer).not.toHaveBeenCalled();
      expectReturnParity(actual, reference);
      expect(actual.record).toBe(reference.record);
      expect(actual.graph).toEqual(reference.graph);
      expect(actual.notices).toEqual(reference.notices);
    }
    expect(recorder).not.toHaveBeenCalled();
  },
);

it('keeps the recorder when the stored carry has a different label from the source', () => {
  const call = converged(WALKOVER);
  const matches = call.prepared.events![0].drawDefinitions![0].structures!.flatMap(
    (structure) => structure.matchUps ?? [],
  );
  const entries = matches.flatMap((matchUp) => Object.values(matchUp.sideExitProvenance ?? {}));
  const origin = entries.find(
    (entry) => entry.sourceMatchUpId === call.params.matchUpId && entry.matchUpStatus === WALKOVER,
  );
  expect(origin).toBeDefined();
  origin!.matchUpStatus = DEFAULTED;
  const recorder = vi.spyOn(recording, 'recordWholeCall');
  const reference = playCall(OUTCOME_PIPELINE_V1, call);
  const actual = playCall(OUTCOME_PIPELINE_V2, call);
  expect(recorder).toHaveBeenCalled();
  expectReturnParity(actual, reference);
  expect(actual.record).toBe(reference.record);
  expect(actual.graph).toEqual(reference.graph);
  expect(actual.notices).toEqual(reference.notices);
});
