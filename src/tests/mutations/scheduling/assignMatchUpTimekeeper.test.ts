import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

import { MISSING_MATCHUP_ID, MISSING_PARTICIPANT_ID, PARTICIPANT_NOT_FOUND } from '@Constants/errorConditionConstants';
import { INDIVIDUAL } from '@Constants/participantConstants';
import { TIMEKEEPER } from '@Constants/participantRoles';

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

function getTimekeeper(matchUpId: string) {
  const matchUp = tournamentEngine.allTournamentMatchUps().matchUps.find((m: any) => m.matchUpId === matchUpId);
  return matchUp?.schedule?.timekeeper;
}

describe('assignMatchUpTimekeeper', () => {
  it('validates required args + participant existence', () => {
    const { matchUpId, drawId, participantId } = seed();

    expect(tournamentEngine.assignMatchUpTimekeeper({ drawId, participantId }).error).toEqual(MISSING_MATCHUP_ID);
    expect(tournamentEngine.assignMatchUpTimekeeper({ drawId, matchUpId }).error).toEqual(MISSING_PARTICIPANT_ID);
    expect(
      tournamentEngine.assignMatchUpTimekeeper({ drawId, matchUpId, participantId: 'not-a-participant' }).error,
    ).toEqual(PARTICIPANT_NOT_FOUND);
    expect(tournamentEngine.removeMatchUpTimekeeper({ drawId }).error).toEqual(MISSING_MATCHUP_ID);
  });

  it('assigns a participant as the matchUp timekeeper and clears it', () => {
    const { matchUpId, drawId, participantId } = seed();

    let result: any = tournamentEngine.assignMatchUpTimekeeper({ drawId, matchUpId, participantId });
    expect(result.success).toEqual(true);
    expect(getTimekeeper(matchUpId)).toEqual(participantId);

    result = tournamentEngine.removeMatchUpTimekeeper({ drawId, matchUpId });
    expect(result.success).toEqual(true);
    expect(getTimekeeper(matchUpId)).toBeUndefined();
  });

  it('a rescheduling clear does not wipe the assigned timekeeper', () => {
    const { matchUpId, drawId, participantId } = seed();
    tournamentEngine.assignMatchUpTimekeeper({ drawId, matchUpId, participantId });

    const result: any = tournamentEngine.clearMatchUpSchedule({ drawId, matchUpId });
    expect(result.success).toEqual(true);
    expect(getTimekeeper(matchUpId)).toEqual(participantId);
  });

  it('carries TIMEKEEPER as a participantRoleResponsibility and is filterable', () => {
    const { participantId } = seed();

    const result: any = tournamentEngine.modifyParticipant({
      participant: { participantId, participantRoleResponsibilities: [TIMEKEEPER] },
    });
    expect(result.success).toEqual(true);

    const { participants } = tournamentEngine.getParticipants({
      participantFilters: { participantRoleResponsibilities: [TIMEKEEPER] },
    });
    expect(participants.map((p: any) => p.participantId)).toContain(participantId);
  });
});
