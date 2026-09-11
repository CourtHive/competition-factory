import { abandonTournamentMatchUps } from '@Mutate/tournaments/abandonTournamentMatchUps';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// constants
import { ABANDONED, BYE, COMPLETED, IN_PROGRESS, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { DOMINANT_DUO } from '@Constants/tieFormatConstants';
import { TEAM } from '@Constants/matchUpTypes';

const getTarget = ({ matchUps, roundNumber, roundPosition }) =>
  matchUps.find((matchUp) => matchUp.roundNumber === roundNumber && matchUp.roundPosition === roundPosition);

const completeMatchUp = ({ matchUpId, drawId }) => {
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-2', winningSide: 1 });
  const result: any = tournamentEngine.setMatchUpStatus({ matchUpId, outcome, drawId });
  expect(result.success).toEqual(true);
};

describe('abandonTournamentMatchUps', () => {
  it('returns an error when tournamentRecord is missing', () => {
    const result: any = abandonTournamentMatchUps({});
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  });

  it('abandons every readyToScore matchUp and leaves completed + empty downstream rounds untouched', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8 }] });
    tournamentEngine.setState(tournamentRecord);

    let { matchUps } = tournamentEngine.allTournamentMatchUps();
    // Fully-filled drawSize 8: 4 player-vs-player R1 matchUps are readyToScore;
    // R2/R3 have no participants yet, so they are not.
    expect(matchUps.filter((m) => m.readyToScore).length).toEqual(4);

    // Complete two of the four R1 matchUps (R1P1, R1P3).
    completeMatchUp({ matchUpId: getTarget({ matchUps, roundNumber: 1, roundPosition: 1 }).matchUpId, drawId });
    completeMatchUp({ matchUpId: getTarget({ matchUps, roundNumber: 1, roundPosition: 3 }).matchUpId, drawId });

    const result: any = tournamentEngine.abandonTournamentMatchUps();
    expect(result.success).toEqual(true);
    expect(result.abandoned).toEqual(2); // R1P2 + R1P4
    expect(result.matchUpIds).toHaveLength(2);

    ({ matchUps } = tournamentEngine.allTournamentMatchUps());
    const statusAt = (roundNumber, roundPosition) => getTarget({ matchUps, roundNumber, roundPosition }).matchUpStatus;

    expect(statusAt(1, 1)).toEqual(COMPLETED);
    expect(statusAt(1, 3)).toEqual(COMPLETED);
    expect(statusAt(1, 2)).toEqual(ABANDONED);
    expect(statusAt(1, 4)).toEqual(ABANDONED);
    // Downstream rounds had no participants on both sides — never touched.
    expect(statusAt(2, 1)).toEqual(TO_BE_PLAYED);
    expect(statusAt(2, 2)).toEqual(TO_BE_PLAYED);
    expect(statusAt(3, 1)).toEqual(TO_BE_PLAYED);

    // Idempotent: a second pass finds nothing left to abandon.
    const second: any = tournamentEngine.abandonTournamentMatchUps();
    expect(second.abandoned).toEqual(0);
  });

  it('never abandons BYE matchUps', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, participantsCount: 6 }],
    });
    tournamentEngine.setState(tournamentRecord);

    let { matchUps } = tournamentEngine.allTournamentMatchUps();
    const byeIds = matchUps.filter((m) => m.matchUpStatus === BYE).map((m) => m.matchUpId);
    expect(byeIds.length).toBeGreaterThan(0);
    const expectedAbandoned = matchUps.filter((m) => m.readyToScore).length;

    const result: any = tournamentEngine.abandonTournamentMatchUps();
    expect(result.abandoned).toEqual(expectedAbandoned);

    ({ matchUps } = tournamentEngine.allTournamentMatchUps());
    // Every BYE stays a BYE; no BYE was abandoned.
    byeIds.forEach((byeId) => {
      const byeMatchUp = matchUps.find((m) => m.matchUpId === byeId);
      expect(byeMatchUp.matchUpStatus).toEqual(BYE);
    });
    expect(matchUps.some((m) => m.matchUpStatus === ABANDONED && byeIds.includes(m.matchUpId))).toEqual(false);
  });

  it('respects requireNoScore: partial-score matchUps are skipped by default, abandoned when requireNoScore=false', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8 }] });
    tournamentEngine.setState(tournamentRecord);

    let { matchUps } = tournamentEngine.allTournamentMatchUps();
    const partial = getTarget({ matchUps, roundNumber: 1, roundPosition: 1 });
    // Started but unfinished — a score, no winner (rain-stopped mid-match).
    const inProgress: any = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: IN_PROGRESS, score: { sets: [{ setNumber: 1, side1Score: 3, side2Score: 1 }] } },
      matchUpId: partial.matchUpId,
      drawId,
    });
    expect(inProgress.success).toEqual(true);

    // Default (strict, requireNoScore=true) skips the partial-score matchUp.
    const strict: any = tournamentEngine.abandonTournamentMatchUps();
    expect(strict.abandoned).toEqual(3); // R1P2, R1P3, R1P4 — not R1P1
    expect(strict.matchUpIds).not.toContain(partial.matchUpId);

    ({ matchUps } = tournamentEngine.allTournamentMatchUps());
    expect(getTarget({ matchUps, roundNumber: 1, roundPosition: 1 }).matchUpStatus).toEqual(IN_PROGRESS);

    // requireNoScore=false sweeps the started-but-unfinished matchUp too.
    const loose: any = tournamentEngine.abandonTournamentMatchUps({ requireNoScore: false });
    expect(loose.abandoned).toEqual(1);
    expect(loose.matchUpIds).toContain(partial.matchUpId);

    ({ matchUps } = tournamentEngine.allTournamentMatchUps());
    expect(getTarget({ matchUps, roundNumber: 1, roundPosition: 1 }).matchUpStatus).toEqual(ABANDONED);
  });

  it('restricts to the given drawIds when provided', () => {
    const {
      tournamentRecord,
      drawIds: [drawIdA, drawIdB],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }, { drawSize: 4 }],
    });
    tournamentEngine.setState(tournamentRecord);

    const result: any = tournamentEngine.abandonTournamentMatchUps({ drawIds: [drawIdA] });
    expect(result.success).toEqual(true);

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const abandonedDraws = new Set(matchUps.filter((m) => m.matchUpStatus === ABANDONED).map((m) => m.drawId));
    expect(abandonedDraws.has(drawIdA)).toEqual(true);
    expect(abandonedDraws.has(drawIdB)).toEqual(false);
  });

  it('restricts to the given eventIds when provided', () => {
    const {
      tournamentRecord,
      eventIds: [eventIdA, eventIdB],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }, { drawSize: 4 }],
    });
    tournamentEngine.setState(tournamentRecord);

    const result: any = tournamentEngine.abandonTournamentMatchUps({ eventIds: [eventIdA] });
    expect(result.success).toEqual(true);

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const abandonedEvents = new Set(matchUps.filter((m) => m.matchUpStatus === ABANDONED).map((m) => m.eventId));
    expect(abandonedEvents.has(eventIdA)).toEqual(true);
    expect(abandonedEvents.has(eventIdB)).toEqual(false);
  });

  it('skips TEAM container and tie collection matchUps', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      policyDefinitions: { scoring: { requireParticipantsForScoring: false } },
      drawProfiles: [{ tieFormatName: DOMINANT_DUO, eventType: TEAM, drawSize: 4 }],
    });
    tournamentEngine.setState(tournamentRecord);

    let { matchUps } = tournamentEngine.allTournamentMatchUps();
    // The R1 TEAM ties are readyToScore (both teams assigned, no winner) — the
    // guard must skip them rather than abandon a whole tie.
    expect(matchUps.some((m) => m.matchUpType === TEAM && m.readyToScore)).toEqual(true);

    const result: any = tournamentEngine.abandonTournamentMatchUps();
    expect(result.success).toEqual(true);
    expect(result.abandoned).toEqual(0);

    ({ matchUps } = tournamentEngine.allTournamentMatchUps());
    expect(matchUps.some((m) => m.matchUpStatus === ABANDONED)).toEqual(false);
  });
});
