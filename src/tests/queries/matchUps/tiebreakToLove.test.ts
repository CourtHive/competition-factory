import { setMatchUpStatus } from '@Mutate/matchUps/matchUpStatus/setMatchUpStatus';
import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { analyzeMatchUp } from '@Query/matchUp/analyzeMatchUp';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { analyzeSet } from '@Query/matchUp/analyzeSet';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

import { COMPLETED, IN_PROGRESS } from '@Constants/matchUpStatusConstants';

/**
 * A tiebreak to love is a tiebreak.
 *
 * `analyzeSet` tested a tiebreak score with `!score`, so a 0 read as MISSING and every 7-6(0) — the
 * engine's own output when a tiebreak is swept — was an invalid set to the analysis while the validators,
 * the ScoringEngine and key-value entry all accepted it. `analyzeMatchUp` followed, and
 * `setMatchUpState`'s guard against reverting a COMPLETED matchUp to a live status asks
 * `validMatchUpOutcome`, so it failed OPEN on any 7-6(0) match (validator debate V1, 2026-10-02).
 */
const FORMAT = 'SET3-S:6/TB7';
const tb = (s1: number, s2: number, t1: number, t2: number, setNumber = 1) => ({
  setNumber,
  side1Score: s1,
  side2Score: s2,
  side1TiebreakScore: t1,
  side2TiebreakScore: t2,
  winningSide: s1 > s2 ? 1 : 2,
});

describe('a tiebreak to love is a valid set', () => {
  it('7-6(0) and 6-7(0) are valid set outcomes; a tiebreak the winner LOST is still not', () => {
    const matchUpScoringFormat = parse(FORMAT);
    expect(analyzeSet({ setObject: tb(7, 6, 7, 0), matchUpScoringFormat }).isValidSetOutcome).toBe(true);
    expect(analyzeSet({ setObject: tb(6, 7, 0, 7), matchUpScoringFormat }).isValidSetOutcome).toBe(true);
    expect(analyzeSet({ setObject: tb(7, 6, 0, 7), matchUpScoringFormat }).isValidSetOutcome).toBe(false);
    expect(analyzeSet({ setObject: tb(7, 6, 7, 5), matchUpScoringFormat }).isValidSetOutcome).toBe(true);
  });

  it('6-5(7-0) under @5 and a [10-0] decider too', () => {
    expect(
      analyzeSet({ setObject: tb(6, 5, 7, 0), matchUpScoringFormat: parse('SET3-S:6/TB7@5') }).isValidSetOutcome,
    ).toBe(true);
    const decider = { setNumber: 3, side1TiebreakScore: 10, side2TiebreakScore: 0, winningSide: 1 };
    expect(
      analyzeSet({ setObject: decider, matchUpScoringFormat: parse('SET3-S:6/TB7-F:TB10') }).isValidSetOutcome,
    ).toBe(true);
    const lost = { setNumber: 3, side1TiebreakScore: 0, side2TiebreakScore: 10, winningSide: 1 };
    expect(analyzeSet({ setObject: lost, matchUpScoringFormat: parse('SET3-S:6/TB7-F:TB10') }).isValidSetOutcome).toBe(
      false,
    );
  });

  it('a 7-6(0) 7-6(0) match is a valid outcome, and the engine produces exactly that score', () => {
    const matchUp = { matchUpFormat: FORMAT, winningSide: 1, score: { sets: [tb(7, 6, 7, 0), tb(7, 6, 7, 0, 2)] } };
    expect(analyzeMatchUp({ matchUp, matchUpFormat: FORMAT }).validMatchUpOutcome).toBe(true);

    const engine: any = new ScoringEngine({ matchUpFormat: FORMAT });
    for (let g = 0; g < 12; g += 1) for (let p = 0; p < 4; p += 1) engine.addPoint({ winner: g % 2 === 0 ? 0 : 1 });
    for (let p = 0; p < 7; p += 1) engine.addPoint({ winner: 0 });
    const set = engine.getState().score.sets[0];
    expect([set.side1TiebreakScore, set.side2TiebreakScore]).toEqual([7, 0]);
    expect(analyzeSet({ setObject: set, matchUpScoringFormat: parse(FORMAT) }).isValidSetOutcome).toBe(true);
  });
});

describe('the revert guard no longer fails open on a tiebreak to love', () => {
  it('a COMPLETED 7-6(0) 7-6(0) cannot be reverted to IN_PROGRESS without a new outcome', () => {
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
    const matchUpId = first.matchUpId;

    let result: any = tournamentEngine.setMatchUpStatus({
      drawId,
      matchUpId,
      outcome: { score: { sets: [tb(7, 6, 7, 0), tb(7, 6, 7, 0, 2)] }, winningSide: 1, matchUpStatus: COMPLETED },
    });
    expect(result.success).toBe(true);

    // The guard: a completed match with a validated winning score stays completed. It let this
    // through when the analysis called a 7-6(0) invalid, which is the whole reason the read matters.
    result = tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome: { matchUpStatus: IN_PROGRESS } });
    expect(result.error, 'refused').toBeDefined();
    expect(tournamentEngine.findMatchUp({ drawId, matchUpId }).matchUp.matchUpStatus).toBe(COMPLETED);

    // the control: the same revert on a 7-6(5) 7-6(5) was always refused
    result = tournamentEngine.setMatchUpStatus({
      drawId,
      matchUpId,
      outcome: { score: { sets: [tb(7, 6, 7, 5), tb(7, 6, 7, 5, 2)] }, winningSide: 1, matchUpStatus: COMPLETED },
    });
    expect(result.success).toBe(true);
    result = tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome: { matchUpStatus: IN_PROGRESS } });
    expect(result.error).toBeDefined();
    expect(typeof setMatchUpStatus).toBe('function');
  });
});
