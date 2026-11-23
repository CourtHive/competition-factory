import competitionEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import { MISSING_PENALTY_TYPE, PARTICIPANT_NOT_FOUND } from '@Constants/errorConditionConstants';
import { penaltyConstants } from '@Constants/penaltyConstants';

/**
 * addPenalty reports why it refused. A missing penaltyType was refused inside the per-tournament step, whose
 * result was then discarded, so the caller was told PARTICIPANT_NOT_FOUND for participants that exist. Found by the
 * 2026-10-17 test-infrastructure survey's refusal review (penaltyCoverage asserted only that some error existed).
 */
describe('addPenalty refusals', () => {
  it('a missing penaltyType is reported as such, and nothing is written', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 4 },
      setState: true,
    });
    const { participantId } = tournamentRecord.participants[0];

    const result: any = competitionEngine.addPenalty({ participantIds: [participantId], penaltyCode: 'X' } as any);
    expect(result.error).toEqual(MISSING_PENALTY_TYPE);
    expect(competitionEngine.getTournamentPenalties().penalties).toEqual([]);
  });

  it('unknown participants are still reported as not found', () => {
    mocksEngine.generateTournamentRecord({ participantsProfile: { participantsCount: 4 }, setState: true });
    const result: any = competitionEngine.addPenalty({
      penaltyType: penaltyConstants.BALL_ABUSE,
      participantIds: ['unknown'],
      penaltyCode: 'X',
    });
    expect(result.error).toEqual(PARTICIPANT_NOT_FOUND);
  });

  it('control: a complete call succeeds', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 4 },
      setState: true,
    });
    const result: any = competitionEngine.addPenalty({
      participantIds: [tournamentRecord.participants[0].participantId],
      penaltyType: penaltyConstants.BALL_ABUSE,
      penaltyCode: 'X',
    });
    expect(result.success).toEqual(true);
    expect(result.penaltyId).toBeDefined();
  });
});
