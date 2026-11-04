import { PARTICIPANT_ROLE_INVALID, PARTICIPANT_ROLE_MISSING } from '@Query/tournaments/getTournamentInconsistencies';
import { participantRoleOf } from '@Query/participant/participantRoleOf';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { COMPETITOR, OFFICIAL } from '@Constants/participantRoles';
import { INDIVIDUAL } from '@Constants/participantConstants';

const OFFICIAL_ID = 'official-1';

// A hand-built CODES record carries no participantRole on its players: the schema requires only
// participantId. Strip the roles from a generated record's INDIVIDUAL participants and add one
// explicit OFFICIAL, then load it into the engine.
function loadRoleLessRecord() {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 8 },
    drawProfiles: [{ drawSize: 8 }],
  });
  const roleLessIds: string[] = [];
  for (const participant of tournamentRecord.participants) {
    if (participant.participantType === INDIVIDUAL) {
      delete participant.participantRole;
      roleLessIds.push(participant.participantId);
    }
  }
  tournamentRecord.participants.push({
    participantId: OFFICIAL_ID,
    participantType: INDIVIDUAL,
    participantRole: OFFICIAL,
    person: { personId: 'official-person', standardFamilyName: 'Umpire', standardGivenName: 'Una' },
  });
  tournamentEngine.setState(tournamentRecord);
  return { roleLessIds, tournamentRecord };
}

const ids = (participants: any[]) => participants.map(({ participantId }) => participantId).sort();

describe('a participant with no participantRole reads as COMPETITOR', () => {
  it('participantRoleOf defaults an absent role and keeps an explicit one', () => {
    expect(participantRoleOf({})).toEqual(COMPETITOR);
    expect(participantRoleOf(undefined)).toEqual(COMPETITOR);
    expect(participantRoleOf({ participantRole: OFFICIAL })).toEqual(OFFICIAL);
  });

  it('getParticipants with participantRoles [COMPETITOR] returns role-less individuals and excludes the OFFICIAL', () => {
    const { roleLessIds } = loadRoleLessRecord();
    expect(roleLessIds.length).toEqual(8);

    let result: any = tournamentEngine.getParticipants({
      participantFilters: { participantRoles: [COMPETITOR], participantTypes: [INDIVIDUAL] },
    });
    expect(ids(result.participants)).toEqual([...roleLessIds].sort());
    expect(ids(result.participants)).not.toContain(OFFICIAL_ID);

    // the pre-filtered path (returnParticipantMap: false) applies the same filter
    result = tournamentEngine.getParticipants({
      participantFilters: { participantRoles: [COMPETITOR], participantTypes: [INDIVIDUAL] },
      returnParticipantMap: false,
    });
    expect(ids(result.participants)).toEqual([...roleLessIds].sort());

    // OR filtering takes the default too
    result = tournamentEngine.getParticipants({
      participantFilters: { participantRoles: [COMPETITOR], enableOrFiltering: true },
    });
    expect(ids(result.participants)).toEqual(expect.arrayContaining(roleLessIds));
    expect(ids(result.participants)).not.toContain(OFFICIAL_ID);
  });

  it('a role filter for OFFICIAL returns only the explicit OFFICIAL', () => {
    loadRoleLessRecord();
    const result: any = tournamentEngine.getParticipants({ participantFilters: { participantRoles: [OFFICIAL] } });
    expect(ids(result.participants)).toEqual([OFFICIAL_ID]);
  });

  it('competitor counts and reports include role-less individuals and exclude the OFFICIAL', () => {
    const { roleLessIds } = loadRoleLessRecord();

    const info: any = tournamentEngine.getTournamentInfo({ withMatchUpStats: true });
    expect(info.tournamentInfo.individualParticipantCount).toEqual(roleLessIds.length);

    const report: any = tournamentEngine.getEntryStatusReports();
    expect(report.tournamentEntryReport.individualParticipantsCount).toEqual(roleLessIds.length);
  });

  it('createTeamsFromParticipantAttributes groups role-less individuals', () => {
    const { roleLessIds } = loadRoleLessRecord();
    const result: any = tournamentEngine.createTeamsFromParticipantAttributes({
      personAttribute: 'standardFamilyName',
      addParticipants: false,
    });
    const grouped = result.newParticipants.flatMap((team) => team.individualParticipantIds);
    expect(grouped.sort()).toEqual([...roleLessIds].sort());
  });

  it('the record is not rewritten', () => {
    loadRoleLessRecord();
    tournamentEngine.getParticipants({ participantFilters: { participantRoles: [COMPETITOR] } });
    const { tournamentRecord }: any = tournamentEngine.getTournament();
    const roleLess = tournamentRecord.participants.filter(
      (p) => p.participantType === INDIVIDUAL && !p.participantRole,
    );
    expect(roleLess.length).toEqual(8);
  });
});

describe('PARTICIPANT_ROLE_MISSING', () => {
  it('is an info entry listing the role-less participants and leaves the record valid', () => {
    const { roleLessIds } = loadRoleLessRecord();
    const result: any = tournamentEngine.getTournamentInconsistencies();
    expect(result.valid).toEqual(true);
    const entries = result.inconsistencies.filter((i) => i.issueType === PARTICIPANT_ROLE_MISSING);
    expect(entries.length).toEqual(1);
    const [entry] = entries;
    expect(entry).toEqual(
      expect.objectContaining({
        issueType: PARTICIPANT_ROLE_MISSING,
        severity: 'info',
        scope: 'TOURNAMENT',
        participantsCount: roleLessIds.length,
        assumedRole: COMPETITOR,
      }),
    );
    expect([...entry.participantIds].sort()).toEqual([...roleLessIds].sort());
    expect(entry.participantIds).not.toContain(OFFICIAL_ID);
    expect(entry.fingerprint).toBeDefined();
  });

  it('is absent when every participant carries a role', () => {
    mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }], setState: true });
    const result: any = tournamentEngine.getTournamentInconsistencies();
    expect(result.inconsistencies.filter((i) => i.issueType === PARTICIPANT_ROLE_MISSING)).toEqual([]);
  });
});

describe('PARTICIPANT_ROLE_INVALID', () => {
  // A real CODES export sets participantRole "PLAYER" on every INDIVIDUAL and PAIR. That is not a
  // ParticipantRoleEnum value, and an unknown value is NOT defaulted: a misspelt staff role would
  // otherwise be counted as a player.
  function loadInvalidRoleRecord() {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 4 },
    });
    const playerIds: string[] = [];
    for (const participant of tournamentRecord.participants) {
      participant.participantRole = 'PLAYER';
      playerIds.push(participant.participantId);
    }
    tournamentRecord.participants.push({
      participantId: 'misspelt-official',
      participantType: INDIVIDUAL,
      participantRole: 'OFFICAL',
      person: { personId: 'misspelt-person', standardFamilyName: 'Referee', standardGivenName: 'Rae' },
    });
    tournamentEngine.setState(tournamentRecord);
    return { playerIds };
  }

  it('a PLAYER-role participant is not read as COMPETITOR', () => {
    const { playerIds } = loadInvalidRoleRecord();
    expect(participantRoleOf({ participantRole: 'PLAYER' as any })).toEqual('PLAYER');
    const result: any = tournamentEngine.getParticipants({ participantFilters: { participantRoles: [COMPETITOR] } });
    expect(result.participants).toEqual([]);
    expect(playerIds.length).toBeGreaterThan(0);
  });

  it('is a warning naming each offending value, its count, ids and the fix, and leaves the record valid', () => {
    const { playerIds } = loadInvalidRoleRecord();
    const result: any = tournamentEngine.getTournamentInconsistencies();
    expect(result.valid).toEqual(true);
    expect(result.inconsistencies.filter((i) => i.issueType === PARTICIPANT_ROLE_MISSING)).toEqual([]);

    const entries = result.inconsistencies.filter((i) => i.issueType === PARTICIPANT_ROLE_INVALID);
    expect(entries.length).toEqual(1);
    const [entry] = entries;
    expect(entry.severity).toEqual('warning');
    expect(entry.scope).toEqual('TOURNAMENT');
    expect(entry.participantsCount).toEqual(playerIds.length + 1);
    expect(entry.message).toContain('PLAYER is not a participant role');
    expect(entry.message).toContain('use COMPETITOR');

    const player = entry.invalidRoles.find((row) => row.participantRole === 'PLAYER');
    expect(player).toEqual({
      participantRole: 'PLAYER',
      participantsCount: playerIds.length,
      participantIds: playerIds,
      suggestedRole: COMPETITOR,
    });
    // a misspelling gets no guessed fix
    const misspelt = entry.invalidRoles.find((row) => row.participantRole === 'OFFICAL');
    expect(misspelt).toEqual({
      participantRole: 'OFFICAL',
      participantsCount: 1,
      participantIds: ['misspelt-official'],
    });
  });
});
