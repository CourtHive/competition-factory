import { MATCHUP_SCORE_INVALID_FOR_FORMAT } from '@Query/tournaments/getTournamentInconsistencies';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { DOMINANT_DUO } from '@Constants/tieFormatConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';
import { SINGLES, TEAM } from '@Constants/matchUpTypes';

/**
 * Plan step 4 (TOURNAMENT_RECORD_FORMAT_VALIDATION): a stored score its matchUp's effective format cannot produce is
 * a warning in `getTournamentInconsistencies`. Each bad score is written here with `disableScoreValidation`, the way an
 * import or a correction stores one, because the write path would refuse it.
 */
const FORMAT = 'SET3-S:6/TB7';

function generate() {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    eventProfiles: [
      { drawProfiles: [{ drawSize: 8, matchUpFormat: FORMAT }] },
      { eventType: TEAM_EVENT, tieFormatName: DOMINANT_DUO, drawProfiles: [{ drawSize: 4 }] },
    ],
    completeAllMatchUps: true,
    setState: true,
  });
  return tournamentRecord;
}

const findings = () =>
  tournamentEngine
    .getTournamentInconsistencies()
    .inconsistencies.filter(({ issueType }: any) => issueType === MATCHUP_SCORE_INVALID_FOR_FORMAT);

function store(matchUp: any, sets: any[], winningSide: number) {
  let result: any = tournamentEngine.setMatchUpStatus({
    outcome: { score: { sets }, winningSide, matchUpStatus: COMPLETED },
    matchUpId: matchUp.matchUpId,
    disableScoreValidation: true,
    drawId: matchUp.drawId,
  });
  expect(result.success).toBe(true);
}

const set = (setNumber: number, side1Score: number, side2Score: number, extra = {}) => ({
  winningSide: side1Score > side2Score ? 1 : 2,
  side1Score,
  side2Score,
  setNumber,
  ...extra,
});

describe('MATCHUP_SCORE_INVALID_FOR_FORMAT', () => {
  it('a completed generated record has none', () => {
    generate();
    expect(findings()).toEqual([]);
  });

  it('a stored score the format cannot produce is a warning on that matchUp, and the record stays valid', () => {
    generate();
    const { matchUps } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [SINGLES] },
      inContext: true,
    });
    const target = matchUps.find((m: any) => m.matchUpFormat === FORMAT && !m.collectionId && m.roundNumber === 1);
    // a 7-3 set does not exist with a tiebreak at six
    store(target, [set(1, 3, 7), set(2, 6, 4), set(3, 6, 4)], 1);

    let result: any = tournamentEngine.getTournamentInconsistencies();
    expect(result.valid).toBe(true);
    const [finding, ...rest] = findings();
    expect(rest).toEqual([]);
    expect(finding).toMatchObject({
      issueType: MATCHUP_SCORE_INVALID_FOR_FORMAT,
      structureId: target.structureId,
      matchUpId: target.matchUpId,
      eventId: target.eventId,
      drawId: target.drawId,
      matchUpFormat: FORMAT,
      matchUpStatus: COMPLETED,
      severity: 'warning',
      scope: 'STRUCTURE',
    });
    expect(finding.message).toContain(`is invalid for ${FORMAT}`);
    expect(finding.code).toEqual('ERR_INVALID_SCORE');
  });

  it('a TEAM line is judged by its collection format, and the TEAM matchUp itself is never asked', () => {
    generate();
    const { matchUps } = tournamentEngine.allTournamentMatchUps({ inContext: true });
    const line = matchUps.find((m: any) => m.collectionId && m.matchUpFormat === 'SET1-S:8/TB7');
    expect(line).toBeDefined();
    // a finished 6-4 set does not exist in a set to eight
    store(line, [set(1, 6, 4)], 1);

    const lineFindings = findings();
    expect(lineFindings.map(({ matchUpId }: any) => matchUpId)).toEqual([line.matchUpId]);
    expect(lineFindings[0].matchUpFormat).toEqual('SET1-S:8/TB7');
    const teamIds = new Set(matchUps.filter((m: any) => m.matchUpType === TEAM).map((m: any) => m.matchUpId));
    expect(lineFindings.some(({ matchUpId }: any) => teamIds.has(matchUpId))).toBe(false);
  });

  it('a bare 7-6, accepted on write with a warning, is not reported', () => {
    generate();
    const { matchUps } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [SINGLES] },
      inContext: true,
    });
    const target = matchUps.find((m: any) => m.matchUpFormat === FORMAT && !m.collectionId && m.roundNumber === 1);
    store(target, [set(1, 7, 6), set(2, 6, 4)], 1);
    expect(findings()).toEqual([]);
  });
});
