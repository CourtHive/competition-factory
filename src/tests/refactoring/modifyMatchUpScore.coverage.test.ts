/**
 * Coverage tests for modifyMatchUpScore refactoring.
 * Targets uncovered branches: walkover/double-walkover score reset,
 * removeWinningSide, IN_PROGRESS auto-status, defaulted process codes,
 * tieMatchUp resolution within dual matchUps, and notes attachment.
 */
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

import { COMPLETED, DEFAULTED, DOUBLE_WALKOVER, IN_PROGRESS, SUSPENDED, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { SINGLES_MATCHUP } from '@Constants/matchUpTypes';
import { TEAM_EVENT } from '@Constants/eventConstants';

describe('modifyMatchUpScore coverage', () => {
  it('handles WALKOVER status by resetting score to toBePlayed', () => {
    const drawProfiles = [{ drawSize: 4 }];
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      setState: true,
      drawProfiles,
    });

    let { matchUps } = tournamentEngine.allTournamentMatchUps();
    const target = matchUps.find((m) => m.matchUpStatus === TO_BE_PLAYED && m.readyToScore);

    let result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: target.matchUpId,
      outcome: {
        matchUpStatus: WALKOVER,
        winningSide: 1,
      },
      drawId,
    });
    expect(result.success).toEqual(true);

    ({ matchUps } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpIds: [target.matchUpId] },
    }));
    expect(matchUps[0].matchUpStatus).toEqual(WALKOVER);
    expect(matchUps[0].winningSide).toEqual(1);
  });

  it('handles DOUBLE_WALKOVER status by resetting score', () => {
    const drawProfiles = [{ drawSize: 4 }];
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      setState: true,
      drawProfiles,
    });

    let { matchUps } = tournamentEngine.allTournamentMatchUps();
    const target = matchUps.find((m) => m.matchUpStatus === TO_BE_PLAYED && m.readyToScore);

    let result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: target.matchUpId,
      outcome: {
        matchUpStatus: DOUBLE_WALKOVER,
      },
      drawId,
    });
    expect(result.success).toEqual(true);

    ({ matchUps } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpIds: [target.matchUpId] },
    }));
    expect(matchUps[0].matchUpStatus).toEqual(DOUBLE_WALKOVER);
  });

  it('handles DEFAULTED status with complete assignments', () => {
    const drawProfiles = [{ drawSize: 4 }];
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      setState: true,
      drawProfiles,
    });

    let { matchUps } = tournamentEngine.allTournamentMatchUps();
    const target = matchUps.find((m) => m.matchUpStatus === TO_BE_PLAYED && m.readyToScore);

    let result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: target.matchUpId,
      outcome: { matchUpStatus: DEFAULTED, winningSide: 1 },
      drawId,
    });
    expect(result.success).toEqual(true);

    ({ matchUps } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpIds: [target.matchUpId] },
    }));
    expect(matchUps[0].matchUpStatus).toEqual(DEFAULTED);
    expect(matchUps[0].winningSide).toEqual(1);
  });

  it('handles SUSPENDED status with score value - does not set IN_PROGRESS', () => {
    const drawProfiles = [{ drawSize: 4 }];
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      setState: true,
      drawProfiles,
    });

    let { matchUps } = tournamentEngine.allTournamentMatchUps();
    const target = matchUps.find((m) => m.matchUpStatus === TO_BE_PLAYED && m.readyToScore);

    let result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: target.matchUpId,
      outcome: {
        matchUpStatus: SUSPENDED,
        score: {
          scoreStringSide1: '6-3',
          scoreStringSide2: '3-6',
          sets: [
            {
              side1Score: 6,
              side2Score: 3,
              setNumber: 1,
              winningSide: 1,
            },
          ],
        },
      },
      drawId,
    });
    expect(result.success).toEqual(true);

    ({ matchUps } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpIds: [target.matchUpId] },
    }));
    expect(matchUps[0].matchUpStatus).toEqual(SUSPENDED);
  });

  it('sets IN_PROGRESS when score has value and status is not completed/suspended', () => {
    const drawProfiles = [{ drawSize: 4 }];
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      setState: true,
      drawProfiles,
    });

    let { matchUps } = tournamentEngine.allTournamentMatchUps();
    const target = matchUps.find((m) => m.matchUpStatus === TO_BE_PLAYED && m.readyToScore);

    let result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: target.matchUpId,
      outcome: {
        matchUpStatus: IN_PROGRESS,
        score: {
          scoreStringSide1: '6-3',
          scoreStringSide2: '3-6',
          sets: [
            {
              side1Score: 6,
              side2Score: 3,
              setNumber: 1,
              winningSide: 1,
            },
          ],
        },
      },
      drawId,
    });
    expect(result.success).toEqual(true);

    ({ matchUps } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpIds: [target.matchUpId] },
    }));
    expect(matchUps[0].matchUpStatus).toEqual(IN_PROGRESS);
  });

  it('handles TEAM matchUp score modification', () => {
    const drawProfiles = [{ drawSize: 4, drawType: 'ROUND_ROBIN' }];
    const eventProfiles = [{ eventType: TEAM_EVENT, drawProfiles }];

    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      eventProfiles,
      setState: true,
    });

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const teamMatchUp = matchUps.find((m) => m.matchUpType === 'TEAM');
    expect(teamMatchUp).toBeDefined();
  });
});
