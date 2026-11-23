import competitionEngineSync from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

// constants
import { MISSING_TOURNAMENT_RECORD, MISSING_VALUE } from '@Constants/errorConditionConstants';

test.each([competitionEngineSync])(
  'can set matchUpStatus via competitionEngine for multiple tournament records',
  async (competitionEngine) => {
    const drawProfiles = [{ drawSize: 16 }];
    const { tournamentRecord: firstRecord } = mocksEngine.generateTournamentRecord({ drawProfiles });
    const { tournamentRecord: secondRecord } = mocksEngine.generateTournamentRecord({ drawProfiles });
    await competitionEngine.setState([firstRecord, secondRecord]);

    const { upcomingMatchUps } = await competitionEngine.getCompetitionMatchUps();

    const { outcome } = mocksEngine.generateOutcomeFromScoreString({
      scoreString: '7-5 7-5',
      winningSide: 1,
    });

    const matchUp = upcomingMatchUps[0];
    const { tournamentId, matchUpId, drawId } = matchUp;
    let result = await competitionEngine.setMatchUpStatus({
      tournamentId,
      matchUpId,
      drawId,
      outcome,
    });
    expect(result.success).toEqual(true);

    let { completedMatchUps } = await competitionEngine.getCompetitionMatchUps();
    expect(completedMatchUps.length).toEqual(1);

    const score = outcome.score;
    const outcomes = upcomingMatchUps.map((matchUp) => {
      const { tournamentId, drawId, eventId, matchUpId } = matchUp;
      return {
        tournamentId,
        matchUpId,
        eventId,
        drawId,

        winningSide: 1,
        score,
      };
    });

    result = await competitionEngine.bulkMatchUpStatusUpdate({});
    expect(result.error).toEqual(MISSING_VALUE);

    result = await competitionEngine.bulkMatchUpStatusUpdate({
      outcomes: [{ drawId: 'bogusId' }],
    });
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);

    result = await competitionEngine.bulkMatchUpStatusUpdate({ outcomes });
    expect(result.success).toEqual(true);

    ({ completedMatchUps } = await competitionEngine.getCompetitionMatchUps());
    // expect that 8 + 8 first round matchUps will be completed
    expect(completedMatchUps.length).toEqual(16);
  },
);
