import { getOrderedDrawPositions } from '@Query/matchUps/getOrderedDrawPositions';
import { buildStructuralIndex } from '@Query/matchUps/structuralIndex';
import { compareIndex } from '@Mutate/matchUps/outcome/indexOracle';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';
import { overlap } from '@Tools/arrays';

// constants
import { TEAM_EVENT } from '@Constants/eventConstants';
import { TEAM } from '@Constants/matchUpTypes';
import {
  AD_HOC,
  COMPASS,
  CURTIS_CONSOLATION,
  DOUBLE_ELIMINATION,
  FEED_IN_CHAMPIONSHIP,
  FIRST_MATCH_LOSER_CONSOLATION,
  ROUND_ROBIN,
} from '@Constants/drawDefinitionConstants';

/**
 * THE STRUCTURAL INDEX (outcome v2 executor plan § 3.1.1, CA 2026-10-24: v2 decides on stored data and a structural
 * index, never on a hydration). One entry per matchUp in the hydrated shape, carrying only what the outcome logic reads.
 *
 * Its agreement over the suite is the index oracle's (`differential`: every call's index against the view's hydration,
 * a divergence keyed `index:<field>`). This file holds the shapes that oracle could meet only by chance: byes, feeds,
 * round robin groups, a tiebreak-only format (hydration annotates its sets), ad hoc sides, a draw outcome recorded
 * before the draw has a tournament, and TEAM, which the index does not cover yet.
 */
function indexAgainstHydration(drawProfile: Record<string, unknown>, options: Record<string, unknown> = {}) {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [drawProfile], setState: true, ...options });
  const { drawDefinition, event } = tournamentEngine.getEvent({ drawId });
  const hydrated = getAllDrawMatchUps({ tournamentRecord, drawDefinition, event, inContext: true }).matchUps ?? [];
  const index = buildStructuralIndex({ tournamentRecord, drawDefinition, event });
  return { hydrated, index, tournamentRecord, drawDefinition, event };
}

describe('agrees with the hydration on every field the outcome logic reads', () => {
  const shapes: [string, Record<string, unknown>][] = [
    ['SE 32, 27 participants (byes)', { drawSize: 32, participantsCount: 27, completionGoal: 20 }],
    ['FEED_IN_CHAMPIONSHIP 32', { drawType: FEED_IN_CHAMPIONSHIP, drawSize: 32, completionGoal: 30 }],
    [
      'FMLC 16 with byes',
      { drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 16, participantsCount: 13, completionGoal: 10 },
    ],
    ['CURTIS 32', { drawType: CURTIS_CONSOLATION, drawSize: 32, completionGoal: 24 }],
    ['COMPASS 16', { drawType: COMPASS, drawSize: 16, completionGoal: 16 }],
    ['DOUBLE_ELIMINATION 16', { drawType: DOUBLE_ELIMINATION, drawSize: 16, completionGoal: 20 }],
    ['ROUND_ROBIN 16', { drawType: ROUND_ROBIN, drawSize: 16, completionGoal: 12 }],
    ['AD_HOC 8', { drawType: AD_HOC, drawSize: 8, roundsCount: 2, completeAllMatchUps: true }],
    ['SE 16, tiebreak-only sets', { drawSize: 16, matchUpFormat: 'SET1-S:TB10', completionGoal: 8 }],
  ];
  it.each(shapes)('%s', (_label, drawProfile) => {
    const { hydrated, index } = indexAgainstHydration(drawProfile);
    // CONTROL: a draw with results, so a field the index misses on a scored matchUp shows
    expect(hydrated.some((matchUp) => matchUp.winningSide)).toEqual(true);
    expect(index.unsupported).toBeUndefined();
    expect(index.matchUps.length).toEqual(hydrated.length);
    expect(compareIndex({ hydrated, index: index.matchUps })).toEqual([]);
  });
});

it('annotates a tiebreak-only set as hydration does, on its own copy of the score', () => {
  const { hydrated, index, drawDefinition } = indexAgainstHydration({
    drawSize: 8,
    matchUpFormat: 'SET1-S:TB10',
    completionGoal: 4,
  });
  const scored = index.matchUps.find((matchUp) => matchUp.score?.sets?.length) as any;
  expect(scored.score.sets[0].tiebreakSet).toEqual(true);
  expect(
    (hydrated.find((matchUp) => matchUp.matchUpId === scored.matchUpId) as any)?.score?.sets?.[0].tiebreakSet,
  ).toEqual(true);
  // the stored score is not annotated: the index never writes through to the record
  const stored = drawDefinition.structures[0].matchUps.find((matchUp) => matchUp.matchUpId === scored.matchUpId);
  expect(stored.score.sets[0].tiebreakSet).toBeUndefined();
});

it("stubs a side's participant only when the tournament holds it, as hydration carries one", () => {
  const { index, tournamentRecord, drawDefinition, event } = indexAgainstHydration({ drawSize: 8 });
  const seated = index.matchUps.flatMap((matchUp) => matchUp.sides ?? []).filter((side) => side?.participantId);
  expect(seated.length).toEqual(8);
  expect(seated.every((side) => side.participant?.participantId === side.participantId)).toEqual(true);

  // a draw outcome recorded with no tournament (mocksEngine completing a draw it is still generating) hydrates no
  // participant at all, and `isActiveDownstream` reads `side.participant`: the index answers the same
  const bare = buildStructuralIndex({ drawDefinition, event });
  const hydratedBare = getAllDrawMatchUps({ drawDefinition, event, inContext: true }).matchUps ?? [];
  expect(compareIndex({ hydrated: hydratedBare, index: bare.matchUps })).toEqual([]);
  expect(bare.matchUps.flatMap((matchUp) => matchUp.sides ?? []).some((side) => side?.participant)).toEqual(false);
  expect(tournamentRecord.participants.length).toBeGreaterThan(0);
});

it('declares TEAM unsupported, so its caller hydrates', () => {
  const { index, hydrated } = indexAgainstHydration({ drawSize: 4, eventType: TEAM_EVENT });
  expect(hydrated.some((matchUp) => matchUp.matchUpType === TEAM)).toEqual(true);
  expect(index).toEqual({ matchUps: [], unsupported: TEAM });
});

it('reads none of what it does not need: no round names, schedule detail or participant record', () => {
  const { index } = indexAgainstHydration({ drawSize: 16, completionGoal: 8 });
  const keys = new Set(index.matchUps.flatMap((matchUp) => Object.keys(matchUp)));
  for (const absent of ['roundName', 'abbreviatedRoundName', 'drawPositionsRange', 'readyToScore', 'gender'])
    expect(keys.has(absent)).toEqual(false);
  const participant = index.matchUps.flatMap((matchUp) => matchUp.sides ?? []).find((side) => side?.participant);
  expect(Object.keys(participant?.participant ?? {})).toEqual(['participantId']);
});

describe('getOrderedDrawPositions: the pair a matchUp sits in, by index', () => {
  // the scan this replaced, as the reference: the first pair holding any of the matchUp's positions
  const reference = (pairs: (number | undefined)[][], positions: number[]) =>
    pairs.find((pair) => overlap(pair ?? [], positions)) ?? [undefined, undefined];

  it('answers what the scan answered, for every matchUp of every shape, holes and repeats included', () => {
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 32;
    let checked = 0;
    for (let trial = 0; trial < 400; trial++) {
      // pairs as round profiles build them: ascending pairs, holes where a position is unknown, a repeat at times
      const pairs = Array.from({ length: 1 + Math.floor(random() / 4) }, () => [
        random() < 4 ? undefined : Math.ceil(random()),
        random() < 4 ? undefined : Math.ceil(random()),
      ]);
      const roundProfile = { 2: { pairedDrawPositions: pairs } } as any;
      const positions = [Math.ceil(random()), Math.ceil(random())].filter(
        (position, i, all) => all.indexOf(position) === i,
      );
      const { displayOrder } = getOrderedDrawPositions({ drawPositions: positions, roundProfile, roundNumber: 2 });
      expect(displayOrder).toEqual(reference(pairs, positions));
      checked += 1;
    }
    expect(checked).toEqual(400);
  });

  it('keeps the FIRST pair when a position appears in two', () => {
    const pairs = [
      [3, 4],
      [1, 2],
      [2, 5],
    ];
    const roundProfile = { 2: { pairedDrawPositions: pairs } } as any;
    expect(getOrderedDrawPositions({ drawPositions: [2, 5], roundProfile, roundNumber: 2 }).displayOrder).toBe(
      pairs[1],
    );
    expect(getOrderedDrawPositions({ drawPositions: [5, 9], roundProfile, roundNumber: 2 }).displayOrder).toBe(
      pairs[2],
    );
  });
});
