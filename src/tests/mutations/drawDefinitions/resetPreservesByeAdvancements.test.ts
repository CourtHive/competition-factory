import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { FEED_IN_CHAMPIONSHIP, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * `resetDrawDefinition` used to strand every BYE advancement in the draw.
 *
 * CA hit it in TMX on 2026-09-21: a 16 draw whose round-1 BYEs survived a reset while the players
 * those BYEs had advanced vanished from round 2, leaving the two halves of the draw disagreeing —
 * `positionAssignments` saying three players had byes, the matchUps saying nobody advanced.
 *
 * **A BYE advancement is not a result.** Reset undoes results; a BYE advancement is a consequence
 * of the POSITIONING, which reset deliberately keeps. So it must survive.
 *
 * Asserted by COORDINATES, never by counting: `drawPositions` is positional, and a count cannot
 * tell `[1, <hole>]` from `[<hole>, 1]` — which are different sides. Holes are read with
 * `toBeUndefined()` rather than deep-equalled against an array literal, because a hole is
 * `undefined` and only LOOKS like `null` through `JSON.stringify`. See
 * `documentation/docs/concepts/draw-positions.md`.
 */

const DRAW_ID = 'byeAdvancementDraw';

function getStructureMatchUps(drawId: string, stage?: string) {
  const { drawDefinition }: any = tournamentEngine.getEvent({ drawId });
  const structure = stage
    ? drawDefinition.structures.find((s: any) => s.stage === stage)
    : drawDefinition.structures[0];
  return { structure, matchUps: structure.matchUps };
}

it('preserves the drawPositions a BYE advanced when a draw is reset', () => {
  // 13 of 16 entered, so three byes — CA's reproduction shape
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 16, participantsCount: 13, drawId: DRAW_ID }],
  });
  tournamentEngine.setState(tournamentRecord);

  const { structure } = getStructureMatchUps(DRAW_ID);
  const byePositions = structure.positionAssignments
    .filter((assignment: any) => assignment.bye)
    .map((assignment: any) => assignment.drawPosition);
  expect(byePositions.length).toBe(3);

  // capture the pre-reset round-2 state by coordinate, so the assertion after the reset is about
  // these exact slots rather than about how many positions happen to survive
  const before = getStructureMatchUps(DRAW_ID)
    .matchUps.filter((m: any) => m.roundNumber === 2)
    .map((m: any) => ({ roundPosition: m.roundPosition, drawPositions: [...(m.drawPositions ?? [])] }));

  // a BYE advances somebody, so at least one round-2 slot is occupied before anything is played
  const occupiedBefore = before.filter((m) => (m.drawPositions ?? []).some((p) => typeof p === 'number'));
  expect(occupiedBefore.length).toBe(3);

  const result: any = tournamentEngine.resetDrawDefinition({ drawId: DRAW_ID });
  expect(result.success).toBe(true);

  const after = getStructureMatchUps(DRAW_ID)
    .matchUps.filter((m: any) => m.roundNumber === 2)
    .map((m: any) => ({ roundPosition: m.roundPosition, drawPositions: [...(m.drawPositions ?? [])] }));

  // every round-2 slot is unchanged — position AND index, so a position cannot have changed sides
  for (const expected of before) {
    const actual = after.find((m) => m.roundPosition === expected.roundPosition);
    expect(actual).toBeDefined();
    expect(actual?.drawPositions?.length).toBe(expected.drawPositions.length);
    expected.drawPositions.forEach((drawPosition, index) => {
      expect(actual?.drawPositions?.[index]).toEqual(drawPosition);
    });
  }

  // and the round-1 BYEs the advancement came from are still there
  const byeMatchUps = getStructureMatchUps(DRAW_ID).matchUps.filter(
    (m: any) => m.roundNumber === 1 && m.matchUpStatus === 'BYE',
  );
  expect(byeMatchUps.length).toBe(3);

  // the reset draw is internally consistent — the half that mattered to the user
  const inconsistencies: any = tournamentEngine.getDrawInconsistencies({ drawId: DRAW_ID });
  expect(inconsistencies.inconsistencies).toEqual([]);
  expect(inconsistencies.valid).toBe(true);
});

it('clears the positions a PLAYED match advanced while keeping those a BYE advanced', () => {
  // the discriminating case: after a full draw is played, a reset must undo one and not the other
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      { drawType: SINGLE_ELIMINATION, drawSize: 16, participantsCount: 13, drawId: DRAW_ID, completionGoal: 15 },
    ],
  });
  tournamentEngine.setState(tournamentRecord);

  const { structure } = getStructureMatchUps(DRAW_ID);
  const byePositions: number[] = structure.positionAssignments
    .filter((assignment: any) => assignment.bye)
    .map((assignment: any) => assignment.drawPosition);
  expect(byePositions.length).toBe(3);

  // the round-1 matchUps holding a bye, and the position each one advances
  const round1 = getStructureMatchUps(DRAW_ID).matchUps.filter((m: any) => m.roundNumber === 1);
  const byeAdvancedPositions = round1
    .filter((m: any) => (m.drawPositions ?? []).some((p: number) => byePositions.includes(p)))
    .map((m: any) => (m.drawPositions ?? []).find((p: number) => !byePositions.includes(p)))
    .filter((p: any): p is number => typeof p === 'number');
  expect(byeAdvancedPositions.length).toBe(3);

  const result: any = tournamentEngine.resetDrawDefinition({ drawId: DRAW_ID });
  expect(result.success).toBe(true);

  const round2 = getStructureMatchUps(DRAW_ID).matchUps.filter((m: any) => m.roundNumber === 2);
  const survivingPositions = round2.flatMap((m: any) =>
    (m.drawPositions ?? []).filter((p: any): p is number => typeof p === 'number'),
  );

  // exactly the bye advancements survive: nothing played is left, nothing bye-advanced is lost
  expect(survivingPositions.slice().sort((a, b) => a - b)).toEqual(byeAdvancedPositions.slice().sort((a, b) => a - b));

  // rounds 3+ are reachable only by playing, so a reset empties them entirely
  const laterRounds = getStructureMatchUps(DRAW_ID).matchUps.filter((m: any) => m.roundNumber > 2);
  for (const matchUp of laterRounds) {
    expect((matchUp.drawPositions ?? []).filter((p: any) => typeof p === 'number').length).toBe(0);
  }

  const inconsistencies: any = tournamentEngine.getDrawInconsistencies({ drawId: DRAW_ID });
  expect(inconsistencies.inconsistencies).toEqual([]);
});

it('preserves a BYE advancement that reached the slot through CONSECUTIVE bye rounds', () => {
  // 3 entries in a 16 draw: byes face byes, and a position can advance two rounds without a match.
  // A fix that only looked one round back would strand these.
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 16, participantsCount: 3, drawId: DRAW_ID }],
  });
  tournamentEngine.setState(tournamentRecord);

  const before = getStructureMatchUps(DRAW_ID).matchUps.map((m: any) => ({
    roundNumber: m.roundNumber,
    roundPosition: m.roundPosition,
    drawPositions: [...(m.drawPositions ?? [])],
  }));

  // round 3 is occupied before anything is played — purely from byes
  const round3Occupied = before.filter(
    (m) => m.roundNumber === 3 && m.drawPositions.some((p) => typeof p === 'number'),
  );
  expect(round3Occupied.length).toBeGreaterThan(0);

  const result: any = tournamentEngine.resetDrawDefinition({ drawId: DRAW_ID });
  expect(result.success).toBe(true);

  const after = getStructureMatchUps(DRAW_ID).matchUps.map((m: any) => ({
    roundNumber: m.roundNumber,
    roundPosition: m.roundPosition,
    drawPositions: [...(m.drawPositions ?? [])],
  }));

  // an unplayed draw is unchanged by a reset, in every round, at every index
  expect(after).toEqual(before);
});

it('preserves the reserved FED slot as well as the BYE advancement beside it', () => {
  // a fed structure carries both kinds of position in one matchUp: one reserved by a LOSER link,
  // one advanced by a BYE. Neither is a result and both must survive.
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: FEED_IN_CHAMPIONSHIP, drawSize: 16, participantsCount: 13, drawId: DRAW_ID }],
  });
  tournamentEngine.setState(tournamentRecord);

  const before = getStructureMatchUps(DRAW_ID, 'CONSOLATION').matchUps.map((m: any) => ({
    roundNumber: m.roundNumber,
    roundPosition: m.roundPosition,
    drawPositions: [...(m.drawPositions ?? [])],
  }));

  // the consolation holds occupied slots before any match is played
  expect(before.filter((m) => m.drawPositions.some((p) => typeof p === 'number')).length).toBeGreaterThan(0);

  const result: any = tournamentEngine.resetDrawDefinition({ drawId: DRAW_ID });
  expect(result.success).toBe(true);

  const after = getStructureMatchUps(DRAW_ID, 'CONSOLATION').matchUps.map((m: any) => ({
    roundNumber: m.roundNumber,
    roundPosition: m.roundPosition,
    drawPositions: [...(m.drawPositions ?? [])],
  }));

  expect(after).toEqual(before);
});

it('leaves a hole undefined rather than compacting the survivor onto the wrong side', () => {
  // the trap this area has sprung before: a hole is `undefined`, and only RENDERS as `null` through
  // JSON.stringify. Compacting `[<hole>, 16]` to `[16]` would move 16 from side 2 to side 1.
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      { drawType: SINGLE_ELIMINATION, drawSize: 16, participantsCount: 13, drawId: DRAW_ID, completionGoal: 15 },
    ],
  });
  tournamentEngine.setState(tournamentRecord);
  tournamentEngine.resetDrawDefinition({ drawId: DRAW_ID });

  const round2 = getStructureMatchUps(DRAW_ID).matchUps.filter((m: any) => m.roundNumber === 2);
  const partiallyFilled = round2.filter(
    (m: any) =>
      (m.drawPositions ?? []).length === 2 &&
      (m.drawPositions ?? []).filter((p: any) => typeof p === 'number').length === 1,
  );
  expect(partiallyFilled.length).toBeGreaterThan(0);

  for (const matchUp of partiallyFilled) {
    const holeIndex = matchUp.drawPositions.findIndex((p: any) => typeof p !== 'number');
    // the hole is undefined, NOT null
    expect(matchUp.drawPositions[holeIndex]).toBeUndefined();
    expect(matchUp.drawPositions[holeIndex]).not.toBeNull();
  }

  // and the surviving participant still derives the side its feeder gives it
  const { matchUps }: any = tournamentEngine.allDrawMatchUps({ drawId: DRAW_ID, inContext: true });
  for (const matchUp of partiallyFilled) {
    const inContext = matchUps.find((m: any) => m.matchUpId === matchUp.matchUpId);
    const occupied = (inContext.sides ?? []).filter((side: any) => side.participantId);
    expect(occupied.length).toBe(1);
    expect([1, 2]).toContain(occupied[0].sideNumber);
  }
});
