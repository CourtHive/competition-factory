import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

import { MISSING_MATCHUP_ID, MISSING_PARTICIPANT_ID, PARTICIPANT_NOT_FOUND } from '@Constants/errorConditionConstants';
import { INDIVIDUAL } from '@Constants/participantConstants';
import { SCOREKEEPER } from '@Constants/participantRoles';

function seed() {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }] });
  tournamentEngine.setState(tournamentRecord);
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const { matchUpId, drawId } = matchUps[0];
  const { participants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  });
  return { matchUpId, drawId, participantId: participants[0].participantId };
}

function getScorekeeper(matchUpId: string) {
  const matchUp = tournamentEngine.allTournamentMatchUps().matchUps.find((m: any) => m.matchUpId === matchUpId);
  return matchUp?.schedule?.scorekeeper;
}

describe('assignMatchUpScorekeeper', () => {
  it('validates required args + participant existence', () => {
    const { matchUpId, drawId, participantId } = seed();

    expect(tournamentEngine.assignMatchUpScorekeeper({ drawId, participantId }).error).toEqual(MISSING_MATCHUP_ID);
    expect(tournamentEngine.assignMatchUpScorekeeper({ drawId, matchUpId }).error).toEqual(MISSING_PARTICIPANT_ID);
    expect(
      tournamentEngine.assignMatchUpScorekeeper({ drawId, matchUpId, participantId: 'not-a-participant' }).error,
    ).toEqual(PARTICIPANT_NOT_FOUND);

    expect(tournamentEngine.removeMatchUpScorekeeper({ drawId }).error).toEqual(MISSING_MATCHUP_ID);
  });

  it('nominates a participant as the matchUp scorekeeper and clears it', () => {
    const { matchUpId, drawId, participantId } = seed();

    let result: any = tournamentEngine.assignMatchUpScorekeeper({ drawId, matchUpId, participantId });
    expect(result.success).toEqual(true);
    expect(getScorekeeper(matchUpId)).toEqual(participantId);

    result = tournamentEngine.removeMatchUpScorekeeper({ drawId, matchUpId });
    expect(result.success).toEqual(true);
    expect(getScorekeeper(matchUpId)).toBeUndefined();
  });

  it('a rescheduling clear does not wipe the nominated scorekeeper', () => {
    const { matchUpId, drawId, participantId } = seed();
    tournamentEngine.assignMatchUpScorekeeper({ drawId, matchUpId, participantId });

    // clearMatchUpSchedule's default attributes exclude the scorekeeper (a nomination
    // is not schedule position), mirroring officials.
    const result: any = tournamentEngine.clearMatchUpSchedule({ drawId, matchUpId });
    expect(result.success).toEqual(true);
    expect(getScorekeeper(matchUpId)).toEqual(participantId);
  });

  it('carries SCOREKEEPER as a participantRoleResponsibility and is filterable', () => {
    const { participantId } = seed();

    const result: any = tournamentEngine.modifyParticipant({
      participant: { participantId, participantRoleResponsibilities: [SCOREKEEPER] },
    });
    expect(result.success).toEqual(true);

    const { participants } = tournamentEngine.getParticipants({
      participantFilters: { participantRoleResponsibilities: [SCOREKEEPER] },
    });
    expect(participants.map((p: any) => p.participantId)).toContain(participantId);
  });
});
