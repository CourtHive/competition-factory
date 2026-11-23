import { deciderReservations, planDecider, planDeciderReservations } from '@Mutate/matchUps/outcome/settlement/decider';
import { createWorkingView } from '@Mutate/matchUps/outcome/overlay';
import { getDrawDefinition } from '@Tests/testHarness/exitPropagation/transitions';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { matchUpsOf, positionAssignmentsOf } from '@Helpers/drawTopology/structureMembers';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { getDeciderFinals } from '@Query/drawDefinition/deciderStructures';
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { setOutcomePipeline } from '@Global/state/globalState';
import type { DrawDefinition, MatchUpStatusUnion } from '@Types/tournamentTypes';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

const drawId = 'settlement-decider';

function read(drawDefinition: DrawDefinition) {
  const matchUpsMap = getMatchUpsMap({ drawDefinition });
  const inContextDrawMatchUps = getAllDrawMatchUps({ drawDefinition, matchUpsMap, inContext: true }).matchUps ?? [];
  return createWorkingView({ drawDefinition, matchUpsMap, inContextDrawMatchUps, clockFree: true });
}
function prepare() {
  setOutcomePipeline('v1');
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawType: DOUBLE_ELIMINATION, drawSize: 8, participantsCount: 4 }],
    nonRandom: 9301605,
    setState: true,
  });
  const find = (name: string, round: number, position: number) =>
    tournamentEngine
      .allDrawMatchUps({ drawId, inContext: true })
      .matchUps.find((m) => m.structureName === name && m.roundNumber === round && m.roundPosition === position)!;
  const play = (
    name: string,
    round: number,
    position: number,
    outcome: { winningSide?: 1 | 2; matchUpStatus?: MatchUpStatusUnion },
  ) => {
    const matchUpId = find(name, round, position).matchUpId;
    expect(tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome, propagateExitStatus: true }).success).toBe(
      true,
    );
    return matchUpId;
  };
  play('Main', 2, 1, { winningSide: 1 });
  play('Main', 2, 2, { winningSide: 2 });
  play('Backdraw', 3, 1, { matchUpStatus: DOUBLE_DEFAULT });
  const root = play('Main', 3, 1, { winningSide: 1, matchUpStatus: WALKOVER });
  return {
    before: structuredClone(getDrawDefinition(drawId)) as DrawDefinition,
    root,
    play,
    final: find('Main', 4, 1).matchUpId,
    donor: find('Backdraw', 4, 1).matchUpId,
    decider: find('Decider', 1, 1).matchUpId,
  };
}

function stored(draw: DrawDefinition, id: string) {
  return draw.structures!.flatMap((s) => matchUpsOf(s) ?? []).find((m) => m.matchUpId === id)!;
}

it('identifies the upstream typed installer and its vacant reserved slot before a legal third-match correction', () => {
  const { before, root, play, donor, final, decider } = prepare();
  const original = structuredClone(before);
  const grants = deciderReservations(before);
  expect(grants).toHaveLength(1);
  const grant = grants[0];
  expect(grant).toMatchObject({ producerId: donor, status: DOUBLE_WALKOVER, finalId: final, receiverId: decider });
  const seat = (draw: DrawDefinition) =>
    positionAssignmentsOf(draw.structures!.find((s) => s.structureId === grant.structureId))?.find(
      (s) => s.drawPosition === grant.drawPosition,
    );
  expect(seat(before)).toMatchObject({ bye: true, byeFromPropagation: true });
  expect(seat(before)?.participantId).toBeUndefined();
  // Change only the upstream result in the cursor. No post-state is supplied to the predictor.
  const cursor = structuredClone(before);
  stored(cursor, donor).matchUpStatus = DEFAULTED;
  const working = read(cursor);
  const planned = planDeciderReservations({ before, working, matchUpId: root });
  expect(planned.ops).toEqual([
    { op: 'withdrawBye', structureId: grant.structureId, drawPosition: grant.drawPosition },
  ]);
  expect(seat(working.drawDefinition)?.byeFromPropagation).toBe(true);
  expect(before).toStrictEqual(original);
  play('Main', 3, 1, { winningSide: 2 });
  const actual = getDrawDefinition(drawId);
  expect(stored(actual, donor).matchUpStatus).toBe(DEFAULTED);
  expect(seat(actual)?.byeFromPropagation).toBeUndefined();
});

it('holds the reservation if only the final changes, but withdraws the old typed grant on a double-to-double replacement', () => {
  const { before, root, final, donor } = prepare();
  const cursor = structuredClone(before);
  delete stored(cursor, final).sideExitProvenance;
  expect(planDeciderReservations({ before, working: read(cursor), matchUpId: root }).ops).toEqual([]);
  stored(cursor, donor).matchUpStatus = DOUBLE_DEFAULT;
  expect(planDeciderReservations({ before, working: read(cursor), matchUpId: donor }).ops).toMatchObject([
    { op: 'withdrawBye' },
  ]);
});

it('requires the marked vacant assignment, matching producer and both unconditional feeds', () => {
  const { before, final } = prepare();
  const [grant] = deciderReservations(before);
  expect(grant).toBeDefined();
  for (const change of ['structural-bye', 'foreign-donor', 'conditional-edge', 'occupied', 'one-feed']) {
    const copy = structuredClone(before);
    const seat = positionAssignmentsOf(copy.structures!.find((s) => s.structureId === grant.structureId))!.find(
      (s) => s.drawPosition === grant.drawPosition,
    )!;
    const feed = copy.links!.find((l) => l.target.structureId === grant.structureId)!;
    if (change === 'structural-bye') delete seat.byeFromPropagation;
    if (change === 'occupied') seat.participantId = 'other';
    if (change === 'foreign-donor') {
      const mark = Object.values(stored(copy, final).sideExitProvenance!).find(
        (x) => x.sourceMatchUpId === grant.producerId,
      )!;
      mark.sourceMatchUpId = 'other';
    }
    if (change === 'conditional-edge') Object.assign(feed, { linkCondition: 'FIRST_MATCHUP' });
    if (change === 'one-feed') copy.links = copy.links!.filter((l) => l !== feed);
    expect(deciderReservations(copy), change).toEqual([]);
  }
});

it('distinguishes an externally moved Decider from play on the Decider itself', () => {
  const { before, root, decider } = prepare();
  const cursor = structuredClone(before);
  expect(getDeciderFinals(before).size).toBe(1);
  stored(cursor, decider).matchUpStatus = TO_BE_PLAYED;
  const working = read(cursor);
  expect(planDecider({ before, working, matchUpId: decider })).toEqual({ ops: [], reasons: [] });
  const work = planDecider({ before, working, matchUpId: root });
  expect(work.ops).toMatchObject([{ op: 'setMatchUpResult', matchUpId: decider, matchUpStatus: 'DEAD_RUBBER' }]);
});

it('predicts the actual winning participant and identifies a required quiet deletion in the other plain seat', () => {
  const { before, root, final, decider } = prepare();
  const [grant] = deciderReservations(before);
  const cursor = structuredClone(before);
  const seats = [...positionAssignmentsOf(cursor.structures!.find((s) => s.structureId === grant.structureId))!].sort(
    (a, b) => a.drawPosition - b.drawPosition,
  );
  for (const seat of seats) {
    delete seat.bye;
    delete seat.byeFromPropagation;
    seat.participantId = 'displaced-' + seat.drawPosition;
  }
  const working = read(cursor);
  const feeder = working.inContextDrawMatchUps.find((m) => m.matchUpId === final)!;
  const winner = feeder.sides?.find((s) => s.sideNumber === feeder.winningSide)?.participantId;
  expect(winner).toBeTruthy();
  const input = structuredClone(working.drawDefinition);
  const prediction = planDecider({ before, working, matchUpId: root });
  expect(prediction.ops).toContainEqual({
    op: 'relabelPosition',
    structureId: grant.structureId,
    drawPosition: seats[0].drawPosition,
    participantId: winner,
  });
  expect(prediction.ops).toContainEqual({
    op: 'relabelPosition',
    structureId: grant.structureId,
    drawPosition: seats[1].drawPosition,
    participantId: undefined,
  });
  expect(planDecider({ before, working, matchUpId: decider }).ops).toEqual([]);
  expect(working.drawDefinition).toStrictEqual(input);
  const seedsBefore = working.drawDefinition.structures!.find(
    (s) => s.structureId === grant.structureId,
  )?.seedAssignments;
  expect(working.apply(prediction.ops)).toEqual({});
  const changed = working.drawDefinition.structures!.find((s) => s.structureId === grant.structureId)!;
  const freed = positionAssignmentsOf(changed)!.find((s) => s.drawPosition === seats[1].drawPosition)!;
  expect(Object.hasOwn(freed, 'participantId')).toBe(false);
  expect(changed.seedAssignments).toStrictEqual(seedsBefore);
  expect(
    positionAssignmentsOf(cursor.structures!.find((s) => s.structureId === grant.structureId))!.every((s) =>
      s.participantId?.startsWith('displaced-'),
    ),
  ).toBe(true);
});
