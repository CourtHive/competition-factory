import competitionEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

// constants
import { penaltyConstants } from '@Constants/penaltyConstants';
import {
  INVALID_VALUES,
  MISSING_PENALTY_ID,
  MISSING_PENALTY_TYPE,
  NO_VALID_ATTRIBUTES,
  PARTICIPANT_NOT_FOUND,
  PENALTY_NOT_FOUND,
} from '@Constants/errorConditionConstants';
const { BALL_ABUSE, VERBAL_ABUSE } = penaltyConstants;

describe('penalty edge cases', () => {
  it('addPenalty returns error for missing participantIds or penaltyType', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 10 },
    });
    competitionEngine.setState(tournamentRecord);

    // missing penaltyType
    let result = competitionEngine.addPenalty({
      participantIds: [tournamentRecord.participants[0].participantId],
      penaltyCode: 'X',
    });
    expect(result.error).toEqual(MISSING_PENALTY_TYPE);

    // participantIds that don't exist in tournament
    result = competitionEngine.addPenalty({
      participantIds: ['nonexistent-id'],
      penaltyType: BALL_ABUSE,
      penaltyCode: 'X',
    });
    expect(result.error).toEqual(PARTICIPANT_NOT_FOUND);
  });

  it('addPenalty supports extensions', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 10 },
    });
    competitionEngine.setState(tournamentRecord);

    const { participantId } = tournamentRecord.participants[0];
    const extensions = [{ name: 'testExt', value: 'testVal' }];
    const result = competitionEngine.addPenalty({
      participantIds: [participantId],
      penaltyType: BALL_ABUSE,
      penaltyCode: 'EXT',
      extensions,
    });
    expect(result.success).toEqual(true);
    expect(result.penaltyId).toBeDefined();
  });

  it('addPenalty across multiple participants', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 10 },
    });
    competitionEngine.setState(tournamentRecord);

    const participants = competitionEngine.getParticipants().participants;
    const ids = participants.slice(0, 3).map((p) => p.participantId);
    const result = competitionEngine.addPenalty({
      participantIds: ids,
      penaltyType: BALL_ABUSE,
      penaltyCode: 'MULTI',
    });
    expect(result.success).toEqual(true);
    expect(result.penaltyId).toBeDefined();

    // Verify penalty was added to each participant
    for (const id of ids) {
      const { participant } = competitionEngine.findParticipant({ participantId: id });
      expect(participant.penalties?.length).toEqual(1);
      expect(participant.penalties[0].penaltyId).toEqual(result.penaltyId);
    }
  });

  it('modifyPenalty returns error for invalid modifications', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 10 },
    });
    competitionEngine.setState(tournamentRecord);

    const { participantId } = tournamentRecord.participants[0];
    let result = competitionEngine.addPenalty({
      participantIds: [participantId],
      penaltyType: BALL_ABUSE,
      penaltyCode: 'X',
    });
    const { penaltyId } = result;

    // no modifications param
    result = competitionEngine.modifyPenalty({ penaltyId });
    expect(result.error).toEqual(INVALID_VALUES);

    // no valid attributes (penaltyId can't be modified)
    result = competitionEngine.modifyPenalty({
      penaltyId,
      modifications: { penaltyId: 'newId', nonExistentField: 'value' },
    });
    expect(result.error).toEqual(NO_VALID_ATTRIBUTES);

    // missing penaltyId
    result = competitionEngine.modifyPenalty({ modifications: { notes: 'test' } });
    expect(result.error).toEqual(MISSING_PENALTY_ID);

    // nonexistent penaltyId
    result = competitionEngine.modifyPenalty({
      penaltyId: 'nonexistent',
      modifications: { notes: 'test' },
    });
    expect(result.error).toEqual(PENALTY_NOT_FOUND);
  });

  it('removePenalty returns error for missing/invalid penaltyId', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 10 },
    });
    competitionEngine.setState(tournamentRecord);

    // missing penaltyId
    let result = competitionEngine.removePenalty({});
    expect(result.error).toEqual(MISSING_PENALTY_ID);

    // nonexistent penaltyId — removePenalty at competition level returns success
    // because it iterates all tournaments and none error fatally
    result = competitionEngine.removePenalty({ penaltyId: 'nonexistent' });
    expect(result.success).toEqual(true);
  });

  it('modifyPenalty can update multiple valid attributes', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 10 },
    });
    competitionEngine.setState(tournamentRecord);

    const { participantId } = tournamentRecord.participants[0];
    let result = competitionEngine.addPenalty({
      participantIds: [participantId],
      penaltyType: BALL_ABUSE,
      penaltyCode: 'X',
      notes: 'original',
    });
    const { penaltyId } = result;

    result = competitionEngine.modifyPenalty({
      penaltyId,
      modifications: {
        notes: 'updated',
        penaltyCode: 'NEW',
        penaltyType: VERBAL_ABUSE,
        issuedAt: '2025-01-01',
      },
    });
    expect(result.success).toEqual(true);
    expect(result.penalty.notes).toEqual('updated');
    expect(result.penalty.penaltyCode).toEqual('NEW');
    expect(result.penalty.penaltyType).toEqual(VERBAL_ABUSE);
    expect(result.penalty.issuedAt).toEqual('2025-01-01');
  });

  it('competition-level penalty operations with nonexistent participants', () => {
    const { tournamentRecord: t1 } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 5 },
    });
    const { tournamentRecord: t2 } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 5 },
    });
    competitionEngine.setState([t1, t2]);

    // add penalty with participant from first tournament
    const { participantId } = t1.participants[0];
    let result = competitionEngine.addPenalty({
      participantIds: [participantId],
      penaltyType: BALL_ABUSE,
      penaltyCode: 'COMP',
    });
    expect(result.success).toEqual(true);

    // modify across tournaments
    result = competitionEngine.modifyPenalty({
      penaltyId: result.penaltyId,
      modifications: { notes: 'competition modified' },
    });
    expect(result.success).toEqual(true);
    expect(result.penalty.notes).toEqual('competition modified');
  });
});
