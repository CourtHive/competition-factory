import { deleteNotices, getOutcomePipeline, setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { prepareCall, type RecordedCall } from '@Tests/testHarness/outcome/recordedCallHarness';
import { captureReturn, expectReturnParity } from '@Tests/testHarness/outcome/returnParity';
import { objectGraph, storedGraph } from '@Tests/testHarness/outcome/objectGraph';
import * as recording from '@Mutate/matchUps/outcome/plan/recordedCall';
import { TOPICS } from '@Tests/testHarness/outcome/directionFixtures';
import { resolveTieFormat } from '@courthive/competition-catalogue';
import { matchUpsOf } from '@Helpers/drawTopology/structureMembers';
import { createSeededRandom } from '@Tools/prng';
import mocks from '@Assemblies/engines/mock';
import engine from '@Engines/syncEngine';
import { setClock } from '@Tools/clock';
import { expect, it, vi } from 'vitest';

const drawId = 'through-bye';
type Mode = 'v1' | 'v2' | 'differential';
type Route = 'direct' | 'queue-off' | 'queue-on';

function prepare() {
  return prepareCall(() => {
    mocks.generateTournamentRecord({
      drawProfiles: [
        {
          drawId,
          drawType: 'FIRST_MATCH_LOSER_CONSOLATION',
          drawSize: 8,
          participantsCount: 6,
          eventType: 'TEAM',
          tieFormat: resolveTieFormat('DOMINANT_DUO'),
        },
      ],
      nonRandom: 187,
      setState: true,
    });
    expect(engine.generateLineUps({ drawId, useDefaultEventRanking: true, attach: true }).success).toBe(true);
    const dual = (name: string, round: number, position: number) =>
      engine
        .allDrawMatchUps({ drawId, inContext: true })
        .matchUps.find(
          (m) => !m.collectionId && m.structureName === name && m.roundNumber === round && m.roundPosition === position,
        )!;
    expect(
      engine.setMatchUpStatus({ drawId, matchUpId: dual('Main', 1, 3).matchUpId, outcome: { winningSide: 2 } }).success,
    ).toBe(true);
    expect(
      engine.setMatchUpStatus({
        drawId,
        matchUpId: dual('Main', 2, 2).matchUpId,
        allowChangePropagation: true,
        outcome: { winningSide: 2, matchUpStatus: 'DEFAULTED' },
      }).success,
    ).toBe(true);
    const lines = dual('Consolation', 1, 2).tieMatchUps!;
    expect(
      engine.setMatchUpStatus({
        drawId,
        matchUpId: lines[1].matchUpId,
        outcome: { winningSide: 1, matchUpStatus: 'DEFAULTED' },
      }).success,
    ).toBe(true);
    return {
      drawId,
      matchUpId: lines[2].matchUpId,
      outcome: { winningSide: 1, matchUpStatus: 'DEFAULTED' },
      propagateExitStatus: true,
    };
  });
}

function play({ prepared, params }: RecordedCall, mode: Mode, route: Route) {
  setSubscriptions({ subscriptions: {} });
  expect(engine.setState(structuredClone(prepared)).success).toBe(true);
  deleteNotices();
  const batches: unknown[] = [];
  const notices: { topic: string; context?: string; recipient?: string; eventId?: string }[] = [];
  setSubscriptions({
    subscriptions: Object.fromEntries(
      TOPICS.map((topic) => [
        topic,
        (batch: { context?: string; matchUp?: { matchUpId: string }; eventId?: string }[]) => {
          batches.push([topic, objectGraph(batch)]);
          for (const item of batch)
            notices.push({ topic, context: item.context, recipient: item.matchUp?.matchUpId, eventId: item.eventId });
        },
      ]),
    ),
  });
  setClock('2026-10-25T00:01:00.000Z');
  setOutcomePipeline(mode);
  const p = structuredClone(params);
  const response =
    route === 'direct'
      ? engine.setMatchUpStatus(p)
      : engine.executionQueue([{ method: 'setMatchUpStatus', params: p }], route === 'queue-on');
  expect(response.success).toBe(true);
  const returned = captureReturn(response.results?.[0] ?? response);
  return { returned, notices, batches, graph: storedGraph(returned.result) };
}

it.each(['direct', 'queue-off', 'queue-on'] as const)(
  'announces the event at the seated winner beyond a TEAM BYE (%s)',
  (route) => {
    const prior = getOutcomePipeline();
    const random = Math.random;
    const recorder = vi.spyOn(recording, 'recordWholeCall');
    try {
      Math.random = createSeededRandom(187);
      const call = prepare();
      const event = call.prepared.events![0];
      const con = event.drawDefinitions![0].structures!.find((s) => s.structureName === 'Consolation')!;
      const final = matchUpsOf(con)!.find((m) => m.roundNumber === 3 && m.roundPosition === 1)!;
      expect(final.drawPositions).toEqual([5]);
      recorder.mockReturnValue(undefined);
      for (const seated of [true, false]) {
        if (!seated) final.drawPositions = [];
        recorder.mockClear();
        const reference = play(call, 'v2', route);
        if (seated) {
          expect(reference.notices).toHaveLength(7);
          expect(reference.notices[3]).toStrictEqual({
            topic: 'modifyMatchUp',
            context: 'updateSidLineUp',
            recipient: final.matchUpId,
            eventId: event.eventId,
          });
        }
        for (const mode of ['v1', 'differential'] as const) {
          const actual = play(call, mode, route);
          expectReturnParity(actual.returned, reference.returned);
          expect(actual.returned.arrayStack).toBe(reference.returned.arrayStack);
          expect(actual.notices).toStrictEqual(reference.notices);
          expect(actual.batches).toStrictEqual(reference.batches);
          expect(actual.graph).toStrictEqual(reference.graph);
        }
        if (seated) expect(recorder).not.toHaveBeenCalled();
      }
    } finally {
      recorder.mockRestore();
      Math.random = random;
      setClock();
      setSubscriptions({ subscriptions: {} });
      setOutcomePipeline(prior);
    }
  },
);
