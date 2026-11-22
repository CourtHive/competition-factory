import { playCall, prepareCall, type RecordedCall } from '@Tests/testHarness/outcome/recordedCallHarness';
import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import * as stateWriter from '@Mutate/matchUps/matchUpStatus/setMatchUpState';
import { expectReturnParity } from '@Tests/testHarness/outcome/returnParity';
import * as recording from '@Mutate/matchUps/outcome/plan/recordedCall';
import { positionTargets } from '@Query/matchUp/positionTargets';
import * as reentry from '@Mutate/matchUps/outcome/plan/settledWinnerReentry';
import mocksEngine from '@Assemblies/engines/mock';
import { afterEach, expect, it, vi } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import { setClock } from '@Tools/clock';

// constants and types
import {
  DOUBLE_ELIMINATION,
  SINGLE_ELIMINATION,
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_MATCHUP,
} from '@Constants/drawDefinitionConstants';
import { COMPLETED, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Constants/outcomePipelineConstants';
import type { HydratedMatchUp } from '@Types/hydrated';

afterEach(() => {
  vi.restoreAllMocks();
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setSubscriptions({ subscriptions: {} });
  setClock();
});

function repeatedWinner(drawType: typeof DOUBLE_ELIMINATION | typeof SINGLE_ELIMINATION) {
  return prepareCall(() => {
    const drawId = 'd';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType, drawSize: 8, drawId }],
      setState: true,
      nonRandom: 1,
    });
    const matches = (): HydratedMatchUp[] => tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps;
    const first = matches().filter(
      (m) => m.roundNumber === 1 && (drawType === SINGLE_ELIMINATION || m.structureName === 'Main'),
    );
    const source = first.find((m) => m.roundPosition === 1)!;
    const backdraw = drawType === DOUBLE_ELIMINATION;
    const other = first.find(
      (m) =>
        m.matchUpId !== source.matchUpId &&
        (backdraw ? m.loserMatchUpId === source.loserMatchUpId : m.winnerMatchUpId === source.winnerMatchUpId),
    )!;
    const params = { drawId, matchUpId: source.matchUpId, outcome: { winningSide: 1 }, propagateExitStatus: true };
    expect(
      tournamentEngine.setMatchUpStatus({
        ...params,
        matchUpId: other.matchUpId,
        outcome: backdraw ? { matchUpStatus: WALKOVER, winningSide: 1 } : { matchUpStatus: DOUBLE_WALKOVER },
      }).success,
    ).toBe(true);
    expect(tournamentEngine.setMatchUpStatus(params).success).toBe(true);
    const after = matches();
    expect(after.find((m) => m.matchUpId === source.matchUpId)?.matchUpStatus).toBe(COMPLETED);
    const award = after.find((m) => m.matchUpId === (backdraw ? source.loserMatchUpId : source.winnerMatchUpId))!;
    expect(award.matchUpStatus).toBe(WALKOVER);
    const winnerId = award.sides?.find((s) => s.sideNumber === award.winningSide)?.participantId;
    expect(winnerId).toBeTruthy();
    expect(
      after.find((m) => m.matchUpId === award.winnerMatchUpId)?.sides?.some((s) => s.participantId === winnerId),
    ).toBe(true);
    return params;
  });
}

function compare(call: RecordedCall, native: boolean) {
  const recorder = vi.spyOn(recording, 'recordWholeCall');
  if (native) recorder.mockReturnValue(undefined);
  const writer = vi.spyOn(stateWriter, 'setMatchUpState');
  const reference = playCall(OUTCOME_PIPELINE_V1, call);
  expect(reference.result.success).toBe(true);
  expect(writer).toHaveBeenCalled();
  for (const mode of [OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL] as const) {
    writer.mockClear();
    const actual = playCall(mode, call);
    if (native && mode === OUTCOME_PIPELINE_V2) expect(writer).not.toHaveBeenCalled();
    expectReturnParity(actual, reference);
    expect(actual.arrayStack).toBe(reference.arrayStack);
    expect(actual.record).toEqual(reference.record);
    expect(actual.graph).toEqual(reference.graph);
    expect(actual.notices).toEqual(reference.notices);
  }
  expect(recorder.mock.calls.length === 0).toBe(native);
  return reference;
}

it.each([DOUBLE_ELIMINATION, SINGLE_ELIMINATION] as const)(
  '%s repeats a completed winner with a standing exit award',
  (drawType) => {
    compare(repeatedWinner(drawType), true);
  },
);

it('records the re-entry when a stored arrival label needs refreshing', () => {
  const call = repeatedWinner(SINGLE_ELIMINATION);
  const matches = call.prepared.events![0].drawDefinitions![0].structures![0].matchUps!;
  const entry = matches
    .flatMap((m) => Object.values(m.sideExitProvenance ?? {}))
    .find((e) => e.sourceMatchUpId === call.params.matchUpId && e.previousMatchUpStatus === COMPLETED);
  expect(entry).toBeDefined();
  entry!.previousMatchUpStatus = WALKOVER;
  compare(call, false);
});

it.each(['place', 'withdraw'] as const)(
  'records a landed FIRST_MATCHUP winner when V1 must %s its reservation',
  (action) => {
    const drawId = 'reservation';
    let structureId: string, position: number, pairedId: string;
    const call = prepareCall(() => {
      mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawId, drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 8 }],
        setState: true,
        nonRandom: 1,
      });
      const matches = (): HydratedMatchUp[] => tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps;
      const main = matches().filter((m) => m.structureName === 'Main' && m.roundNumber === 1);
      const source = main.find((m) => m.roundPosition === 2)!;
      pairedId = main.find((m) => m.roundPosition === 1)!.matchUpId;
      const params = { drawId, matchUpId: source.matchUpId, outcome: { winningSide: 2 }, propagateExitStatus: true };
      expect(
        tournamentEngine.setMatchUpStatus({
          ...params,
          matchUpId: pairedId,
          outcome: { matchUpStatus: WALKOVER, winningSide: 1 },
        }).success,
      ).toBe(true);
      expect(tournamentEngine.setMatchUpStatus(params).success).toBe(true);
      const inContextDrawMatchUps = matches();
      const holder = inContextDrawMatchUps.find((m) => m.matchUpId === source.winnerMatchUpId)!;
      expect(holder.drawPositions?.filter(Boolean)).toHaveLength(2);
      const drawDefinition = tournamentEngine.getTournament().tournamentRecord.events![0].drawDefinitions![0];
      const next = positionTargets({ drawDefinition, inContextDrawMatchUps, matchUpId: holder.matchUpId });
      expect(next.targetLinks?.loserTargetLink?.linkCondition).toBe(FIRST_MATCHUP);
      structureId = next.targetMatchUps!.loserMatchUp!.structureId!;
      position = next.targetMatchUps!.loserTargetDrawPosition!;
      return params;
    });
    const structures = call.prepared.events![0].drawDefinitions![0].structures!;
    const seat = structures
      .find((s) => s.structureId === structureId)!
      .positionAssignments!.find((a) => a.drawPosition === position)!;
    expect(seat.bye).toBeFalsy();
    if (action === 'place') {
      // A stored scored feeder beside the source now earns the reservation, but its seat is still empty.
      structures.flatMap((s) => s.matchUps ?? []).find((m) => m.matchUpId === pairedId)!.matchUpStatus = COMPLETED;
    } else {
      seat.bye = true;
      seat.byeFromPropagation = true;
    }
    const admission = vi.spyOn(reentry, 'settledWinnerReentry');
    const reference = compare(call, false);
    expect(admission).toHaveReturnedWith(false);
    const after = JSON.parse(reference.record).events[0].drawDefinitions[0].structures.find(
      (s) => s.structureId === structureId,
    );
    const resultingSeat = after.positionAssignments.find((a) => a.drawPosition === position);
    expect(!!resultingSeat?.bye).toBe(action === 'place');
    expect(!!resultingSeat?.byeFromPropagation).toBe(action === 'place');
  },
);
