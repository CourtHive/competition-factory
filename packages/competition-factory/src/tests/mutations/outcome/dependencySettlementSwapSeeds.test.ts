import {
  applyOutcome,
  findByCoord,
  generateDraw,
  playForward,
} from '@Tests/testHarness/exitPropagation/routeComparison';
import { matchUpsOf, positionAssignmentsOf } from '@Helpers/drawTopology/structureMembers';
import { getDrawDefinition } from '@Tests/testHarness/exitPropagation/transitions';
import { planSwapSeeds } from '@Mutate/matchUps/outcome/settlement/swapSeeds';
import { createWorkingView } from '@Mutate/matchUps/outcome/overlay';
import { buildOutcomeView } from '@Mutate/matchUps/outcome/view';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { getOutcomePipeline, setOutcomePipeline } from '@Global/state/globalState';
import { COMPASS, FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import type { OutcomeRequest } from '@Mutate/matchUps/outcome/types';
import type { DrawDefinition } from '@Types/tournamentTypes';
import { afterEach, beforeEach, expect, it } from 'vitest';

const drawId = 'swap-seed-control';
const prior = getOutcomePipeline();
beforeEach(() => setOutcomePipeline('v1'));
afterEach(() => setOutcomePipeline(prior));

function prepared(
  drawType: string = COMPASS,
  coordinate = { structureName: 'East', roundNumber: 1, roundPosition: 4 },
) {
  generateDraw(drawType, drawId, 16, 7001);
  playForward(drawId);
  const { matchUpId } = findByCoord(drawId, coordinate);
  const request = {
    matchUpId,
    winningSide: 2,
    matchUpStatus: COMPLETED,
    flags: { allowChangePropagation: true, propagateExitStatus: true, propagateRetirementAsExit: false },
  } satisfies OutcomeRequest;
  const drawDefinition: DrawDefinition = structuredClone(getDrawDefinition(drawId));
  const view = buildOutcomeView({ drawDefinition, request });
  return { drawDefinition, request, view };
}

it('projects both role changes and the downstream assignment readers of a played COMPASS flip', () => {
  const args = prepared();
  const { drawDefinition, request, view } = args;
  const before = structuredClone(drawDefinition);
  const result = planSwapSeeds(args);
  expect(result.reasons).toEqual([]);
  expect(drawDefinition).toStrictEqual(before);
  const [oldWinner, oldLoser] = [view.targets.sideParticipantIds[1], view.targets.sideParticipantIds[2]];
  expect(oldWinner).toBeTruthy();
  expect(oldLoser).toBeTruthy();
  expect(oldWinner).not.toBe(oldLoser);
  expect(result.roles).toStrictEqual([
    {
      role: 'winner',
      previousParticipantId: oldWinner,
      nextParticipantId: oldLoser,
      receiver: { matchUpId: view.targets.winnerMatchUpId, lost: oldWinner, acquired: oldLoser },
    },
    {
      role: 'loser',
      previousParticipantId: oldLoser,
      nextParticipantId: oldWinner,
      receiver: { matchUpId: view.targets.loserMatchUpId, lost: oldLoser, acquired: oldWinner },
    },
  ]);
  const working = createWorkingView({
    drawDefinition,
    matchUpsMap: getMatchUpsMap({ drawDefinition }),
    structural: view.structural,
    inContextDrawMatchUps: view.inContextDrawMatchUps!,
    clockFree: true,
  });
  expect(working.apply(result.ops).error).toBeUndefined();
  expect(applyOutcome(request.matchUpId, drawId, { winningSide: 2, matchUpStatus: COMPLETED }, true)?.success).toBe(
    true,
  );
  const actual: DrawDefinition = getDrawDefinition(drawId);
  const path = result.ops.filter((op) => op.op === 'exchangeDrawPositions');
  expect(path.length).toBeGreaterThan(0);
  for (const op of path) {
    const find = (draw: DrawDefinition) =>
      (draw.structures ?? []).flatMap((s) => matchUpsOf(s) ?? []).find((m) => m.matchUpId === op.matchUpId)!;
    expect(find(working.drawDefinition).drawPositions).toEqual(find(actual).drawPositions);
    expect(find(working.drawDefinition).winningSide).toBe(find(actual).winningSide);
  }
  expect(new Set(result.assignmentReaders.map((r) => r.structureId)).size).toBeGreaterThan(1);
  for (const r of result.assignmentReaders) {
    const holder = (draw: DrawDefinition) =>
      positionAssignmentsOf(draw.structures?.find((s) => s.structureId === r.structureId))?.find(
        (a) => a.drawPosition === r.drawPosition,
      )?.participantId;
    expect(holder(before)).toBe(r.before);
    expect(holder(actual)).toBe(r.after);
    expect(holder(working.drawDefinition)).toBe(r.after);
    const readers = view
      .inContextDrawMatchUps!.filter(
        (m) => m.structureId === r.structureId && m.drawPositions?.includes(r.drawPosition),
      )
      .map((m) => m.matchUpId);
    expect(readers.length).toBeGreaterThan(0);
    expect(r.matchUpIds).toEqual(readers);
  }
});

it('rejects an unrelated holder, reversed receiver roles, an unproved link and a held feed before emitting seeds', () => {
  const args = prepared();
  const { view } = args;
  const swap = view.targets.swap!;
  expect(swap.relabels?.length).toBeGreaterThan(0);
  const relabel = swap.relabels![0];
  const structure = args.drawDefinition.structures?.find((s) => s.structureId === relabel.structureId);
  const seat = positionAssignmentsOf(structure)!.find((a) => a.drawPosition === relabel.drawPosition)!;
  const held = seat.participantId;
  seat.participantId = 'unrelated-holder';
  expect(planSwapSeeds(args)).toMatchObject({ ops: [], roles: [], reasons: ['unverified-swap-relabel'] });
  seat.participantId = held;
  for (const [altered, reason] of [
    [
      { ...view, targets: { ...view.targets, loserMatchUpId: view.targets.winnerMatchUpId } },
      'unverified-swap-role-target',
    ],
    [
      { ...view, targets: { ...view.targets, swap: { ...swap, linkedOut: true, relabels: undefined } } },
      'unresolved-swap-links',
    ],
    [{ ...view, swapMeetsActivePosition: true }, 'held-swap-seat'],
  ] as const) {
    expect(planSwapSeeds({ ...args, view: altered })).toMatchObject({
      ops: [],
      roles: [],
      assignmentReaders: [],
      reasons: [reason],
    });
  }
});

it('requires a changing winner, both original occupants, and the actual winner path', () => {
  const args = prepared();
  const { view, request, drawDefinition } = args;
  expect(
    planSwapSeeds({ ...args, request: { ...request, flags: { ...request.flags, allowChangePropagation: false } } })
      .reasons,
  ).toEqual(['no-swap-topology']);
  const check = (v: typeof view, reason: string) =>
    expect(planSwapSeeds({ ...args, view: v })).toMatchObject({
      ops: [],
      roles: [],
      assignmentReaders: [],
      reasons: [reason],
    });
  const matches = view.inContextDrawMatchUps!;
  const source = matches.find((m) => m.matchUpId === request.matchUpId)!;
  check({ ...view, inContextDrawMatchUps: matches.filter((m) => m !== source) }, 'unresolved-swap-source');
  check(
    {
      ...view,
      inContextDrawMatchUps: matches.map((m) => (m === source ? { ...m, winningSide: request.winningSide } : m)),
    },
    'unresolved-swap-roles',
  );
  const target = matches.find((m) => m.matchUpId === view.targets.winnerMatchUpId)!;
  expect(target.structureId).toBe(source.structureId);
  check(
    {
      ...view,
      targets: {
        ...view.targets,
        swap: {
          ...view.targets.swap!,
          pathMatchUpIds: view.targets.swap!.pathMatchUpIds.filter((id) => id !== target.matchUpId),
        },
      },
    },
    'unverified-swap-grant-seat',
  );
  const seat = positionAssignmentsOf(
    drawDefinition.structures?.find((s) => s.structureId === source.structureId),
  )!.find((a) => a.drawPosition === view.targets.swap!.positionA)!;
  seat.participantId = 'stale-source-occupant';
  check(view, 'unverified-swap-occupants');
});

it('withholds a loser role receipt when both players already won before a conditional feed', () => {
  const args = prepared(FIRST_MATCH_LOSER_CONSOLATION, { structureName: 'Main', roundNumber: 2, roundPosition: 1 });
  const matches = args.view.inContextDrawMatchUps!;
  const source = matches.find((m) => m.matchUpId === args.request.matchUpId)!;
  const prior = matches.filter((m) => m.structureId === source.structureId && m.winnerMatchUpId === source.matchUpId);
  expect(prior).toHaveLength(2);
  expect(prior.every((m) => m.winningSide)).toBe(true);
  expect(args.view.targets.loserLink?.linkCondition).toBe('FIRST_MATCHUP');
  const seed = planSwapSeeds(args);
  expect(seed).toMatchObject({ ops: [], roles: [], assignmentReaders: [], reasons: ['unverified-swap-grant'] });
});
