import { deferInContextMatchUp, deferredQuery } from '@Mutate/notifications/drawNotifications';
import { getInContextMatchUp } from '@Mutate/matchUps/score/modifyMatchUpScore';
import { captureReturn, expectReturnParity } from '@Tests/testHarness/outcome/returnParity';
import { TOPICS, won } from '@Tests/testHarness/outcome/directionFixtures';
import { objectGraph } from '@Tests/testHarness/outcome/objectGraph';
import * as stateWriter from '@Mutate/matchUps/matchUpStatus/setMatchUpState';
import * as recording from '@Mutate/matchUps/outcome/plan/recordedCall';
import { deleteNotices, getTournamentRecords, getPayloads, setSubscriptions } from '@Global/state/globalState';
import { getOutcomePipeline, setOutcomePipeline } from '@Tests/testHarness/outcomeModes';
import { MODIFY_DRAW_DEFINITION, UPDATE_INCONTEXT_MATCHUP } from '@Constants/topicConstants';
import { observeClockReadings, setClock } from '@Tools/clock';
import type { OutcomePipelineMode } from '@Tests/testHarness/outcomeModes';
import type { DrawDefinition, Tournament } from '@Types/tournamentTypes';
import mocksEngine from '@Assemblies/engines/mock';
import engine from '@Engines/syncEngine';
import { afterEach, expect, it, vi } from 'vitest';

const pipeline = getOutcomePipeline();
afterEach(() => {
  vi.restoreAllMocks();
  setSubscriptions({ subscriptions: {} });
  deleteNotices();
  engine.reset();
  setClock();
  setOutcomePipeline(pipeline);
});

function fixture() {
  setOutcomePipeline('v1');
  setClock('2026-11-23T00:00:00Z');
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({ nonRandom: 17, drawProfiles: [{ drawSize: 8 }] });
  const draw = tournamentRecord.events[0].drawDefinitions[0];
  const first = draw.structures[0].matchUps.filter((m) => m.roundNumber === 1).slice(0, 2);
  const directives = first.map((m, i) => ({
    method: 'setMatchUpStatus',
    params: { drawId: draw.drawId, matchUpId: m.matchUpId, outcome: won(i === 0 ? 1 : 2) },
  }));
  return { record: tournamentRecord as Tournament, directives };
}

function play(mode: OutcomePipelineMode, entry: ReturnType<typeof fixture>, explain: boolean) {
  setSubscriptions({ subscriptions: {} });
  setOutcomePipeline(mode);
  engine.setState(structuredClone(entry.record));
  deleteNotices();
  const id = entry.record.tournamentId;
  const held = getTournamentRecords()[id];
  const draw = held.events![0].drawDefinitions![0];
  const before = objectGraph(held);
  const delivered = vi.fn();
  setSubscriptions({ subscriptions: Object.fromEntries(TOPICS.map((t) => [t, delivered])) });
  // The pending query is for the receiver. Directing a winner into it changes its
  // occupied sides without replacing this deferred score notice by the root's.
  const query = { drawDefinition: draw, tournamentRecord: held, matchUpId: entry.directives[0].params.matchUpId };
  const nextId = getInContextMatchUp(query)!.winnerMatchUpId!;
  expect(nextId).toBeTruthy();
  deferInContextMatchUp({
    matchUpId: nextId,
    tournamentId: id,
    inContextMatchUp: deferredQuery(getInContextMatchUp, { ...query, matchUpId: nextId }),
  });
  const receiverQuery = { ...query, matchUpId: nextId };
  expect(getInContextMatchUp(receiverQuery)?.drawPositions?.filter(Boolean) ?? []).toEqual([]);
  const pendingBefore = objectGraph(getPayloads({ topic: UPDATE_INCONTEXT_MATCHUP }));
  setClock('2026-11-23T00:01:00Z');
  const readings: unknown[] = [],
    errors: unknown[] = [];
  const detail = observeClockReadings(
    () => (r) => readings.push(r),
    () => {
      if (!explain) return engine.dryRun(structuredClone(entry.directives));
      const first = entry.directives[0];
      const result = engine.explain('setMatchUpStatus', structuredClone(first.params));
      expect(result.touchesPaths).toEqual(result.detail.patch.map((op) => op.path));
      expect(result.willEmitTopics).toEqual(result.detail.willEmitNotices.map((n) => n.topic));
      return result.detail;
    },
    errors,
  );
  expect(errors).toEqual([]);
  expect(delivered).not.toHaveBeenCalled();
  expect(getTournamentRecords()[id]).toBe(held);
  expect(objectGraph(held)).toStrictEqual(before);
  expect(detail.wouldSucceed).toBe(true);
  expect(detail.rolledBack).toBe(true);
  expect(detail.patch.length).toBeGreaterThan(0);
  const payloads = detail.willEmitNotices.find((n) => n.topic === MODIFY_DRAW_DEFINITION)?.payloads as {
    drawDefinition: DrawDefinition;
  }[];
  const privateDraw = payloads?.at(-1)?.drawDefinition;
  expect(privateDraw).toBeDefined();
  expect(privateDraw).not.toBe(draw);
  const pending = (
    detail.willEmitNotices.find((n) => n.topic === UPDATE_INCONTEXT_MATCHUP)?.payloads as {
      inContextMatchUp: { matchUpId: string; drawPositions?: number[] };
    }[]
  ).find((p) => p.inContextMatchUp.matchUpId === nextId);
  expect(pending).toBeDefined();
  const projectedPositions = pending!.inContextMatchUp.drawPositions;
  expect(projectedPositions?.filter(Boolean)).toHaveLength(explain ? 1 : 2);
  expect(objectGraph(getPayloads({ topic: UPDATE_INCONTEXT_MATCHUP }))).toStrictEqual(pendingBefore);
  const calls = explain ? entry.directives.slice(0, 1) : entry.directives;
  for (const { params } of calls) {
    const match = privateDraw!.structures![0].matchUps!.find((m) => m.matchUpId === params.matchUpId);
    expect(match?.winningSide).toBe(params.outcome.winningSide);
  }
  const observed = {
    returns: detail.results.map(captureReturn),
    patch: objectGraph(detail.patch),
    draw: objectGraph(privateDraw),
    notices: objectGraph(detail.willEmitNotices),
    readings,
  };
  if (mode === 'v1') {
    const committed = engine.executionQueue(structuredClone(calls));
    expect(committed).toMatchObject({ success: true });
    expect(committed.results).toHaveLength(calls.length);
    committed.results!.forEach((result, i) => {
      const returned = captureReturn(result);
      expectReturnParity(observed.returns[i], returned);
      expect(observed.returns[i].arrayStack).toBe(returned.arrayStack);
    });
    const committedRecord = getTournamentRecords()[id];
    const committedDraw = committedRecord.events![0].drawDefinitions![0];
    expect(observed.draw).toStrictEqual(objectGraph(committedDraw));
    const committedReceiver = getInContextMatchUp({
      matchUpId: nextId,
      drawDefinition: committedDraw,
      tournamentRecord: committedRecord,
    });
    expect(projectedPositions).toStrictEqual(committedReceiver?.drawPositions);
    expect(delivered).toHaveBeenCalled();
  }
  return observed;
}

it.each([false, true])('isolates native outcome results, draw, ordered notices and clock (explain %s)', (explain) => {
  const entry = fixture();
  const recorder = vi.spyOn(recording, 'recordWholeCall').mockReturnValue(undefined);
  const writer = vi.spyOn(stateWriter, 'setMatchUpState');
  const expected = play('v1', entry, explain);
  for (const mode of ['v2', 'differential'] as const) {
    writer.mockClear();
    const actual = play(mode, entry, explain);
    expect(recorder).not.toHaveBeenCalled();
    if (mode === 'v2') expect(writer).not.toHaveBeenCalled();
    expect(actual.returns).toHaveLength(expected.returns.length);
    actual.returns.forEach((r, i) => {
      expectReturnParity(r, expected.returns[i]);
      expect(r.arrayStack).toBe(expected.returns[i].arrayStack);
    });
    expect(actual.draw).toStrictEqual(expected.draw);
    expect(actual.patch).toStrictEqual(expected.patch);
    expect(actual.notices).toStrictEqual(expected.notices);
    expect(actual.readings).toStrictEqual(expected.readings);
  }
});
