import {
  deleteNotices,
  getOutcomePipeline,
  getTournamentRecords,
  setOutcomePipeline,
  setSubscriptions,
} from '@Global/state/globalState';
import { prepareCall, type RecordedCall } from '@Tests/testHarness/outcome/recordedCallHarness';
import { captureReturn, expectReturnParity } from '@Tests/testHarness/outcome/returnParity';
import { storedGraph } from '@Tests/testHarness/outcome/objectGraph';
import * as recording from '@Mutate/matchUps/outcome/plan/recordedCall';
import { matchUpsOf } from '@Helpers/drawTopology/structureMembers';
import { topicConstants } from '@Constants/topicConstants';
import { createSeededRandom } from '@Tools/prng';
import type { Tournament } from '@Types/tournamentTypes';
import { setClock } from '@Tools/clock';
import mocks from '@Assemblies/engines/mock';
import engine from '@Engines/syncEngine';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const drawId = 'team-double-exit';
const main = (record: Tournament) =>
  matchUpsOf(record.events![0].drawDefinitions![0].structures!.find((s) => s.structureName === 'Main'))!;
const at = (record: Tournament, round: number, position: number) =>
  main(record).find((m) => m.roundNumber === round && m.roundPosition === position)!;
const stored = () => Object.values(getTournamentRecords())[0] as Tournament;
const earlier = getOutcomePipeline();

beforeEach(() => {
  vi.spyOn(Math, 'random').mockImplementation(createSeededRandom(289));
});
afterEach(() => {
  vi.restoreAllMocks();
  setClock();
  setSubscriptions({ subscriptions: {} });
  setOutcomePipeline(earlier);
});

function relabel(matchUpId: string) {
  return {
    drawId,
    matchUpId,
    outcome: { matchUpStatus: 'DOUBLE_DEFAULT' },
    propagateExitStatus: true,
    allowChangePropagation: true,
  };
}
function generate(drawSize: number, participantsCount: number) {
  mocks.generateTournamentRecord({
    drawProfiles: [
      {
        drawId,
        drawSize,
        participantsCount,
        eventType: 'TEAM',
        tieFormatName: 'DOMINANT_DUO',
        drawType: 'FIRST_MATCH_LOSER_CONSOLATION',
      },
    ],
    nonRandom: 289,
    setState: true,
  });
  expect(engine.generateLineUps({ drawId, attach: true, useDefaultEventRanking: true }).success).toBe(true);
}

function beforeHistoricalClinch() {
  return prepareCall(() => {
    generate(8, 6);
    const adjacent = at(stored(), 1, 2),
      lines = at(stored(), 1, 1).tieMatchUps!;
    expect(
      engine.setMatchUpStatus({
        drawId,
        matchUpId: adjacent.matchUpId,
        outcome: { matchUpStatus: 'DOUBLE_WALKOVER' },
        enableAutoCalc: true,
      }).success,
    ).toBe(true);
    expect(
      engine.setMatchUpStatus({ drawId, matchUpId: lines[0].matchUpId, outcome: { matchUpStatus: 'TO_BE_PLAYED' } })
        .success,
    ).toBe(true);
    expect(
      engine.setMatchUpStatus({
        drawId,
        matchUpId: lines[2].matchUpId,
        outcome: { matchUpStatus: 'WALKOVER', winningSide: 2 },
        propagateExitStatus: true,
      }).success,
    ).toBe(true);
    return relabel(adjacent.matchUpId);
  });
}

function historicalClinch(winner: 1 | 2 = 2) {
  const call = beforeHistoricalClinch();
  // Older writers admitted the line that clinched for a BYE and kept both positions in the next duals.
  const sibling = at(call.prepared, 1, 1),
    semi = at(call.prepared, 2, 1),
    final = at(call.prepared, 3, 1);
  expect(sibling.drawPositions).toEqual([1, 2]);
  expect(semi.drawPositions).toEqual([1]);
  expect(final.drawPositions).toEqual([1]);
  sibling.matchUpStatus = 'COMPLETED';
  sibling.winningSide = winner;
  semi.drawPositions = [1, 2];
  final.drawPositions = [1, 2];
  final.matchUpStatus = 'BYE';
  return call;
}

type Route = 'direct' | 'queue-off' | 'queue-on';
function check(call: RecordedCall, route: Route, accepted: boolean) {
  const recorder = vi.spyOn(recording, 'recordWholeCall').mockReturnValue(undefined);
  let reference: ReturnType<typeof captureReturn> | undefined;
  try {
    for (const mode of ['v1', 'v2', 'differential'] as const) {
      setSubscriptions({ subscriptions: {} });
      setOutcomePipeline('v1');
      expect(engine.setState(structuredClone(call.prepared)).success).toBe(true);
      deleteNotices();
      const batches: string[] = [];
      setSubscriptions({
        subscriptions: Object.fromEntries(
          Object.values(topicConstants).map((topic) => [topic, () => batches.push(topic)]),
        ),
      });
      setOutcomePipeline(mode);
      setClock('2026-10-25T00:48:00Z');
      const before = storedGraph();
      const params = structuredClone(call.params);
      const result =
        route === 'direct'
          ? engine.setMatchUpStatus(params)
          : engine.executionQueue([{ method: 'setMatchUpStatus', params }], route === 'queue-on');
      if (accepted) {
        expect(result.success).toBe(true);
        expect(batches).toContain('modifyMatchUp');
      } else {
        expect(result.error?.code).toBe('ERR_EXISTING_POSITION_ASSIGNMENT');
        expect(storedGraph()).toStrictEqual(before);
        expect(batches).toEqual([]);
        if (route !== 'direct') expect(result.rolledBack).toBe(route === 'queue-on');
      }
      const returned = captureReturn(result.results?.[0] ?? result);
      if (reference) {
        expectReturnParity(returned, reference);
        expect(returned.arrayStack).toBe(reference.arrayStack);
      }
      reference ??= returned;
    }
    if (!accepted) expect(recorder).not.toHaveBeenCalled();
  } finally {
    recorder.mockRestore();
  }
}

it.each(['direct', 'queue-off', 'queue-on'] as const)(
  'refuses before writing when the other feeder still holds both receiver positions (%s)',
  (route) => {
    check(historicalClinch(), route, false);
    check(historicalClinch(1), route, false);
    const reverse = historicalClinch();
    at(reverse.prepared, 1, 2).matchUpStatus = 'DOUBLE_DEFAULT';
    reverse.params.outcome = { matchUpStatus: 'DOUBLE_WALKOVER' };
    check(reverse, route, false);
    check(beforeHistoricalClinch(), route, true);
    // Full receivers can still release this relabel's own advance or an orphan neither feeder holds.
    for (const releasable of [3, 7]) {
      const call = historicalClinch();
      at(call.prepared, 2, 1).drawPositions = [1, releasable];
      check(call, route, true);
      expect(at(stored(), 2, 1).drawPositions).toEqual([1]);
    }
  },
);

it.each(['direct', 'queue-off', 'queue-on'] as const)(
  'releases the source’s own advancement from a full TEAM receiver (%s)',
  (route) => {
    const call = prepareCall(() => {
      generate(4, 4);
      for (const position of [1, 2]) {
        const semi = at(stored(), 1, position);
        expect(
          engine.setMatchUpStatus({ drawId, matchUpId: semi.matchUpId, outcome: { winningSide: 1 } }).success,
        ).toBe(true);
      }
      return relabel(at(stored(), 1, 1).matchUpId);
    });
    const final = at(call.prepared, 2, 1);
    expect(final.drawPositions).toHaveLength(2);
    check(call, route, true);
    expect(at(stored(), 2, 1).drawPositions).toEqual([3]);
  },
);

it.each(['LUCKY_DRAW', 'ADAPTIVE'] as const)(
  'a %s double exit is local even with both positions at the next dual',
  (drawType) => {
    const call = historicalClinch();
    call.prepared.events![0].drawDefinitions![0].drawType = drawType;
    for (const route of ['direct', 'queue-off', 'queue-on'] as const) {
      check(call, route, true);
      expect(at(stored(), 2, 1).drawPositions).toEqual([1, 2]);
    }
  },
);

it('relabelling a double exit in a round robin group succeeds without a bracket receiver', () => {
  const call = prepareCall(() => {
    mocks.generateTournamentRecord({
      drawProfiles: [
        { drawId, drawSize: 4, eventType: 'TEAM', tieFormatName: 'DOMINANT_DUO', drawType: 'ROUND_ROBIN' },
      ],
      nonRandom: 289,
      setState: true,
    });
    const groupMatch = engine
      .allDrawMatchUps({ drawId, inContext: true })
      .matchUps.find((m) => m.matchUpType === 'TEAM')!;
    expect(
      engine.setMatchUpStatus({
        drawId,
        matchUpId: groupMatch.matchUpId,
        outcome: { matchUpStatus: 'DOUBLE_WALKOVER' },
      }).success,
    ).toBe(true);
    return relabel(groupMatch.matchUpId);
  });
  for (const route of ['direct', 'queue-off', 'queue-on'] as const) check(call, route, true);
});
