import { checkSetIsComplete } from '@Query/matchUp/checkSetIsComplete';
import { analyzeMatchUp } from '@Query/matchUp/analyzeMatchUp';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { analyzeSet } from '@Query/matchUp/analyzeSet';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

import { COMPLETED, IN_PROGRESS } from '@Constants/matchUpStatusConstants';

/**
 * One shape for a tiebreak-only set.
 *
 * A `[10-8]` match tiebreak reached the engine in three shapes — points in the tiebreak fields (mocks, a
 * format-less parse), points in the GAME fields with a `tiebreakSet` marker (a parse with the format), and
 * the 1-0 marker beside the points (the point engine, every hydrated read). `analyzeSet` accepted only the
 * first, so `setMatchUpState`'s revert guard failed open on the other two, and hydration rewrote the second
 * to 1-0 without moving the points (validator debate G3, 2026-10-02). See `tiebreakSetShape`.
 */
const FORMAT = 'SET3-S:6/TB7-F:TB10';
const matchUpScoringFormat = parse(FORMAT);

// the three shapes of one decider, winner first
const inTiebreakFields = (w: number, l: number, winningSide = 1) => ({
  setNumber: 3,
  side1TiebreakScore: winningSide === 1 ? w : l,
  side2TiebreakScore: winningSide === 1 ? l : w,
  winningSide,
});
const inGameFields = (w: number, l: number, winningSide = 1) => ({
  setNumber: 3,
  side1Score: winningSide === 1 ? w : l,
  side2Score: winningSide === 1 ? l : w,
  tiebreakSet: true,
  winningSide,
});
const withMarker = (w: number, l: number, winningSide = 1) => ({
  ...inTiebreakFields(w, l, winningSide),
  side1Score: winningSide === 1 ? 1 : 0,
  side2Score: winningSide === 1 ? 0 : 1,
  tiebreakSet: true,
});
const SHAPES = [
  ['points in the tiebreak fields', inTiebreakFields],
  ['points in the game fields with the marker', inGameFields],
  ['the 1-0 marker beside the points', withMarker],
] as const;

const played = (decider: any) => [
  { setNumber: 1, side1Score: 6, side2Score: 4, winningSide: 1 },
  { setNumber: 2, side1Score: 4, side2Score: 6, winningSide: 2 },
  decider,
];

describe('analyzeSet reads a tiebreak-only set in every shape it arrives in', () => {
  it.each(SHAPES)('%s: a [10-8] is a valid, complete tiebreak set won by side 1', (_, shape) => {
    const analysis = analyzeSet({ setObject: shape(10, 8), matchUpScoringFormat });
    expect(analysis.isTiebreakSet).toBe(true);
    expect(analysis.isValidSetOutcome).toBe(true);
    expect(analysis.isValidSet).toBe(true);
    expect(analysis.winningSide).toBe(1);
    expect(analysis.sideTiebreakScores).toEqual([10, 8]);
  });

  it.each(SHAPES)('%s: a [10-9] is not won, and a winner who LOST the points is refused', (_, shape) => {
    expect(analyzeSet({ setObject: shape(10, 9), matchUpScoringFormat }).isValidSetOutcome).toBe(false);
    const wrongWay = { ...shape(10, 8), winningSide: 2 };
    expect(analyzeSet({ setObject: wrongWay, matchUpScoringFormat }).isValidSetOutcome).toBe(false);
  });

  it.each(SHAPES)('%s: checkSetIsComplete agrees', (_, shape) => {
    expect(checkSetIsComplete({ set: shape(10, 8), matchUpScoringFormat, isDecidingSet: true })).toBe(true);
    expect(checkSetIsComplete({ set: shape(9, 7), matchUpScoringFormat, isDecidingSet: true })).toBe(false);
  });

  it.each(SHAPES)('%s: the completed matchUp has a valid outcome', (_, shape) => {
    const matchUp = { matchUpFormat: FORMAT, winningSide: 1, score: { sets: played(shape(10, 8)) } };
    expect(analyzeMatchUp({ matchUp }).validMatchUpOutcome).toBe(true);
  });
});

function setUp() {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, matchUpFormat: FORMAT }],
    completeAllMatchUps: false,
    nonRandom: 1,
  });
  tournamentEngine.setState(tournamentRecord);
  const { matchUps } = tournamentEngine.allTournamentMatchUps({ inContext: true });
  const first = matchUps.find((m: any) => m.roundNumber === 1 && m.sides?.every((s: any) => s.participant));
  return { drawId, matchUpId: first.matchUpId };
}

const rawSet3 = (drawId: string, matchUpId: string) =>
  tournamentEngine
    .getTournament()
    .tournamentRecord.events[0].drawDefinitions.find((d: any) => d.drawId === drawId)
    .structures[0].matchUps.find((m: any) => m.matchUpId === matchUpId).score.sets[2];

describe('the revert guard no longer fails open on a hydrated or format-parsed decider', () => {
  it.each(SHAPES)('%s: a COMPLETED 6-4 4-6 [10-8] cannot be reverted to IN_PROGRESS', (_, shape) => {
    const { drawId, matchUpId } = setUp();
    let result: any = tournamentEngine.setMatchUpStatus({
      drawId,
      matchUpId,
      outcome: { score: { sets: played(shape(10, 8)) }, winningSide: 1, matchUpStatus: COMPLETED },
    });
    expect(result.success).toBe(true);

    result = tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome: { matchUpStatus: IN_PROGRESS } });
    expect(result.error, 'refused').toBeDefined();
    expect(tournamentEngine.findMatchUp({ drawId, matchUpId }).matchUp.matchUpStatus).toBe(COMPLETED);
  });
});

describe('the points survive the store and every read', () => {
  it('a decider sent with its points in the game fields is stored and read back as tiebreak points', () => {
    const { drawId, matchUpId } = setUp();
    const result: any = tournamentEngine.setMatchUpStatus({
      drawId,
      matchUpId,
      outcome: { score: { sets: played(inGameFields(10, 8)) }, winningSide: 1, matchUpStatus: COMPLETED },
    });
    expect(result.success).toBe(true);

    // the raw record: canonical on write, the game fields gone
    const raw = rawSet3(drawId, matchUpId);
    expect([raw.side1TiebreakScore, raw.side2TiebreakScore]).toEqual([10, 8]);
    expect(raw.side1Score).toBeUndefined();
    expect(raw.side2Score).toBeUndefined();

    // the hydrated read: the marker beside the points — this came back `1-0` with no points anywhere
    const hydrated = tournamentEngine.findMatchUp({ drawId, matchUpId, inContext: true }).matchUp.score.sets[2];
    expect([hydrated.side1TiebreakScore, hydrated.side2TiebreakScore]).toEqual([10, 8]);
    expect([hydrated.side1Score, hydrated.side2Score]).toEqual([1, 0]);
    expect(hydrated.tiebreakSet).toBe(true);
    expect(tournamentEngine.findMatchUp({ drawId, matchUpId }).matchUp.score.scoreStringSide1).toBe('6-4 4-6 [10-8]');
  });

  it('a record that ALREADY holds the game-field shape keeps its points on the hydrated read', () => {
    // nothing writes this shape any more, so it is planted in the stored record the way a record written
    // before 2026-10-02 holds it — hydration alone must not lose the points
    const { drawId, matchUpId } = setUp();
    tournamentEngine.setMatchUpStatus({
      drawId,
      matchUpId,
      outcome: { score: { sets: played(inTiebreakFields(10, 8)) }, winningSide: 1, matchUpStatus: COMPLETED },
    });
    const { tournamentRecord } = tournamentEngine.getTournament();
    const stored = tournamentRecord.events[0].drawDefinitions
      .find((d: any) => d.drawId === drawId)
      .structures[0].matchUps.find((m: any) => m.matchUpId === matchUpId);
    stored.score.sets[2] = inGameFields(10, 8);
    tournamentEngine.setState(tournamentRecord);
    expect(rawSet3(drawId, matchUpId)).toEqual(inGameFields(10, 8));

    const hydrated = tournamentEngine.findMatchUp({ drawId, matchUpId, inContext: true }).matchUp.score.sets[2];
    expect([hydrated.side1TiebreakScore, hydrated.side2TiebreakScore]).toEqual([10, 8]);
    expect([hydrated.side1Score, hydrated.side2Score]).toEqual([1, 0]);
  });

  it('a decider sent in either canonical shape is stored exactly as sent', () => {
    for (const shape of [inTiebreakFields, withMarker]) {
      const { drawId, matchUpId } = setUp();
      const decider = shape(10, 8);
      tournamentEngine.setMatchUpStatus({
        drawId,
        matchUpId,
        outcome: { score: { sets: played(decider) }, winningSide: 1, matchUpStatus: COMPLETED },
      });
      expect(rawSet3(drawId, matchUpId)).toEqual(decider);
    }
  });
});
