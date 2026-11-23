import { getOutcomePipeline, setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { getDrawDefinition, getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { SETTLE_PASS_LIMITS } from '@Mutate/matchUps/matchUpStatus/settleBounds';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { inspectHeldPass, heldDirectionInputs } from '@Mutate/matchUps/outcome/settlement/bounds';
import { createWorkingView } from '@Mutate/matchUps/outcome/overlay';
import { predictSettlement } from '@Mutate/matchUps/outcome/settlement';
import { nextPlayable } from '@Tests/testHarness/exitPropagation/driver';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { FIRST_MATCH_LOSER_CONSOLATION, DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { DEFAULTED, DOUBLE_WALKOVER, WALKOVER, COMPLETED } from '@Constants/matchUpStatusConstants';
import { SETTLE_BOUND_REACHED } from '@Constants/errorConditionConstants';
import { matchUpsOf, positionAssignmentsOf } from '@Helpers/drawTopology/structureMembers';
import type { DrawDefinition, MatchUpStatusUnion } from '@Types/tournamentTypes';

const initial = getOutcomePipeline();
const flags = { propagateExitStatus: true, propagateRetirementAsExit: false };
const drawId = 'internal-bound';

beforeEach(() => {
  setOutcomePipeline('v1');
  setSubscriptions({});
});
afterEach(() => setOutcomePipeline(initial));

function prediction(drawDefinition: DrawDefinition, matchUpId: string, site: keyof typeof SETTLE_PASS_LIMITS) {
  const bound = SETTLE_PASS_LIMITS[site];
  SETTLE_PASS_LIMITS[site] = 0;
  try {
    return predictSettlement({ drawDefinition, request: { matchUpId, matchUpStatus: DOUBLE_WALKOVER, flags } });
  } finally {
    SETTLE_PASS_LIMITS[site] = bound;
  }
}

it('requires a live held exit for a zero held-pass budget', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 8, participantsCount: 7 }],
    nonRandom: 217,
    setState: true,
  });
  const first = nextPlayable(drawId).matchUpId;
  expect(prediction(getDrawDefinition(drawId), first, 'heldExits').result?.error).toBeUndefined();
  for (const outcome of [{ matchUpStatus: DOUBLE_WALKOVER }, { winningSide: 1 }, { winningSide: 1 }]) {
    expect(
      tournamentEngine.setMatchUpStatus({
        drawId,
        matchUpId: nextPlayable(drawId).matchUpId,
        outcome,
        propagateExitStatus: true,
      }).success,
    ).toBe(true);
  }
  const before: DrawDefinition = getDrawDefinition(drawId);
  const original = structuredClone(before);
  const answer = prediction(before, nextPlayable(drawId).matchUpId, 'heldExits');
  expect(answer.result).toMatchObject({ error: SETTLE_BOUND_REACHED, info: 'sendHeldExitsOn' });
  expect(answer.effectsComplete).toBe(false);
  expect(before).toStrictEqual(original);
});

function strandedPrefix() {
  expect(
    prepareDraw(
      { drawType: DOUBLE_ELIMINATION, propagateExitStatus: true, participantsCount: 11, drawSize: 16, seed: 21138954 },
      drawId,
    ),
  ).toBe(true);
  const root = (r: number, p: number) =>
    getDrawMatchUps(drawId).find((m) => m.structureName === 'Main' && m.roundNumber === r && m.roundPosition === p)
      .matchUpId;
  const steps: [number, number, { matchUpStatus?: MatchUpStatusUnion; winningSide?: number }][] = [
    [1, 5, { matchUpStatus: DEFAULTED, winningSide: 1 }],
    [1, 7, { matchUpStatus: WALKOVER, winningSide: 2 }],
    [2, 3, { matchUpStatus: DEFAULTED, winningSide: 1 }],
    [2, 4, { matchUpStatus: WALKOVER, winningSide: 2 }],
    [3, 2, { matchUpStatus: DOUBLE_WALKOVER }],
    [1, 4, { winningSide: 2 }],
    [2, 1, { matchUpStatus: WALKOVER, winningSide: 1 }],
  ];
  for (const [r, p, outcome] of steps)
    expect(
      tournamentEngine.setMatchUpStatus({ drawId, matchUpId: root(r, p), outcome, propagateExitStatus: true }).success,
    ).toBe(true);
  const before: DrawDefinition = structuredClone(getDrawDefinition(drawId));
  const stored = (id: string) =>
    before.structures!.flatMap((s) => matchUpsOf(s) ?? []).find((m) => m.matchUpId === id)!;
  return { before, root: root(2, 2), stored, oldDonor: root(1, 5) };
}

it('requires the named carrier and a live crossing destination after a stranded convergence produces', () => {
  const { before, root, stored, oldDonor } = strandedPrefix();
  const original = structuredClone(before);
  expect(prediction(before, root, 'strandedConvergences').result).toMatchObject({
    error: SETTLE_BOUND_REACHED,
    info: 'produceStrandedConvergences',
  });
  expect(prediction(before, root, 'linkCrossings').result).toMatchObject({
    error: SETTLE_BOUND_REACHED,
    info: 'crossLinksThroughByes',
  });
  expect(before).toStrictEqual(original);
  const carrier = stored(stored(root).loserMatchUpId!);
  const pending = stored(carrier.winnerMatchUpId!);
  // Inspect a single phase directly: the preceding worklist can repair a stale mark in
  // a full prediction. The carrier rule itself must still require a live opposite donor.
  const working = workingDraw(prediction(before, root, 'strandedConvergences').drawDefinition);
  const request = { matchUpId: root, matchUpStatus: DOUBLE_WALKOVER, flags } as const;
  const converges = () =>
    heldDirectionInputs(working, before, request).some(
      (op) =>
        op.op === 'setMatchUpResult' && op.matchUpId === pending.matchUpId && op.matchUpStatus === DOUBLE_WALKOVER,
    );
  expect(converges()).toBe(true);
  const entries = Object.entries(pending.sideExitProvenance ?? {});
  expect(entries).toHaveLength(1);
  const [side, opposite] = entries[0];
  expect(opposite.previousMatchUpStatus).toBe(DOUBLE_WALKOVER);
  expect(
    working.apply([
      {
        op: 'setSideExitProvenance',
        matchUpId: pending.matchUpId,
        provenance: { [side]: { ...opposite, sourceMatchUpId: oldDonor } },
      },
    ]),
  ).toEqual({});
  expect(converges()).toBe(false);
  const mark = Object.values(carrier.sideExitProvenance ?? {}).find((entry) => entry.sourceMatchUpId === oldDonor)!;
  expect(mark.matchUpStatus).toBe(DEFAULTED);
  mark.sourceMatchUpId = root;
  expect(prediction(before, root, 'strandedConvergences').result?.error).toBeUndefined();
  mark.sourceMatchUpId = oldDonor;
  const donor = getDrawMatchUps(drawId).find((m) => m.matchUpId === oldDonor);
  const loser = donor.sides.find((s) => s.sideNumber === 3 - donor.winningSide).participantId;
  const structure = before.structures!.find((s) => matchUpsOf(s)?.includes(carrier));
  const carriedSeat = positionAssignmentsOf(structure)!.find((a) => a.participantId === loser)!;
  expect(carrier.drawPositions).toContain(carriedSeat.drawPosition);
  carriedSeat.participantId = 'unrelated-occupant';
  expect(prediction(before, root, 'strandedConvergences').result?.error).not.toEqual(SETTLE_BOUND_REACHED);
  carriedSeat.participantId = loser;
  const crossing = getDrawMatchUps(drawId).find((m) => m.structureName === 'Backdraw' && m.roundNumber === 6);
  const destination = stored(crossing.winnerMatchUpId);
  destination.winningSide = 1;
  destination.matchUpStatus = COMPLETED;
  expect(prediction(before, root, 'linkCrossings').result?.error).toBeUndefined();
});

function workingDraw(drawDefinition: DrawDefinition) {
  const matchUpsMap = getMatchUpsMap({ drawDefinition });
  const { matchUps = [] } = getAllDrawMatchUps({ drawDefinition, matchUpsMap, inContext: true });
  return createWorkingView({ drawDefinition, matchUpsMap, inContextDrawMatchUps: matchUps, clockFree: true });
}

it('distinguishes a crossing already due from a crossing that still depends on a production', () => {
  const { root, before } = strandedPrefix();
  expect(
    tournamentEngine.setMatchUpStatus({
      drawId,
      matchUpId: root,
      outcome: { matchUpStatus: DOUBLE_WALKOVER },
      propagateExitStatus: true,
    }).success,
  ).toBe(true);
  const state: DrawDefinition = structuredClone(getDrawDefinition(drawId));
  const source = state.structures!.find((s) => s.structureName === 'Backdraw')!;
  const match = (r: number, p: number) =>
    matchUpsOf(source)!.find((m) => m.roundNumber === r && m.roundPosition === p)!;
  const convergence = match(3, 1),
    relay = match(4, 1),
    award = match(5, 1),
    final = match(6, 1);
  // Plant outstanding work on the successful draw. Remove the champion from the linked
  // destination first, then roll back just the production, leaving the other feeder's entrant.
  const destination = state
    .structures!.flatMap((s) => matchUpsOf(s) ?? [])
    .find((m) => m.matchUpId === final.winnerMatchUpId)!;
  destination.drawPositions = [];
  delete destination.winningSide;
  destination.matchUpStatus = 'TO_BE_PLAYED';
  const alreadyDue = structuredClone(state);
  delete relay.sideExitProvenance;
  delete award.sideExitProvenance;
  delete award.winningSide;
  delete award.score;
  award.matchUpStatus = 'TO_BE_PLAYED';
  expect(award.drawPositions).toHaveLength(1);
  const bye = positionAssignmentsOf(source)!.find((a) => a.bye && final.drawPositions?.includes(a.drawPosition))!;
  expect(bye).toBeDefined();
  final.drawPositions = [bye.drawPosition];
  expect(convergence.matchUpStatus).toBe(DOUBLE_WALKOVER);
  const originalLimit = SETTLE_PASS_LIMITS.linkCrossings;
  SETTLE_PASS_LIMITS.linkCrossings = 0;
  const check = () => inspectHeldPass(workingDraw(state)).error?.info;
  try {
    expect(check()).toBe('crossLinksThroughByes');
    const prior = match(1, 1);
    const oldMarks = prior.sideExitProvenance;
    prior.sideExitProvenance = {
      1: { sourceMatchUpId: convergence.matchUpId, previousMatchUpStatus: DOUBLE_WALKOVER, matchUpStatus: WALKOVER },
    };
    expect(check()).toBeUndefined();
    prior.sideExitProvenance = oldMarks;
    const changeStatus = (m: typeof award) => {
      const old = m.matchUpStatus;
      m.matchUpStatus = COMPLETED;
      expect(check()).toBeUndefined();
      m.matchUpStatus = old;
    };
    for (const gated of [relay, award, final]) changeStatus(gated);
    const [seat] = award.drawPositions!;
    const assignment = positionAssignmentsOf(source)!.find((a) => a.drawPosition === seat)!;
    const holder = assignment.participantId;
    delete assignment.participantId;
    expect(check()).toBeUndefined();
    assignment.participantId = holder;
    expect(check()).toBe('crossLinksThroughByes');
    const working = workingDraw(state);
    expect(
      heldDirectionInputs(working, before, { matchUpId: root, flags, matchUpStatus: COMPLETED, winningSide: 1 }),
    ).toEqual([]);
    expect(heldDirectionInputs(working, state, { matchUpId: root, flags, matchUpStatus: DOUBLE_WALKOVER })).toEqual([]);
    const crossing = workingDraw(alreadyDue);
    expect(inspectHeldPass(crossing).error?.info).toBe('crossLinksThroughByes');
  } finally {
    SETTLE_PASS_LIMITS.linkCrossings = originalLimit;
  }
});

it('leaves a terminal BYE production open when a terminal action would have to be simulated', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 8 }],
    nonRandom: 1,
  });
  const draw = tournamentRecord.events[0].drawDefinitions[0];
  const matches = matchUpsOf(draw.structures[0])!;
  const final = matches.find((m) => m.roundNumber === 3)!;
  const semi = matches.find((m) => m.winnerMatchUpId === final.matchUpId)!;
  const feeders = matches.filter((m) => m.winnerMatchUpId === semi.matchUpId);
  expect(feeders).toHaveLength(2);
  final.matchUpStatus = 'BYE';
  final.drawPositions = [];
  semi.matchUpStatus = DOUBLE_WALKOVER;
  semi.sideExitProvenance = Object.fromEntries(
    feeders.map((m, i) => [
      i + 1,
      { sourceMatchUpId: m.matchUpId, matchUpStatus: WALKOVER, previousMatchUpStatus: DOUBLE_WALKOVER },
    ]),
  );
  const old = SETTLE_PASS_LIMITS.strandedConvergences;
  SETTLE_PASS_LIMITS.strandedConvergences = 0;
  try {
    expect(inspectHeldPass(workingDraw(draw))).toMatchObject({ hasWork: true, terminal: true, error: undefined });
  } finally {
    SETTLE_PASS_LIMITS.strandedConvergences = old;
  }
});
