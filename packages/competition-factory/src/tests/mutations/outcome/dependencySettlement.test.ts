import { buildDependencies } from '@Mutate/matchUps/outcome/settlement/dependencies';
import { FIRST_MATCH_LOSER_CONSOLATION, FIRST_MATCHUP } from '@Constants/drawDefinitionConstants';
import { predictSettlement } from '@Mutate/matchUps/outcome/settlement';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { reconcileReceiver, type Input } from '@Mutate/matchUps/outcome/settlement/receiver';
import { settlementWorklist } from '@Mutate/matchUps/outcome/settlement/worklist';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { createWorkingView } from '@Mutate/matchUps/outcome/overlay';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

import { COMPLETED, DEFAULTED, DOUBLE_DEFAULT, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import type { HydratedMatchUp } from '@Types/hydrated';
import type { OutcomeRequest } from '@Mutate/matchUps/outcome/types';
import type { DrawDefinition } from '@Types/tournamentTypes';

const flags = { propagateRetirementAsExit: false, propagateExitStatus: true };
function bracket() {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, drawId: 'tree' }],
    nonRandom: 1,
  });
  const event = tournamentRecord.events[0];
  const drawDefinition = event.drawDefinitions[0];
  const source = drawDefinition.structures[0].matchUps.find((m) => m.roundNumber === 1);
  const parent = drawDefinition.structures[0].matchUps.find((m) => m.matchUpId === source.winnerMatchUpId);
  const final = drawDefinition.structures[0].matchUps.find((m) => m.roundNumber === 3);
  return { tournamentRecord, event, drawDefinition, source, parent, final };
}

it('predicts the requested winner at the immediate receiver without changing a live record or its input score', () => {
  const { tournamentRecord, event, drawDefinition, source, parent } = bracket();
  const request: OutcomeRequest = { matchUpId: source.matchUpId, matchUpStatus: COMPLETED, winningSide: 1, flags };
  const original = structuredClone(tournamentRecord);
  const result = predictSettlement({ tournamentRecord, event, drawDefinition, request, capturedClock: 100 });
  const matches = getMatchUpsMap({ drawDefinition: result.drawDefinition }).drawMatchUps;
  expect(matches.find((m) => m.matchUpId === parent.matchUpId)?.drawPositions).toContain(source.drawPositions[0]);
  expect(matches.find((m) => m.matchUpId === source.matchUpId)?.winningSide).toBe(1);
  expect(tournamentRecord).toStrictEqual(original);
});

it('revisits a receiver after a second donor decision and again when a previous grant is withdrawn', () => {
  const { drawDefinition, event, tournamentRecord, source, parent } = bracket();
  const matchUpsMap = getMatchUpsMap({ drawDefinition });
  const { matchUps = [] } = getAllDrawMatchUps({
    drawDefinition,
    event,
    tournamentRecord,
    inContext: true,
    matchUpsMap,
  });
  const working = createWorkingView({
    drawDefinition,
    event,
    tournamentRecord,
    matchUpsMap,
    inContextDrawMatchUps: matchUps,
    clockFree: true,
  });
  const queue = settlementWorklist(working, flags);
  const other = matchUps.find((m) => m.winnerMatchUpId === parent.matchUpId && m.matchUpId !== source.matchUpId)!;
  const positions = () =>
    working.inContextDrawMatchUps.find((m) => m.matchUpId === parent.matchUpId)!.drawPositions!.filter(Boolean);
  for (const matchUpId of [source.matchUpId, other.matchUpId]) {
    queue.fold([{ op: 'setMatchUpResult', matchUpId, matchUpStatus: COMPLETED, winningSide: 1 }]);
    queue.drain('direction');
  }
  expect(positions()).toHaveLength(2);
  queue.fold([
    { op: 'setMatchUpResult', matchUpId: source.matchUpId, matchUpStatus: TO_BE_PLAYED, deletesWinningSide: true },
  ]);
  queue.drain('direction');
  expect(positions()).toEqual([other.drawPositions![0]]);
  expect(queue.visited.filter((v) => v.matchUpId === parent.matchUpId)).toHaveLength(3);
});

function convergence() {
  const match = (id: string, round: number, pos: number) =>
    ({
      matchUpId: id,
      structureId: 'main',
      roundNumber: round,
      roundPosition: pos,
      matchUpStatus: DOUBLE_DEFAULT,
      drawPositions: [],
      sides: [],
    }) as unknown as HydratedMatchUp;
  const first = match('first', 1, 1),
    second = match('second', 1, 2),
    target = match('target', 2, 1);
  const input = (source: HydratedMatchUp): Input => ({
    source,
    edge: { source: source.matchUpId, receiver: 'target', role: 'winner', shared: false },
    grant: {
      mark: { sourceMatchUpId: source.matchUpId, matchUpStatus: DEFAULTED, previousMatchUpStatus: DOUBLE_DEFAULT },
    },
  });
  const previous = [input(first), input(second)];
  target.sideExitProvenance = { 1: previous[0].grant.mark!, 2: previous[1].grant.mark! };
  const current: Input[] = [
    { ...previous[0], source: { ...first, matchUpStatus: TO_BE_PLAYED }, grant: {} },
    previous[1],
  ];
  const frame = {
    drawDefinition: { structures: [] } as unknown as DrawDefinition,
    inContextDrawMatchUps: [first, second, target],
  };
  return { target, previous, current, frame };
}

it('subtracts one origin from a double without awarding an empty side, and keeps the other origin', () => {
  const { target, previous, current, frame } = convergence();
  const { ops, reasons } = reconcileReceiver(frame, target, previous, current, false);
  expect(reasons).toEqual([]);
  expect(ops).toContainEqual(
    expect.objectContaining({ op: 'setMatchUpResult', matchUpStatus: DEFAULTED, winningSide: undefined }),
  );
  expect(ops).toContainEqual({
    op: 'setSideExitProvenance',
    matchUpId: 'target',
    provenance: { 2: previous[1].grant.mark },
  });
});

it.each(['wrong donor', 'stale status', 'swapped side', 'independent score'])(
  'rejects %s evidence before a re-award',
  (damage) => {
    const { target, previous, current, frame } = convergence();
    if (damage === 'wrong donor')
      target.sideExitProvenance![2] = { ...target.sideExitProvenance![2], sourceMatchUpId: 'other-edge' };
    if (damage === 'stale status')
      current[1] = { ...current[1], source: { ...current[1].source, matchUpStatus: TO_BE_PLAYED } };
    if (damage === 'swapped side')
      target.sideExitProvenance = { 1: target.sideExitProvenance![2], 2: target.sideExitProvenance![1] };
    if (damage === 'independent score') target.score = { sets: [{ side1Score: 6, side2Score: 1 }] };
    const result = reconcileReceiver(frame, target, previous, current, false);
    expect(result.ops).toEqual([]);
    expect(result.reasons).toHaveLength(1);
  },
);

it('keeps the other live grant to the same occupied assignment on a withdrawal', () => {
  const { drawDefinition, source } = bracket();
  const structure = drawDefinition.structures[0];
  const pos = source.drawPositions[0];
  const participantId = structure.positionAssignments.find((a) => a.drawPosition === pos).participantId;
  const target = {
    ...source,
    structureId: structure.structureId,
    sides: [{ sideNumber: 1, drawPosition: pos, participantId }],
  } as HydratedMatchUp;
  function input(id: string): Input {
    return {
      source: { ...target, structureId: 'feed', matchUpId: id, winningSide: 1 },
      edge: { source: id, receiver: target.matchUpId, role: 'winner', shared: false, position: pos },
      grant: { participant: participantId, sourcePosition: pos },
    };
  }
  const a = input('a'),
    b = input('b');
  const frame = { drawDefinition, inContextDrawMatchUps: [a.source, b.source, target] };
  const lost = { ...a, grant: {} };
  expect(reconcileReceiver(frame, target, [a, b], [lost, b], false)).toEqual({ ops: [], reasons: [] });
  expect(reconcileReceiver(frame, target, [a, b], [lost, { ...b, grant: {} }], false).ops).toEqual([
    {
      op: 'clearPosition',
      structureId: target.structureId,
      drawPosition: pos,
      participantId,
    },
  ]);
});

it('a withdrawn double resets its quiet onward holder and shares the production blank score across both resets', () => {
  const { drawDefinition, tournamentRecord, event, source, parent, final } = bracket();
  Object.assign(source, { matchUpStatus: DOUBLE_DEFAULT });
  Object.assign(parent, {
    matchUpStatus: DEFAULTED,
    sideExitProvenance: {
      1: { sourceMatchUpId: source.matchUpId, matchUpStatus: DEFAULTED, previousMatchUpStatus: DOUBLE_DEFAULT },
    },
  });
  const request: OutcomeRequest = {
    flags,
    matchUpId: source.matchUpId,
    matchUpStatus: 'IN_PROGRESS',
    score: { sets: [{ side1Score: 3, side2Score: 2 }] },
  };
  const before = structuredClone(tournamentRecord);
  const model = predictSettlement({ request, drawDefinition, tournamentRecord, event, capturedClock: 100 });
  const byId = new Map(
    getMatchUpsMap({ drawDefinition: model.drawDefinition }).drawMatchUps.map((m) => [m.matchUpId, m]),
  );
  expect(byId.get(parent.matchUpId)?.matchUpStatus).toBe(TO_BE_PLAYED);
  expect(byId.get(final.matchUpId)?.score?.scoreStringSide1).toBe('');
  expect(byId.get(final.matchUpId)?.score).toBe(byId.get(parent.matchUpId)?.score);
  expect(byId.get(source.matchUpId)?.score).toBe(request.score);
  expect(tournamentRecord).toStrictEqual(before);
});

it.each([64, 65])('directs a resubmitted root before spending the separate %i forward actions', (count) => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 256, completionGoal: 128 }],
    nonRandom: 443,
  });
  const event = tournamentRecord.events[0],
    drawDefinition = event.drawDefinitions[0];
  const matches = drawDefinition.structures[0].matchUps;
  const first = matches.filter((m) => m.roundNumber === 1);
  const absent = new Set(first.slice(0, count + 1).map((m) => m.drawPositions[m.winningSide - 1]));
  for (const m of matches.filter((m) => m.roundNumber === 2))
    m.drawPositions = m.drawPositions.filter((p) => !absent.has(p));
  const root = first[0];
  const request: OutcomeRequest = {
    flags,
    matchUpId: root.matchUpId,
    winningSide: root.winningSide,
    score: root.score,
  };
  const model = predictSettlement({ drawDefinition, tournamentRecord, event, request });
  const second = model.drawDefinition.structures?.[0].matchUps?.filter((m) => m.roundNumber === 2);
  expect(second?.flatMap((m) => m.drawPositions ?? []).filter(Boolean)).toHaveLength(count === 64 ? 128 : 127);
  expect(model.exhausted).toBe(count === 64 ? undefined : first[65].matchUpId);
});

it('copies every named winner before withdrawing a BYE, even when an own undefined value is unchanged', () => {
  const { drawDefinition, source, parent, final } = bracket();
  const structure = drawDefinition.structures[0];
  const seat = structure.positionAssignments[0];
  Object.assign(seat, { bye: true, byeFromPropagation: true });
  Object.assign(parent, { winningSide: 1 });
  Object.assign(source, { winningSide: undefined });
  const { matchUps = [] } = getAllDrawMatchUps({ drawDefinition, inContext: true });
  const working = createWorkingView({
    drawDefinition,
    inContextDrawMatchUps: matchUps,
    matchUpsMap: getMatchUpsMap({ drawDefinition }),
    clockFree: true,
  });
  function freeze(value: unknown) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
    Object.freeze(value);
    Object.values(value).forEach(freeze);
  }
  freeze(drawDefinition);
  expect(
    working.apply([
      {
        op: 'withdrawBye',
        structureId: structure.structureId,
        drawPosition: seat.drawPosition,
        clearedWinnerIds: [source.matchUpId, parent.matchUpId],
      },
    ]),
  ).toEqual({});
  const byId = new Map(working.matchUpsMap.drawMatchUps.map((m) => [m.matchUpId, m]));
  expect(byId.get(parent.matchUpId)?.winningSide).toBeUndefined();
  expect(byId.get(source.matchUpId)).not.toBe(source);
  expect(byId.get(final.matchUpId)).toBe(final);
  expect(parent.winningSide).toBe(1);
  expect(seat.bye).toBe(true);
});

it('indexes a later first-match loser receiver by its actual feeder positions and updates origin readers on relabel', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 8 }],
    nonRandom: 114,
  });
  const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
  const { matchUps = [] } = getAllDrawMatchUps({ drawDefinition, inContext: true });
  const dep = buildDependencies({ drawDefinition, inContextDrawMatchUps: matchUps });
  const edge = [...dep.outgoing.values()]
    .flat()
    .find((e) => e.role === 'loser' && e.link?.linkCondition === FIRST_MATCHUP)!;
  const donor = matchUps.find((m) => m.matchUpId === edge.source)!;
  const early = matchUps.find((m) => m.structureId === donor.structureId && m.roundNumber === 1)!;
  const held = early.drawPositions![0];
  dep.indexReaders({
    ...donor,
    drawPositions: [held],
    sideExitProvenance: { 1: { sourceMatchUpId: early.matchUpId, previousMatchUpStatus: COMPLETED } },
  });
  expect(dep.eligibilityTargets(early)).toContain(edge.receiver);
  expect(dep.markReaders.get(early.matchUpId)).toContain(donor.matchUpId);
  dep.indexReaders({ ...donor, drawPositions: [], sideExitProvenance: undefined });
  expect(dep.eligibilityTargets(early)).not.toContain(edge.receiver);
  expect(dep.markReaders.get(early.matchUpId)).not.toContain(donor.matchUpId);
});
