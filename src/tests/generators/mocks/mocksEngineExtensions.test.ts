import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

// constants
import { CONSOLATION, FIRST_MATCH_LOSER_CONSOLATION, MAIN } from '@Constants/drawDefinitionConstants';
import { COMPLETED, DOUBLE_WALKOVER, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';

describe('Extension 1: completeDrawMatchUps stage/roundNumber filters', () => {
  it('can complete only MAIN stage round 1 of an FMLC draw', () => {
    const drawProfiles = [
      {
        drawSize: 16,
        drawType: FIRST_MATCH_LOSER_CONSOLATION,
      },
    ];
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({ drawProfiles });

    const event = tournamentRecord.events[0];
    const drawDefinition = event.drawDefinitions.find((d) => d.drawId === drawId);

    mocksEngine.completeDrawMatchUps({
      tournamentRecord,
      drawDefinition,
      event,
      stage: MAIN,
      roundNumber: 1,
      completeAllMatchUps: '6-3 6-4',
    });

    tournamentEngine.setState(tournamentRecord);
    const { matchUps } = tournamentEngine.allTournamentMatchUps();

    const mainR1 = matchUps.filter((m) => m.stage === MAIN && m.roundNumber === 1);
    const mainR2 = matchUps.filter((m) => m.stage === MAIN && m.roundNumber === 2);
    const consolation = matchUps.filter((m) => m.stage === CONSOLATION);

    expect(mainR1.every((m) => m.matchUpStatus === COMPLETED)).toBe(true);
    expect(mainR1.length).toBe(8);
    expect(mainR2.every((m) => m.matchUpStatus !== COMPLETED)).toBe(true);
    expect(consolation.every((m) => m.matchUpStatus !== COMPLETED)).toBe(true);
  });

  it('can complete only CONSOLATION stage matchUps', () => {
    const drawProfiles = [
      {
        drawSize: 8,
        drawType: FIRST_MATCH_LOSER_CONSOLATION,
      },
    ];
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({ drawProfiles });

    const event = tournamentRecord.events[0];
    const drawDefinition = event.drawDefinitions.find((d) => d.drawId === drawId);

    // First complete all MAIN matchUps
    mocksEngine.completeDrawMatchUps({
      tournamentRecord,
      drawDefinition,
      event,
      stage: MAIN,
      completeAllMatchUps: '6-1 6-1',
    });

    tournamentEngine.setState(tournamentRecord);
    let { matchUps } = tournamentEngine.allTournamentMatchUps();
    const mainCompleted = matchUps.filter((m) => m.stage === MAIN && m.matchUpStatus === COMPLETED);
    expect(mainCompleted.length).toBe(7);

    // Now complete consolation
    mocksEngine.completeDrawMatchUps({
      tournamentRecord,
      drawDefinition,
      event,
      stage: CONSOLATION,
      completeAllMatchUps: '6-2 6-2',
    });

    tournamentEngine.setState(tournamentRecord);
    ({ matchUps } = tournamentEngine.allTournamentMatchUps());
    const consolationCompleted = matchUps.filter((m) => m.stage === CONSOLATION && m.matchUpStatus === COMPLETED);
    expect(consolationCompleted.length).toBeGreaterThan(0);
  });

  it('returns completedCount reflecting filtered completions', () => {
    const drawProfiles = [{ drawSize: 16 }];
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({ drawProfiles });

    const event = tournamentRecord.events[0];
    const drawDefinition = event.drawDefinitions.find((d) => d.drawId === drawId);

    const result = mocksEngine.completeDrawMatchUps({
      tournamentRecord,
      drawDefinition,
      event,
      roundNumber: 1,
      completeAllMatchUps: '6-0 6-0',
    });

    expect(result.success).toBe(true);
    expect(result.completedCount).toBe(8);
  });
});

describe('Extension 2: removeMatchUpOutcome', () => {
  it('can remove a matchUp outcome and reset to TO_BE_PLAYED', () => {
    const drawProfiles = [{ drawSize: 4 }];
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles,
      completeAllMatchUps: true,
    });

    tournamentEngine.setState(tournamentRecord);
    const { matchUps } = tournamentEngine.allTournamentMatchUps();

    // Remove the final first, then earlier rounds
    const r2MatchUp = matchUps.find((m) => m.roundNumber === 2);
    expect(r2MatchUp.matchUpStatus).toBe(COMPLETED);

    let result = mocksEngine.removeMatchUpOutcome({
      tournamentRecord,
      drawId,
      matchUpId: r2MatchUp.matchUpId,
    });
    expect(result.success).toBe(true);

    // Now remove a round 1 matchUp
    const r1MatchUp = matchUps.find((m) => m.roundNumber === 1);
    result = mocksEngine.removeMatchUpOutcome({
      tournamentRecord,
      drawId,
      matchUpId: r1MatchUp.matchUpId,
    });
    expect(result.success).toBe(true);

    tournamentEngine.setState(tournamentRecord);
    const { matchUps: updatedMatchUps } = tournamentEngine.allTournamentMatchUps();
    const updated = updatedMatchUps.find((m) => m.matchUpId === r1MatchUp.matchUpId);
    expect(updated.matchUpStatus).toBe(TO_BE_PLAYED);
    expect(updated.winningSide).toBeUndefined();
  });
});

describe('Extension 3: drawProfile outcomes with double exit status', () => {
  it('supports DOUBLE_WALKOVER in drawProfile outcomes with completeAllMatchUps', () => {
    // First apply the outcome, then complete remaining matchUps separately
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 8,
          outcomes: [{ roundNumber: 1, matchUpIndex: 0, matchUpStatus: DOUBLE_WALKOVER }],
        },
      ],
    });

    expect(tournamentRecord).toBeDefined();

    // Now complete remaining matchUps using the new stage/round filters
    const event = tournamentRecord.events[0];
    const drawDefinition = event.drawDefinitions.find((d) => d.drawId === drawId);

    mocksEngine.completeDrawMatchUps({
      tournamentRecord,
      drawDefinition,
      event,
      completeAllMatchUps: '6-1 6-1',
    });

    tournamentEngine.setState(tournamentRecord);
    const { matchUps } = tournamentEngine.allTournamentMatchUps();

    // Verify the specified matchUp got DOUBLE_WALKOVER status
    const mainR1 = matchUps
      .filter((m) => m.stage === MAIN && m.roundNumber === 1)
      .sort((a, b) => a.roundPosition - b.roundPosition);

    expect(mainR1[0].matchUpStatus).toBe(DOUBLE_WALKOVER);

    // The remaining 3 first-round matchUps should be completed
    const completedR1 = mainR1.filter((m) => m.matchUpStatus === COMPLETED);
    expect(completedR1.length).toBe(3);

    // Total matchUps should still be 7 (for 8-draw elimination)
    expect(matchUps.length).toBe(7);
  });

  it('supports DOUBLE_WALKOVER in FMLC drawProfile outcomes', () => {
    const result = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 8,
          drawType: FIRST_MATCH_LOSER_CONSOLATION,
          outcomes: [{ roundNumber: 1, matchUpIndex: 0, matchUpStatus: DOUBLE_WALKOVER }],
        },
      ],
    });

    expect(result.tournamentRecord).toBeDefined();
    tournamentEngine.setState(result.tournamentRecord);

    const { matchUps } = tournamentEngine.allTournamentMatchUps();

    const mainR1 = matchUps
      .filter((m) => m.stage === MAIN && m.roundNumber === 1)
      .sort((a, b) => a.roundPosition - b.roundPosition);

    expect(mainR1[0].matchUpStatus).toBe(DOUBLE_WALKOVER);
  });
});
