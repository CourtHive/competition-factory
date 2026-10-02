import { validateMatchUpScore, validateSetScore } from '@Validators/validateMatchUpScore';
import { checkSetIsComplete } from '@Query/matchUp/checkSetIsComplete';
import { repairScore } from '@Helpers/scoreRepair/repairScore';
import { validateScore } from '@Validators/validateScore';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { analyzeSet } from '@Query/matchUp/analyzeSet';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { INVALID_TIEBREAK_POINTS_DROPPED, TIEBREAK_POINTS_NOT_RECORDED } from '@Constants/scoreWarningConstants';
import { COMPLETED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { INVALID_SCORE } from '@Constants/errorConditionConstants';

/**
 * CA's rulings of 2026-10-02 on tiebreak records.
 *
 * V11 — *"only accept 1-0 as completed if it's in games"*: a match-tiebreak decider holding `1-0` in its
 * GAME fields and no points is a finished set (the marker); `1-0` in the tiebreak fields is points, and no
 * tiebreak to ten ends there. *"7-6 in games with no tiebreak points needs to be acceptable as it is so
 * prevalent"* — with a warning in the success payload.
 * V12 — an impossible tiebreak is refused for a live entry; *"if it's an ingestion pipeline perhaps we can
 * somehow relax and drop the invalid tiebreak points and fall back to 7-6"* — `repairScore`.
 */
const FORMAT = 'SET3-S:6/TB7-F:TB10';
const scoring = parse(FORMAT);
const first = { setNumber: 1, side1Score: 6, side2Score: 4, winningSide: 1 };
const second = { setNumber: 2, side1Score: 4, side2Score: 6, winningSide: 2 };
const marker = { setNumber: 3, side1Score: 1, side2Score: 0, winningSide: 1 };
const pointsOneNil = { setNumber: 3, side1TiebreakScore: 1, side2TiebreakScore: 0, winningSide: 1 };

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
  const { matchUpId } = matchUps.find((m: any) => m.roundNumber === 1 && m.sides?.every((s: any) => s.participant));
  return { drawId, matchUpId };
}

describe('V11: the 1-0 marker in the GAME fields is a finished match tiebreak', () => {
  it('every answerer accepts it, and the engine records it and keeps it as the marker', () => {
    expect(analyzeSet({ setObject: marker, matchUpScoringFormat: scoring }).isValidSetOutcome).toBe(true);
    expect(checkSetIsComplete({ set: marker, matchUpScoringFormat: scoring, isDecidingSet: true })).toBe(true);
    expect(validateSetScore(marker, FORMAT, true, false).isValid).toBe(true);
    expect(validateMatchUpScore([first, second, marker], FORMAT, COMPLETED).isValid).toBe(true);

    const { drawId, matchUpId } = setUp();
    const result: any = tournamentEngine.setMatchUpStatus({
      drawId,
      matchUpId,
      outcome: { score: { sets: [first, second, marker] }, winningSide: 1, matchUpStatus: COMPLETED },
    });
    expect(result.success).toBe(true);
    const stored = tournamentEngine.findMatchUp({ drawId, matchUpId }).matchUp.score.sets[2];
    expect([stored.side1Score, stored.side2Score]).toEqual([1, 0]);
    expect(stored.side1TiebreakScore).toBeUndefined();
    expect(tournamentEngine.findMatchUp({ drawId, matchUpId }).matchUp.score.scoreStringSide1).toBe('6-4 4-6 [1-0]');
  });

  it('1-0 in the tiebreak FIELDS is points, and no tiebreak to ten ends there — refused everywhere', () => {
    expect(analyzeSet({ setObject: pointsOneNil, matchUpScoringFormat: scoring }).isValidSetOutcome).toBe(false);
    expect(checkSetIsComplete({ set: pointsOneNil, matchUpScoringFormat: scoring, isDecidingSet: true })).toBe(false);
    expect(validateSetScore(pointsOneNil, FORMAT, true, false).isValid).toBe(false);

    const { drawId, matchUpId } = setUp();
    const result: any = tournamentEngine.setMatchUpStatus({
      drawId,
      matchUpId,
      outcome: { score: { sets: [first, second, pointsOneNil] }, winningSide: 1, matchUpStatus: COMPLETED },
    });
    expect(result.error).toEqual(INVALID_SCORE);
    expect(tournamentEngine.findMatchUp({ drawId, matchUpId }).matchUp.matchUpStatus).toEqual(TO_BE_PLAYED);
  });

  it('a marker that names the other side than the set does is refused', () => {
    expect(validateSetScore({ ...marker, winningSide: 2 }, FORMAT, true, false).isValid).toBe(false);
    expect(
      analyzeSet({ setObject: { ...marker, winningSide: 2 }, matchUpScoringFormat: scoring }).isValidSetOutcome,
    ).toBe(false);
  });

  it('under TB1 the target is one, so 1-0 in the game fields is still the point, not a marker', () => {
    const tb1 = 'SET3XA-S:T10-F:TB1';
    const decider = { setNumber: 3, side1Score: 1, side2Score: 0, winningSide: 1 };
    expect(analyzeSet({ setObject: decider, matchUpScoringFormat: parse(tb1) }).sideTiebreakScores).toEqual([1, 0]);
  });
});

describe('V11: a 7-6 with no tiebreak points is a finished set, accepted with a warning', () => {
  const bare = (setNumber: number) => ({ setNumber, side1Score: 7, side2Score: 6, winningSide: 1 });

  it('the analysis and the validators accept it; the write succeeds and says which sets lack points', () => {
    expect(analyzeSet({ setObject: bare(1), matchUpScoringFormat: scoring }).isValidSetOutcome).toBe(true);
    expect(validateSetScore(bare(1), FORMAT, false, false).isValid).toBe(true);

    const { drawId, matchUpId } = setUp();
    const result: any = tournamentEngine.setMatchUpStatus({
      drawId,
      matchUpId,
      outcome: { score: { sets: [bare(1), bare(2)] }, winningSide: 1, matchUpStatus: COMPLETED },
    });
    expect(result.success).toBe(true);
    expect(tournamentEngine.findMatchUp({ drawId, matchUpId }).matchUp.matchUpStatus).toEqual(COMPLETED);
  });

  it('validateScore accepts it and warns, naming each set that lacks points; a set with points is not named', () => {
    const withPoints = {
      setNumber: 2,
      side1Score: 7,
      side2Score: 6,
      side1TiebreakScore: 7,
      side2TiebreakScore: 4,
      winningSide: 1,
    };
    const result: any = validateScore({
      score: { sets: [bare(1), withPoints] },
      matchUpStatus: COMPLETED,
      matchUpFormat: FORMAT,
      winningSide: 1,
    });
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([{ code: TIEBREAK_POINTS_NOT_RECORDED, setNumbers: [1] }]);
  });

  it('live entry is still asked for the points: the completeness check does not call a bare 7-6 finished', () => {
    // key-value entry and the score card ask this as the operator types — a 7-6 there means "now the tiebreak"
    expect(checkSetIsComplete({ set: bare(1), matchUpScoringFormat: scoring })).toBe(false);
  });

  it("one side's points without the other's is still refused", () => {
    expect(
      analyzeSet({ setObject: { ...bare(1), side1TiebreakScore: 7 }, matchUpScoringFormat: scoring }).isValidSetOutcome,
    ).toBe(false);
  });
});

describe('V12: an impossible tiebreak is refused, and repairScore is the ingestion fallback', () => {
  const overshot = {
    setNumber: 1,
    side1Score: 7,
    side2Score: 6,
    side1TiebreakScore: 10,
    side2TiebreakScore: 7,
    winningSide: 1,
  };
  const second76 = { setNumber: 2, side1Score: 6, side2Score: 3, winningSide: 1 };

  it('a live write of 7-6(10-7) is refused', () => {
    const { drawId, matchUpId } = setUp();
    const result: any = tournamentEngine.setMatchUpStatus({
      drawId,
      matchUpId,
      outcome: { score: { sets: [overshot, second76] }, winningSide: 1, matchUpStatus: COMPLETED },
    });
    expect(result.error).toEqual(INVALID_SCORE);
  });

  it('repairScore drops the impossible points, keeps 7-6, names the set, and the repaired score is recorded', () => {
    const { score, warnings } = repairScore({ score: { sets: [overshot, second76] }, matchUpFormat: FORMAT });
    expect(warnings).toEqual([{ code: INVALID_TIEBREAK_POINTS_DROPPED, setNumbers: [1] }]);
    expect(score.sets?.[0]).toEqual({ setNumber: 1, side1Score: 7, side2Score: 6, winningSide: 1 });

    const { drawId, matchUpId } = setUp();
    const result: any = tournamentEngine.setMatchUpStatus({
      drawId,
      matchUpId,
      outcome: { score, winningSide: 1, matchUpStatus: COMPLETED },
    });
    expect(result.success).toBe(true);
  });

  it('repairScore leaves a legal score, and a score it cannot repair, untouched', () => {
    const legal = { sets: [{ ...overshot, side2TiebreakScore: 8 }, second76] };
    expect(repairScore({ score: legal, matchUpFormat: FORMAT })).toEqual({ score: legal });
    const notATiebreak = { sets: [{ setNumber: 1, side1Score: 7, side2Score: 3, winningSide: 1 }, second76] };
    expect(repairScore({ score: notATiebreak, matchUpFormat: FORMAT })).toEqual({ score: notATiebreak });
  });

  it('the warning code for a points-less 7-6 is exported for callers to match on', () => {
    expect(TIEBREAK_POINTS_NOT_RECORDED).toEqual('TIEBREAK_POINTS_NOT_RECORDED');
  });
});
