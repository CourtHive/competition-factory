import { getOutcomePipeline, setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { getDrawDefinition, getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { SETTLE_PASS_LIMITS } from '@Mutate/matchUps/matchUpStatus/settleBounds';
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
