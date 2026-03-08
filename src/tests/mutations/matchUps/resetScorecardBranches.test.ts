import { resetScorecard } from '@Mutate/matchUps/resetScorecard';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';
import { DOUBLES, TEAM } from '@Constants/matchUpTypes';
import { COLLEGE_D3 } from '@Constants/tieFormatConstants';
import {
  CANNOT_CHANGE_WINNING_SIDE,
  INVALID_VALUES,
  MATCHUP_NOT_FOUND,
  MISSING_DRAW_DEFINITION,
  MISSING_MATCHUP_ID,
} from '@Constants/errorConditionConstants';

const policyDefinitions = { [POLICY_TYPE_SCORING]: { requireParticipantsForScoring: false } };

describe('resetScorecard branch coverage', () => {
  it('tiebreakReset with matchUp-level tieFormat triggers resetTieFormat', () => {
    // Tests lines 129-159: tiebreakReset && !tieFormatRemoved,
    // compareTieFormats condition met, resetTieFormat called
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM_EVENT, tieFormatName: COLLEGE_D3 }],
      policyDefinitions,
    });

    tournamentEngine.setState(tournamentRecord);

    let {
      matchUps: [teamMatchUp],
    } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM], roundNumbers: [1] },
    });

    const matchUpId = teamMatchUp.matchUpId;
    expect(teamMatchUp.tieMatchUps.length).toEqual(9);

    // Add a "Tiebreaker" collection to this specific matchUp
    const addResult = tournamentEngine.addCollectionDefinition({
      collectionDefinition: {
        collectionName: 'Tiebreaker',
        matchUpFormat: 'SET1-S:8/TB7@7',
        matchUpType: DOUBLES,
        matchUpCount: 1,
        matchUpValue: 1,
      },
      matchUpId,
      drawId,
    });
    expect(addResult.success).toEqual(true);

    ({
      matchUps: [teamMatchUp],
    } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM], roundNumbers: [1] },
    }));
    expect(teamMatchUp.tieMatchUps.length).toEqual(10);

    const result = tournamentEngine.resetScorecard({
      tiebreakReset: true,
      matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Verify the tiebreaker collection was removed
    ({
      matchUps: [teamMatchUp],
    } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM], roundNumbers: [1] },
    }));
    expect(teamMatchUp.tieMatchUps.length).toEqual(9);
  });

  it('tiebreakReset without matchUp-level tieFormat does not call resetTieFormat', () => {
    // Tests line 137: matchUp.tieFormat is falsy, compareTieFormats not called
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM_EVENT, tieFormatName: COLLEGE_D3 }],
      policyDefinitions,
    });

    tournamentEngine.setState(tournamentRecord);

    const {
      matchUps: [teamMatchUp],
    } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM], roundNumbers: [1] },
    });

    // No matchUp-level tieFormat, tiebreakReset branch at line 137 is false
    const result = tournamentEngine.resetScorecard({
      matchUpId: teamMatchUp.matchUpId,
      tiebreakReset: true,
      drawId,
    });
    expect(result.success).toEqual(true);
  });

  it('tiebreakReset with identical tieFormat is skipped (tieFormatRemoved=true)', () => {
    // Tests line 129: updateTieMatchUpScore sets tieFormatRemoved=true for identical tieFormat
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM_EVENT, tieFormatName: COLLEGE_D3 }],
      policyDefinitions,
    });

    tournamentEngine.setState(tournamentRecord);

    const {
      matchUps: [teamMatchUp],
    } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM], roundNumbers: [1] },
    });

    const matchUpId = teamMatchUp.matchUpId;
    const { event, drawDefinition } = tournamentEngine.getEvent({ drawId });

    // Set an identical tieFormat on the matchUp (same as event level)
    const matchUp = drawDefinition.structures[0].matchUps.find((m) => m.matchUpId === matchUpId);
    if (matchUp) {
      matchUp.tieFormat = structuredClone(event.tieFormat);
    }

    const result = resetScorecard({
      tournamentRecord: tournamentEngine.getTournament().tournamentRecord,
      drawDefinition,
      matchUpId,
      tiebreakReset: true,
      event,
    });
    expect(result.success).toEqual(true);
  });

  it('tiebreakReset: multiple extra collections does NOT trigger resetTieFormat', () => {
    // Tests lines 145-146: descendantDifferences.collectionIds.length !== 1
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM_EVENT, tieFormatName: COLLEGE_D3 }],
      policyDefinitions,
    });

    tournamentEngine.setState(tournamentRecord);

    let {
      matchUps: [teamMatchUp],
    } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM], roundNumbers: [1] },
    });

    const matchUpId = teamMatchUp.matchUpId;

    // Add TWO extra collections
    let addResult = tournamentEngine.addCollectionDefinition({
      collectionDefinition: {
        collectionName: 'Tiebreaker A',
        matchUpFormat: 'SET1-S:8/TB7@7',
        matchUpType: DOUBLES,
        matchUpCount: 1,
        matchUpValue: 1,
      },
      matchUpId,
      drawId,
    });
    expect(addResult.success).toEqual(true);

    addResult = tournamentEngine.addCollectionDefinition({
      collectionDefinition: {
        collectionName: 'Tiebreaker B',
        matchUpFormat: 'SET1-S:8/TB7@7',
        matchUpType: DOUBLES,
        matchUpCount: 1,
        matchUpValue: 1,
      },
      matchUpId,
      drawId,
    });
    expect(addResult.success).toEqual(true);

    ({
      matchUps: [teamMatchUp],
    } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM], roundNumbers: [1] },
    }));
    expect(teamMatchUp.tieMatchUps.length).toEqual(11);

    // tiebreakReset=true, but 2 extra collections fails condition at line 146
    const result = tournamentEngine.resetScorecard({
      tiebreakReset: true,
      matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    // tieFormat NOT reset (still 11 tieMatchUps)
    ({
      matchUps: [teamMatchUp],
    } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM], roundNumbers: [1] },
    }));
    expect(teamMatchUp.tieMatchUps.length).toEqual(11);
  });

  it('tiebreakReset=false skips tieFormat comparison entirely', () => {
    // Tests line 129: params.tiebreakReset is false
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM_EVENT, tieFormatName: COLLEGE_D3 }],
      policyDefinitions,
    });

    tournamentEngine.setState(tournamentRecord);

    let {
      matchUps: [teamMatchUp],
    } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM], roundNumbers: [1] },
    });

    const matchUpId = teamMatchUp.matchUpId;

    // Add a tiebreaker collection
    tournamentEngine.addCollectionDefinition({
      collectionDefinition: {
        collectionName: 'Tiebreaker',
        matchUpFormat: 'SET1-S:8/TB7@7',
        matchUpType: DOUBLES,
        matchUpCount: 1,
        matchUpValue: 1,
      },
      matchUpId,
      drawId,
    });

    // tiebreakReset=false → tiebreakReset block skipped
    const result = tournamentEngine.resetScorecard({
      tiebreakReset: false,
      matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    // tieFormat NOT reset (tiebreaker remains)
    ({
      matchUps: [teamMatchUp],
    } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM], roundNumbers: [1] },
    }));
    expect(teamMatchUp.tieMatchUps.length).toEqual(10);
  });

  it('CANNOT_CHANGE_WINNING_SIDE when downstream matchUp has winningSide', () => {
    // Tests line 95: isActiveDownstream returns true when downstream matchUp is completed
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, eventType: TEAM_EVENT, tieFormatName: COLLEGE_D3 }],
      policyDefinitions,
    });

    tournamentEngine.setState(tournamentRecord);

    const { matchUps: firstRoundMatchUps } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM], roundNumbers: [1] },
    });
    expect(firstRoundMatchUps.length).toEqual(2);

    const outcome = {
      winningSide: 1,
      score: {
        scoreStringSide1: '6-1',
        scoreStringSide2: '1-6',
        sets: [{ setNumber: 1, side1Score: 6, side2Score: 1, winningSide: 1 }],
      },
    };

    // Complete BOTH first-round team matchUps (5 wins each for COLLEGE_D3 valueGoal=5)
    for (const teamMatchUp of firstRoundMatchUps) {
      for (const tieMatchUp of teamMatchUp.tieMatchUps.slice(0, 5)) {
        const result = tournamentEngine.setMatchUpStatus({
          matchUpId: tieMatchUp.matchUpId,
          outcome,
          drawId,
        });
        expect(result.success).toEqual(true);
      }
    }

    // Complete the second-round team matchUp too (giving it a winningSide)
    const { matchUps: secondRoundMatchUps } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM], roundNumbers: [2] },
    });
    expect(secondRoundMatchUps.length).toEqual(1);

    for (const tieMatchUp of secondRoundMatchUps[0].tieMatchUps.slice(0, 5)) {
      const result = tournamentEngine.setMatchUpStatus({
        matchUpId: tieMatchUp.matchUpId,
        outcome,
        drawId,
      });
      expect(result.success).toEqual(true);
    }

    // Try to reset a first-round scorecard → should fail (downstream has winningSide)
    const result = tournamentEngine.resetScorecard({
      matchUpId: firstRoundMatchUps[0].matchUpId,
      drawId,
    });
    expect(result.error).toEqual(CANNOT_CHANGE_WINNING_SIDE);
  });

  it('handles matchUpId as empty string', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4 }],
    });

    const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];

    const result = resetScorecard({
      tournamentRecord,
      drawDefinition,
      matchUpId: '',
    });
    expect(result.error).toEqual(MISSING_MATCHUP_ID);
  });

  it('handles matchUpId as object', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4 }],
    });

    const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];

    const result = resetScorecard({
      tournamentRecord,
      drawDefinition,
      matchUpId: {} as any,
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('handles matchUpId as boolean', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4 }],
    });

    const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];

    const result = resetScorecard({
      tournamentRecord,
      drawDefinition,
      matchUpId: true as any,
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('resets scored tieMatchUps with tiebreakReset=true removes tiebreaker', () => {
    // Tests full flow with scores: score tieMatchUps, add tiebreaker, reset
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM_EVENT, tieFormatName: COLLEGE_D3 }],
      policyDefinitions,
    });

    tournamentEngine.setState(tournamentRecord);

    let {
      matchUps: [teamMatchUp],
    } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM], roundNumbers: [1] },
    });

    const matchUpId = teamMatchUp.matchUpId;

    // Score a couple of tieMatchUps
    const outcome = {
      winningSide: 1,
      score: {
        scoreStringSide1: '6-3',
        scoreStringSide2: '3-6',
        sets: [{ setNumber: 1, side1Score: 6, side2Score: 3, winningSide: 1 }],
      },
    };

    for (const tieMatchUp of teamMatchUp.tieMatchUps.slice(0, 2)) {
      tournamentEngine.setMatchUpStatus({
        matchUpId: tieMatchUp.matchUpId,
        outcome,
        drawId,
      });
    }

    // Add a tiebreaker collection
    const addResult = tournamentEngine.addCollectionDefinition({
      collectionDefinition: {
        collectionName: 'Tiebreaker',
        matchUpFormat: 'SET1-S:8/TB7@7',
        matchUpType: DOUBLES,
        matchUpCount: 1,
        matchUpValue: 1,
      },
      matchUpId,
      drawId,
    });
    expect(addResult.success).toEqual(true);

    ({
      matchUps: [teamMatchUp],
    } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM], roundNumbers: [1] },
    }));
    expect(teamMatchUp.tieMatchUps.length).toEqual(10);

    // Reset with tiebreakReset: scores cleared AND tiebreaker removed
    const result = tournamentEngine.resetScorecard({
      tiebreakReset: true,
      matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    ({
      matchUps: [teamMatchUp],
    } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM], roundNumbers: [1] },
    }));
    expect(teamMatchUp.tieMatchUps.length).toEqual(9);

    // Verify all scores cleared
    for (const tm of teamMatchUp.tieMatchUps) {
      expect(tm.winningSide).toBeUndefined();
    }
  });

  it('tiebreakReset with no inheritedTieFormat skips resetTieFormat', () => {
    // Tests line 137: inheritedTieFormat is falsy
    // Use direct function call with manipulated data
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM_EVENT, tieFormatName: COLLEGE_D3 }],
      policyDefinitions,
    });

    tournamentEngine.setState(tournamentRecord);

    // Add a tiebreaker to the matchUp first (gives it a matchUp-level tieFormat)
    let {
      matchUps: [teamMatchUp],
    } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM], roundNumbers: [1] },
    });
    const matchUpId = teamMatchUp.matchUpId;

    const addResult = tournamentEngine.addCollectionDefinition({
      collectionDefinition: {
        collectionName: 'Tiebreaker',
        matchUpFormat: 'SET1-S:8/TB7@7',
        matchUpType: DOUBLES,
        matchUpCount: 1,
        matchUpValue: 1,
      },
      matchUpId,
      drawId,
    });
    expect(addResult.success).toEqual(true);

    const { event, drawDefinition } = tournamentEngine.getEvent({ drawId });

    // Remove all inherited tieFormats so resolveTieFormat returns nothing
    event.tieFormat = undefined as any;
    drawDefinition.tieFormat = undefined as any;
    if (drawDefinition.structures?.[0]) {
      drawDefinition.structures[0].tieFormat = undefined as any;
    }

    const result = resetScorecard({
      tournamentRecord: tournamentEngine.getTournament().tournamentRecord,
      drawDefinition,
      matchUpId,
      tiebreakReset: true,
      event,
    });
    // Should succeed: the tiebreakReset path enters but inheritedTieFormat is falsy
    // so compareTieFormats is not called
    expect(result.success).toEqual(true);
  });

  it('handles drawDefinition as empty object', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();

    const result = resetScorecard({
      tournamentRecord,
      drawDefinition: {} as any,
      matchUpId: 'some-id',
    });
    expect(result.error).toEqual(MATCHUP_NOT_FOUND);
  });

  it('engine resetScorecard without drawId returns MISSING_DRAW_DEFINITION', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM_EVENT }],
      policyDefinitions,
    });

    tournamentEngine.setState(tournamentRecord);

    const {
      matchUps: [teamMatchUp],
    } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM], roundNumbers: [1] },
    });

    const result = tournamentEngine.resetScorecard({
      matchUpId: teamMatchUp.matchUpId,
      tiebreakReset: true,
    });
    expect(result.error).toEqual(MISSING_DRAW_DEFINITION);
  });
});
