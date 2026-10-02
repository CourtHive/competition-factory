import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { INVALID_SCORE, MISSING_MATCHUP_FORMAT } from '@Constants/errorConditionConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { COLLEGE_D3 } from '@Constants/tieFormatConstants';
import { TEAM } from '@Constants/eventConstants';

/**
 * A TEAM line is scored to its COLLECTION's format, and a score with no format is refused.
 *
 * The write path resolved a format from the matchUp, structure, draw and event — never the collection a
 * line belongs to — so every line score was validated against no format, which answered "valid" to
 * anything. CA's ruling X1 (2026-10-02): *"If there is no matchUpFormat I would … throw an error"*.
 */
const line = (s1: number, s2: number, setNumber: number) => ({
  setNumber,
  side1Score: s1,
  side2Score: s2,
  winningSide: s1 > s2 ? 1 : 2,
});

function collegeD3Line(matchUpType: string) {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
    // lines without lineUps can still be scored, so the only question asked is the score's
    policyDefinitions: { [POLICY_TYPE_SCORING]: { requireParticipantsForScoring: false } },
    setState: true,
  });
  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [matchUpType] },
    inContext: true,
  });
  // a first-round line: its dual's teams are placed, so a winner can be directed
  const target = matchUps.find((m: any) => m.roundNumber === 1);
  return { drawId, matchUp: target };
}

describe('a TEAM line is validated against its collection format', () => {
  it('COLLEGE_D3 doubles play one eight-game pro set: 8-3 is recorded, two sets 6-3 6-4 are refused', () => {
    const { drawId, matchUp } = collegeD3Line('DOUBLES');
    expect(matchUp.matchUpFormat).toEqual('SET1-S:8/TB7@7');

    let result: any = tournamentEngine.setMatchUpStatus({
      outcome: { score: { sets: [line(6, 3, 1), line(6, 4, 2)] }, winningSide: 1 },
      matchUpId: matchUp.matchUpId,
      drawId,
    });
    expect(result.error).toEqual(INVALID_SCORE);

    result = tournamentEngine.setMatchUpStatus({
      outcome: { score: { sets: [line(8, 3, 1)] }, winningSide: 1 },
      matchUpId: matchUp.matchUpId,
      drawId,
    });
    expect(result.success).toBe(true);
  });
});

describe('a score with no format is refused (ruling X1)', () => {
  it('a draw with no format anywhere refuses a score, and disableScoreValidation records it', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }] });
    // strip every level of format the mocks wrote, so nothing resolves
    for (const event of tournamentRecord.events) {
      delete event.matchUpFormat;
      for (const drawDefinition of event.drawDefinitions ?? []) {
        delete drawDefinition.matchUpFormat;
        for (const structure of drawDefinition.structures ?? []) {
          delete structure.matchUpFormat;
          for (const matchUp of structure.matchUps ?? []) delete matchUp.matchUpFormat;
        }
      }
    }
    tournamentEngine.setState(tournamentRecord);
    const { matchUps } = tournamentEngine.allTournamentMatchUps({ inContext: true });
    const { matchUpId } = matchUps.find((m: any) => m.roundNumber === 1 && m.sides?.every((s: any) => s.participant));
    const outcome = { score: { sets: [line(6, 3, 1), line(6, 4, 2)] }, winningSide: 1 };

    let result: any = tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome });
    expect(result.error).toEqual(MISSING_MATCHUP_FORMAT);

    result = tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome, disableScoreValidation: true });
    expect(result.success).toBe(true);
  });
});
