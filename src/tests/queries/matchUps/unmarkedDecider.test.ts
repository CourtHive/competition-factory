import { analyzeMatchUp } from '@Query/matchUp/analyzeMatchUp';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { analyzeSet } from '@Query/matchUp/analyzeSet';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

import { COMPLETED, IN_PROGRESS } from '@Constants/matchUpStatusConstants';

/**
 * A decider whose points sit in the GAME fields with no `tiebreakSet` marker — the shape the slam
 * adapter and the US Open capture store a match tiebreak in — is still tiebreak points wherever the
 * format says the set is a tiebreak.
 *
 * `readTiebreakSet` asked the format only when the set already carried tiebreak scores, so this shape
 * was a regular set to the analysis (the COMPLETED-revert guard failed open on it) and hydration wrote
 * the 1-0 marker over its points: a `[10-8]` decider read back as `1-0` (residual (b), 2026-10-02).
 */
const FORMAT = 'SET3-S:6/TB7-F:TB10';
const unmarked = { setNumber: 3, side1Score: 10, side2Score: 8, winningSide: 1 };
const played = (decider: any) => [
  { setNumber: 1, side1Score: 6, side2Score: 4, winningSide: 1 },
  { setNumber: 2, side1Score: 4, side2Score: 6, winningSide: 2 },
  decider,
];

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

const storedMatchUp = (drawId: string, matchUpId: string, record = tournamentEngine.getTournament().tournamentRecord) =>
  record.events[0].drawDefinitions
    .find((d: any) => d.drawId === drawId)
    .structures[0].matchUps.find((m: any) => m.matchUpId === matchUpId);

describe('an unmarked game-field decider is a tiebreak set', () => {
  it('the analysis reads it as a valid tiebreak set won 10-8, and the match as validly won', () => {
    const analysis = analyzeSet({ setObject: unmarked, matchUpScoringFormat: parse(FORMAT) });
    expect(analysis.isTiebreakSet).toBe(true);
    expect(analysis.sideTiebreakScores).toEqual([10, 8]);
    expect(analysis.isValidSetOutcome).toBe(true);
    const matchUp = { matchUpFormat: FORMAT, winningSide: 1, score: { sets: played(unmarked) } };
    expect(analyzeMatchUp({ matchUp }).validMatchUpOutcome).toBe(true);
  });

  it('sent that way, it is stored with its points in the tiebreak fields, and the revert guard holds', () => {
    const { drawId, matchUpId } = setUp();
    let result: any = tournamentEngine.setMatchUpStatus({
      drawId,
      matchUpId,
      outcome: { score: { sets: played(unmarked) }, winningSide: 1, matchUpStatus: COMPLETED },
    });
    expect(result.success).toBe(true);
    const raw = storedMatchUp(drawId, matchUpId).score.sets[2];
    expect([raw.side1TiebreakScore, raw.side2TiebreakScore]).toEqual([10, 8]);
    expect(raw.side1Score).toBeUndefined();

    result = tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome: { matchUpStatus: IN_PROGRESS } });
    expect(result.error, 'a completed match is not reverted').toBeDefined();
  });

  it('a record that ALREADY holds the shape keeps its points on the hydrated read', () => {
    const { drawId, matchUpId } = setUp();
    tournamentEngine.setMatchUpStatus({
      drawId,
      matchUpId,
      outcome: {
        score: { sets: played({ setNumber: 3, side1TiebreakScore: 10, side2TiebreakScore: 8, winningSide: 1 }) },
        winningSide: 1,
        matchUpStatus: COMPLETED,
      },
    });
    const { tournamentRecord } = tournamentEngine.getTournament();
    storedMatchUp(drawId, matchUpId, tournamentRecord).score.sets[2] = { ...unmarked };
    tournamentEngine.setState(tournamentRecord);

    const hydrated = tournamentEngine.findMatchUp({ drawId, matchUpId, inContext: true }).matchUp.score.sets[2];
    expect([hydrated.side1TiebreakScore, hydrated.side2TiebreakScore]).toEqual([10, 8]);
    expect([hydrated.side1Score, hydrated.side2Score]).toEqual([1, 0]);
  });
});
