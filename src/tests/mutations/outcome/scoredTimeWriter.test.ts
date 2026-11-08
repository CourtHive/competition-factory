import { createWorkingView } from '@Mutate/matchUps/outcome/overlay';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { canonicalJson } from '@Tools/canonicalJson';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { afterEach, expect, it, vi } from 'vitest';
import { setClock } from '@Tools/clock';
import {
  deleteNotices,
  setOutcomePipeline,
  setSubscriptions,
  setDeepCopy,
  setCapturedClock,
  setCapturedStamps,
} from '@Global/state/globalState';

// constants
import { SINGLE_ELIMINATION, ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { DOUBLE_DEFAULT, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { SINGLES, TEAM } from '@Constants/eventConstants';
import {
  MODIFY_MATCHUP,
  MODIFY_DRAW_DEFINITION,
  MODIFY_POSITION_ASSIGNMENTS,
  UPDATE_INCONTEXT_MATCHUP,
} from '@Constants/topicConstants';

const writes = vi.hoisted(() => ({
  count: 0,
  firstDraw: '',
  stampKinds: [] as { id: string; kind: string; value: unknown }[],
  cleanupFolds: 0,
  cleanupBeforeV1: 0,
  residual: false,
}));
vi.mock('@Mutate/matchUps/matchUpStatus/setMatchUpState', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    setMatchUpState: (...args: any[]) => {
      if (!writes.count) {
        writes.firstDraw = canonicalJson(args[0].drawDefinition);
        writes.stampKinds = getMatchUpsMap({ drawDefinition: args[0].drawDefinition }).drawMatchUps.map((m) => ({
          id: m.matchUpId,
          kind: m.updatedAt instanceof Date ? 'Date' : typeof m.updatedAt,
          value: m.updatedAt,
        }));
        writes.cleanupBeforeV1 = writes.cleanupFolds;
      }
      writes.count++;
      return actual.setMatchUpState(...args);
    },
  };
});
vi.mock('@Mutate/matchUps/outcome/ops', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    applyOutcomeOps: (...args: any[]) => {
      if (args[1].some((op: any) => op.op === 'clearMatchUpScoredTime')) writes.cleanupFolds++;
      return actual.applyOutcomeOps(...args);
    },
  };
});
vi.mock('@Mutate/matchUps/outcome/settleWork', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    predictSettleWork: (...args: any[]) => {
      const work = actual.predictSettleWork(...args);
      return writes.residual ? [...new Set([...work, 'reconcileDeciders'])] : work;
    },
  };
});
const topics = [MODIFY_MATCHUP, MODIFY_DRAW_DEFINITION, MODIFY_POSITION_ASSIGNMENTS, UPDATE_INCONTEXT_MATCHUP];
afterEach(() => {
  setDeepCopy(true, {});
  writes.residual = false;
  setOutcomePipeline('v1');
  setSubscriptions({ subscriptions: {} });
  setClock();
});
function replay(mode: 'v1' | 'v2' | 'differential', prepared: any, params: any, ledger = true) {
  setOutcomePipeline('v1');
  setSubscriptions({ subscriptions: {} });
  tournamentEngine.setState(structuredClone(prepared), false);
  deleteNotices();
  const notices: { topic: string; payload: any }[] = [];
  setSubscriptions({
    subscriptions: Object.fromEntries(
      topics.map((topic) => [
        topic,
        (payloads: any[]) =>
          payloads.forEach((payload) => notices.push({ topic, payload: JSON.parse(canonicalJson(payload)) })),
      ]),
    ),
  });
  setClock('2026-11-08T10:01:00.000Z');
  setOutcomePipeline(mode);
  writes.count = 0;
  writes.firstDraw = '';
  writes.cleanupFolds = 0;
  writes.cleanupBeforeV1 = 0;
  if (!ledger) {
    setCapturedClock(Date.parse('2026-11-08T10:01:00.000Z'));
    setCapturedStamps(undefined);
  }
  try {
    const { stack: _stack, ...result } = tournamentEngine.setMatchUpStatus(params) as any;
    return {
      result,
      notices,
      record: canonicalJson(tournamentEngine.getTournament().tournamentRecord),
      writes: writes.count,
    };
  } finally {
    if (!ledger) {
      setCapturedClock(undefined);
      setCapturedStamps(undefined);
    }
  }
}

for (const [name, eventType, drawType] of [
  ['singles', SINGLES, SINGLE_ELIMINATION],
  ['team', TEAM, SINGLE_ELIMINATION],
  ['rr-team', TEAM, ROUND_ROBIN],
] as const) {
  it(`owns ${name} final cleanup in stored order with identical delivered notices`, () => {
    setOutcomePipeline('v1');
    setClock('2026-11-08T10:00:00.000Z');
    setSubscriptions({ subscriptions: {} });
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId: 'd', drawSize: 8, eventType, drawType }],
      nonRandom: 7123,
      setState: true,
    });
    const record = tournamentEngine.getTournament().tournamentRecord;
    const draw = record.events[0].drawDefinitions[0];
    const hydrated = tournamentEngine.allDrawMatchUps({ drawId: 'd', inContext: true }).matchUps;
    const source = hydrated.find(
      (m: any) => m.matchUpType === eventType && m.roundNumber === 1 && m.sides?.every((s: any) => s.participantId),
    );
    expect(source).toBeDefined();
    const map = getMatchUpsMap({ drawDefinition: draw });
    const foreign = map.drawMatchUps.filter(
      (m) =>
        m.matchUpId !== source.matchUpId && !source.tieMatchUps?.some((line: any) => line.matchUpId === m.matchUpId),
    );
    const targets = eventType === TEAM ? foreign.filter((m) => m.collectionId).slice(-3) : foreign.slice(-3);
    expect(targets).toHaveLength(3);
    // Plant backwards: v1 must use stored map order, not the planting order.
    for (const target of [...targets].reverse())
      target.schedule = { ...target.schedule, scoredTime: '2026-10-24T12:00:00.000Z', scheduledTime: '13:00' };
    targets[0].updatedAt = new Date(name === 'team' ? '2027-01-01T00:00:00.000Z' : '2026-01-01T00:00:00.000Z');
    targets[1].updatedAt = '2026-11-08T09:01:00.000-01:00';
    targets[2].updatedAt = 'invalid prior stamp';
    // The source becomes scored in the base program: final cleanup must preserve its existing time.
    const own = map.drawMatchUps.find((matchUp) => matchUp.matchUpId === source.matchUpId)!;
    own.schedule = { scoredTime: '2026-10-24T11:00:00.000Z' };
    const prepared = structuredClone(record);
    const params = { drawId: 'd', matchUpId: source.matchUpId, outcome: { winningSide: 1 } };
    const reference = replay('v1', prepared, params);
    expect(writes.stampKinds.find((m) => m.id === targets[0].matchUpId)!.kind).toBe('Date');
    expect(writes.stampKinds.find((m) => m.id === targets[1].matchUpId)!.value).toBe('2026-11-08T09:01:00.000-01:00');
    expect(writes.stampKinds.find((m) => m.id === targets[2].matchUpId)!.value).toBe('invalid prior stamp');
    expect(reference.result.success).toBe(true);
    expect(reference.writes).toBeGreaterThan(0);
    const referenceDraw = JSON.parse(reference.record).events[0].drawDefinitions[0];
    expect(
      getMatchUpsMap({ drawDefinition: referenceDraw }).drawMatchUps.find((m) => m.matchUpId === source.matchUpId)!
        .schedule?.scoredTime,
    ).toBe('2026-10-24T11:00:00.000Z');
    const cleanup = reference.notices.filter(
      (n) => n.topic === MODIFY_MATCHUP && n.payload.context === 'reconcileScoredTimes',
    );
    expect(cleanup.map((n) => n.payload.matchUp.matchUpId)).toEqual(targets.map((m) => m.matchUpId));
    for (const n of cleanup) {
      expect(n.payload.matchUp.schedule.scoredTime).toBeUndefined();
      expect(n.payload.matchUp.schedule.scheduledTime).toBe('13:00');
    }
    expect(replay('v2', prepared, params)).toEqual({ ...reference, writes: 0 });
    expect(replay('differential', prepared, params)).toEqual(reference);
  });
}

it('copies a foreign TEAM dual and every line alias before folding a line-only write', () => {
  setOutcomePipeline('v1');
  setSubscriptions({ subscriptions: {} });
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId: 'd', drawSize: 8, eventType: TEAM, drawType: ROUND_ROBIN }],
    nonRandom: 7123,
    setState: true,
  });
  const tournamentRecord = tournamentEngine.getTournament().tournamentRecord;
  const event = tournamentRecord.events[0];
  const drawDefinition = event.drawDefinitions[0];
  const matchUpsMap = getMatchUpsMap({ drawDefinition });
  const parent = matchUpsMap.drawMatchUps.filter((m) => m.tieMatchUps?.length).at(-1)!;
  const [line, sibling] = parent.tieMatchUps!;
  line.schedule = { scoredTime: '2026-10-24T12:00:00.000Z', scheduledTime: '13:00' };
  sibling.schedule = { scoredTime: '2026-10-24T12:00:00.000Z', scheduledTime: '14:00' };
  const before = canonicalJson(tournamentRecord);
  const inContextDrawMatchUps = getAllDrawMatchUps({
    tournamentRecord,
    event,
    drawDefinition,
    matchUpsMap,
    inContext: true,
  }).matchUps!;
  const working = createWorkingView({ tournamentRecord, event, drawDefinition, matchUpsMap, inContextDrawMatchUps });
  expect(working.apply([{ op: 'clearMatchUpScoredTime', matchUpId: line.matchUpId }]).error).toBeUndefined();
  const copied = (id: string) => working.matchUpsMap.drawMatchUps.find((m) => m.matchUpId === id)!;
  const clonedParent = copied(parent.matchUpId);
  expect(clonedParent).not.toBe(parent);
  for (const original of parent.tieMatchUps!) {
    expect(copied(original.matchUpId)).not.toBe(original);
    expect(copied(original.matchUpId)).toBe(clonedParent.tieMatchUps!.find((m) => m.matchUpId === original.matchUpId));
  }
  expect(copied(line.matchUpId).schedule).toEqual({ scheduledTime: '13:00' });
  expect(
    working.inContextDrawMatchUps
      .find((m) => m.matchUpId === parent.matchUpId)!
      .tieMatchUps!.find((m) => m.matchUpId === line.matchUpId)!.schedule?.scoredTime,
  ).toBeUndefined();
  expect(
    working.apply([
      { op: 'setMatchUpSchedule', matchUpId: parent.matchUpId, schedule: { scheduledTime: '15:00' } },
      { op: 'clearMatchUpScoredTime', matchUpId: sibling.matchUpId },
    ]).error,
  ).toBeUndefined();
  expect(copied(parent.matchUpId)).toBe(clonedParent);
  expect(copied(line.matchUpId).schedule?.scoredTime).toBeUndefined();
  expect(copied(sibling.matchUpId).schedule).toEqual({ scheduledTime: '14:00' });
  expect(canonicalJson(tournamentRecord)).toBe(before);
  expect(working.matchUpsMap.drawMatchUps.map((m) => m.matchUpId)).toEqual(
    matchUpsMap.drawMatchUps.map((m) => m.matchUpId),
  );
});

it.each([true, false])('preserves cleanup-only effects and callbacks with stamp ledger %s', (ledger) => {
  setOutcomePipeline('v1');
  setClock('2026-11-08T10:00:00.000Z');
  setSubscriptions({ subscriptions: {} });
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId: 'd', drawSize: 8 }],
    nonRandom: 4000,
    setState: true,
  });
  const source = tournamentEngine
    .allDrawMatchUps({ drawId: 'd' })
    .matchUps.find((m) => m.roundNumber === 1 && m.roundPosition === 1)!;
  const params = { drawId: 'd', matchUpId: source.matchUpId, outcome: { matchUpStatus: DOUBLE_DEFAULT } };
  expect(tournamentEngine.setMatchUpStatus(params).success).toBe(true);
  const prepared = tournamentEngine.getTournament().tournamentRecord;
  const draw = prepared.events[0].drawDefinitions[0];
  const target = getMatchUpsMap({ drawDefinition: draw }).drawMatchUps.find(
    (m) => m.roundNumber === 1 && m.roundPosition === 4,
  )!;
  target.schedule = { scoredTime: '2026-10-24T12:00:00.000Z', scheduledTime: '13:00' };
  const reference = replay('v1', prepared, params, ledger);
  expect(reference.result.success).toBe(true);
  expect(reference.notices.filter((n) => n.topic === UPDATE_INCONTEXT_MATCHUP)).toEqual([]);
  expect(
    reference.notices
      .filter((n) => n.topic === MODIFY_MATCHUP)
      .map((n) => [n.payload.matchUp.matchUpId, n.payload.context]),
  ).toEqual([[target.matchUpId, 'reconcileScoredTimes']]);
  expect(replay('v2', prepared, params, ledger)).toEqual({ ...reference, writes: ledger ? 0 : reference.writes });
  expect(replay('differential', prepared, params, ledger)).toEqual(reference);
});

it('leaves foreign TEAM lines untouched when a remaining predicted pass refuses the completed cleanup', () => {
  setOutcomePipeline('v1');
  setClock('2026-11-08T10:00:00.000Z');
  setSubscriptions({ subscriptions: {} });
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId: 'd', drawSize: 8, eventType: TEAM }],
    nonRandom: 7001,
    setState: true,
  });
  const source = tournamentEngine
    .allDrawMatchUps({ drawId: 'd', inContext: true, matchUpFilters: { matchUpTypes: [TEAM] } })
    .matchUps.find((m) => m.roundNumber === 1)!;
  const prepared = tournamentEngine.getTournament().tournamentRecord;
  const draw = prepared.events[0].drawDefinitions[0];
  const map = getMatchUpsMap({ drawDefinition: draw });
  const foreign = map.drawMatchUps.filter((m) => m.tieMatchUps?.length && m.matchUpId !== source.matchUpId).at(-1)!;
  const target = foreign.tieMatchUps![0];
  target.schedule = { scoredTime: '2026-10-24T12:00:00.000Z', scheduledTime: '13:00' };
  const params = { drawId: 'd', matchUpId: source.matchUpId, outcome: { winningSide: 1 } };
  const reference = replay('v1', prepared, params);
  const originalAtWrite = writes.firstDraw;
  expect(reference.result.success).toBe(true);
  expect(reference.writes).toBeGreaterThan(0);
  expect(
    JSON.parse(originalAtWrite)
      .structures.flatMap((s: any) => s.matchUps ?? [])
      .flatMap((m: any) => m.tieMatchUps ?? [])
      .find((m: any) => m.matchUpId === target.matchUpId).schedule.scoredTime,
  ).toBe('2026-10-24T12:00:00.000Z');
  // Deliberately retain another predictor's refusal after cleanup; this does not claim real decider work.
  writes.residual = true;
  expect(replay('v2', prepared, params)).toEqual(reference);
  expect(writes.firstDraw).toBe(originalAtWrite);
  expect(writes.cleanupBeforeV1).toBeGreaterThan(0);
  expect(replay('differential', prepared, params)).toEqual(reference);
  expect(writes.firstDraw).toBe(originalAtWrite);
  expect(writes.cleanupBeforeV1).toBeGreaterThan(0);
});

it('restores the actual event identity when final cleanup follows a quiet withdrawal', () => {
  setOutcomePipeline('v1');
  setClock('2026-11-08T10:00:00.000Z');
  setSubscriptions({ subscriptions: {} });
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId: 'd', drawSize: 8 }],
    nonRandom: 7123,
    setState: true,
  });
  const source = tournamentEngine
    .allDrawMatchUps({ drawId: 'd', inContext: true })
    .matchUps.find((m) => m.roundNumber === 1 && m.roundPosition === 1)!;
  expect(
    tournamentEngine.setMatchUpStatus({ drawId: 'd', matchUpId: source.matchUpId, outcome: { winningSide: 1 } })
      .success,
  ).toBe(true);
  const prepared = tournamentEngine.getTournament().tournamentRecord;
  const draw = prepared.events[0].drawDefinitions[0];
  const target = getMatchUpsMap({ drawDefinition: draw }).drawMatchUps.find(
    (m) => m.matchUpId === source.winnerMatchUpId,
  )!;
  target.schedule = { scoredTime: '2026-10-24T12:00:00.000Z', scheduledTime: '13:00' };
  const params = {
    drawId: 'd',
    matchUpId: source.matchUpId,
    outcome: { matchUpStatus: TO_BE_PLAYED, winningSide: undefined, score: { sets: [] } },
    allowChangePropagation: true,
  };
  const reference = replay('v1', prepared, params);
  expect(reference.result.success).toBe(true);
  const notice = reference.notices.find(
    (n) => n.topic === MODIFY_MATCHUP && n.payload.matchUp.matchUpId === target.matchUpId,
  )!;
  expect(notice.payload.context).toBe('reconcileScoredTimes');
  expect(notice.payload.eventId).toBe(prepared.events[0].eventId);
  expect(notice.payload.tournamentId).toBe(prepared.tournamentId);
  expect(replay('v2', prepared, params)).toEqual({ ...reference, writes: 0 });
  expect(replay('differential', prepared, params)).toEqual(reference);
});
