import { getMatchUpOfficialConflicts } from '@Query/officiating/getMatchUpOfficialConflicts';
import { POLICY_OFFICIATING_CONFLICT_OF_INTEREST } from '@Fixtures/policies/POLICY_OFFICIATING_CONFLICT_OF_INTEREST';
import { describe, expect, it } from 'vitest';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';

// Constants
import { MISSING_TOURNAMENT_RECORD, MISSING_MATCHUP_ID } from '@Constants/errorConditionConstants';
import {
  OFFICIAL_CONFLICT_OF_INTEREST,
  CONFLICT_DECLARED_RELATIONSHIP,
  MISSING_CONFLICT_SOURCE,
  CONFLICT_SHARED_GROUPING,
  CONFLICT_NATIONALITY,
  CONFLICT_BLOCK,
  CONFLICT_WARN,
} from '@Constants/officiatingConstants';
import { POLICY_TYPE_OFFICIATING_CONFLICT } from '@Constants/policyConstants';
import { INDIVIDUAL, PAIR } from '@Constants/participantConstants';
import { COACH, OFFICIAL, OTHER } from '@Constants/participantRoles';
import { DOUBLES } from '@Constants/matchUpTypes';

import { OfficialRecord } from '@Types/officiatingTypes';

function makeOfficialRecord(overrides?: Partial<OfficialRecord>): OfficialRecord {
  return {
    officialRecordId: 'rec-001',
    personId: 'person-official',
    certifications: [],
    evaluations: [],
    assignments: [],
    suspensions: [],
    certificationRequirements: [],
    evaluationPolicies: [],
    createdAt: '2025-01-01',
    updatedAt: '2025-01-01',
    ...overrides,
  };
}

/** A singles draw with a scheduled matchUp, plus an OFFICIAL participant. */
function setup() {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
    nonRandom: 1,
  });
  const tournamentId = tournamentRecord.tournamentId;

  const { participant } = tournamentEngine.addParticipant({
    returnParticipant: true,
    tournamentId,
    participant: {
      participantRole: OFFICIAL,
      participantType: INDIVIDUAL,
      person: { standardFamilyName: 'Umpire', standardGivenName: 'Chair' },
    },
  });

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const matchUp = matchUps.find((m: any) => m.sides?.every((side: any) => side?.participantId));

  return {
    officialParticipantId: participant.participantId,
    matchUpId: matchUp.matchUpId,
    sides: matchUp.sides,
    tournamentRecord,
    tournamentId,
    drawId,
  };
}

describe('getMatchUpOfficialConflicts — side expansion', () => {
  it('expands a DOUBLES matchUp to the four individuals, not the two pairs', () => {
    // A conflict is with a PERSON; the side participant of a doubles pair is not
    // one. Without expansion an official related to one member of a pair would
    // pass unnoticed.
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, eventType: DOUBLES }],
      setState: true,
      nonRandom: 1,
    });
    const drawDefinition = tournamentRecord.events[0].drawDefinitions.find((d: any) => d.drawId === drawId);

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const matchUp = matchUps.find((m: any) => m.sides?.every((side: any) => side?.participantId));

    const result: any = getMatchUpOfficialConflicts({
      policyDefinitions: POLICY_OFFICIATING_CONFLICT_OF_INTEREST,
      officialRecord: makeOfficialRecord(),
      matchUpId: matchUp.matchUpId,
      tournamentRecord,
      drawDefinition,
    });
    expect(result.success).toBe(true);

    const types = result.checkedParticipants.map((p: any) => p.participantType);
    expect(types.filter((t: string) => t === PAIR)).toHaveLength(2);
    expect(types.filter((t: string) => t === INDIVIDUAL)).toHaveLength(4);
  });

  it('flags a declared relationship with ONE MEMBER of a doubles pair', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, eventType: DOUBLES }],
      setState: true,
      nonRandom: 1,
    });
    const drawDefinition = tournamentRecord.events[0].drawDefinitions.find((d: any) => d.drawId === drawId);

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const matchUp = matchUps.find((m: any) => m.sides?.every((side: any) => side?.participantId));
    const pair = tournamentRecord.participants.find((p: any) => p.participantId === matchUp.sides[0].participantId);
    const individualParticipantId = pair.individualParticipantIds[0];

    const result: any = getMatchUpOfficialConflicts({
      policyDefinitions: POLICY_OFFICIATING_CONFLICT_OF_INTEREST,
      officialRecord: makeOfficialRecord({
        conflictDeclarations: [{ declarationId: 'dec-1', participantId: individualParticipantId }],
      }),
      matchUpId: matchUp.matchUpId,
      tournamentRecord,
      drawDefinition,
    });
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].participantId).toEqual(individualParticipantId);
    expect(result.blocked).toBe(true);
  });

  it('returns the findDrawMatchUp error when the matchUp is not in the draw', () => {
    const { tournamentRecord, drawId } = setup();
    const drawDefinition = tournamentRecord.events[0].drawDefinitions.find((d: any) => d.drawId === drawId);

    const result: any = getMatchUpOfficialConflicts({
      policyDefinitions: POLICY_OFFICIATING_CONFLICT_OF_INTEREST,
      officialRecord: makeOfficialRecord(),
      matchUpId: 'no-such-matchUpId',
      tournamentRecord,
      drawDefinition,
    });
    expect(result.error).toBeDefined();
    expect(result.conflicts).toBeUndefined();
  });
});

describe('getMatchUpOfficialConflicts', () => {
  it('returns error without a tournamentRecord, matchUpId or officialRecord', () => {
    let result: any = getMatchUpOfficialConflicts({
      tournamentRecord: undefined as any,
      drawDefinition: {} as any,
      officialRecord: makeOfficialRecord(),
      matchUpId: 'x',
    });
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);

    result = getMatchUpOfficialConflicts({
      tournamentRecord: {} as any,
      drawDefinition: {} as any,
      officialRecord: makeOfficialRecord(),
      matchUpId: '',
    });
    expect(result.error).toEqual(MISSING_MATCHUP_ID);

    // Neither a registry record NOR an official participantId — nothing to evaluate against.
    result = getMatchUpOfficialConflicts({
      tournamentRecord: {} as any,
      drawDefinition: {} as any,
      officialRecord: undefined as any,
      matchUpId: 'x',
    });
    expect(result.error).toEqual(MISSING_CONFLICT_SOURCE);
  });

  it('is inert with no conflict policy and does not resolve participants', () => {
    const { tournamentRecord, drawId, matchUpId } = setup();
    const drawDefinition = tournamentRecord.events[0].drawDefinitions.find((d: any) => d.drawId === drawId);

    const result: any = getMatchUpOfficialConflicts({
      officialRecord: makeOfficialRecord(),
      tournamentRecord,
      drawDefinition,
      matchUpId,
    });
    expect(result.success).toBe(true);
    expect(result.conflicts).toEqual([]);
    expect(result.checkedParticipants).toEqual([]);
  });

  it('checks ONLY the sides of the given matchUp, not the whole field', () => {
    const { tournamentRecord, drawId, matchUpId, sides } = setup();
    const drawDefinition = tournamentRecord.events[0].drawDefinitions.find((d: any) => d.drawId === drawId);

    const result: any = getMatchUpOfficialConflicts({
      officialRecord: makeOfficialRecord(),
      policyDefinitions: POLICY_OFFICIATING_CONFLICT_OF_INTEREST,
      tournamentRecord,
      drawDefinition,
      matchUpId,
    });
    expect(result.success).toBe(true);
    // a drawSize-8 event has 8 competitors; only the 2 in this matchUp are checked
    expect(result.checkedParticipants).toHaveLength(2);
    expect(result.checkedParticipants.map((p: any) => p.participantId).sort()).toEqual(
      sides.map((side: any) => side.participantId).sort(),
    );
  });

  it('flags a declared relationship with a competitor in THIS matchUp', () => {
    const { tournamentRecord, drawId, matchUpId, sides } = setup();
    const drawDefinition = tournamentRecord.events[0].drawDefinitions.find((d: any) => d.drawId === drawId);

    const officialRecord = makeOfficialRecord({
      conflictDeclarations: [{ declarationId: 'dec-1', participantId: sides[0].participantId, relationship: 'COACH' }],
    });

    const result: any = getMatchUpOfficialConflicts({
      policyDefinitions: POLICY_OFFICIATING_CONFLICT_OF_INTEREST,
      tournamentRecord,
      drawDefinition,
      officialRecord,
      matchUpId,
    });
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].conflictType).toEqual(CONFLICT_DECLARED_RELATIONSHIP);
    expect(result.blocked).toBe(true);
  });

  it('does NOT flag a declared relationship with a competitor in a DIFFERENT matchUp', () => {
    // This is the whole point of the per-matchUp scope: the same declaration that
    // blocks one assignment must not block an unrelated one.
    const { tournamentRecord, drawId, matchUpId, sides } = setup();
    const drawDefinition = tournamentRecord.events[0].drawDefinitions.find((d: any) => d.drawId === drawId);

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const otherMatchUp = matchUps.find(
      (m: any) =>
        m.matchUpId !== matchUpId &&
        m.sides?.every((side: any) => side?.participantId) &&
        !m.sides.some((side: any) => sides.some((s: any) => s.participantId === side.participantId)),
    );

    const officialRecord = makeOfficialRecord({
      conflictDeclarations: [{ declarationId: 'dec-1', participantId: sides[0].participantId }],
    });

    const result: any = getMatchUpOfficialConflicts({
      policyDefinitions: POLICY_OFFICIATING_CONFLICT_OF_INTEREST,
      matchUpId: otherMatchUp.matchUpId,
      tournamentRecord,
      drawDefinition,
      officialRecord,
    });
    expect(result.conflicts).toEqual([]);
    expect(result.blocked).toBe(false);
  });
});

describe('SHARED_GROUPING — tournament-scoped relationships, no registry record', () => {
  /**
   * One tournament; GROUP the official together with the given competitors.
   * `participantRole` on the GROUP is what marks it as an authored relationship.
   */
  function setupGrouped(competitorFrom: 'matchUp' | 'elsewhere', participantRole?: string) {
    const ctx = setup();
    const { tournamentId, officialParticipantId, sides, tournamentRecord, drawId } = ctx;

    const memberId =
      competitorFrom === 'matchUp'
        ? sides[0].participantId
        : // someone NOT in this matchUp
          tournamentRecord.participants.find(
            (p: any) =>
              p.participantType === INDIVIDUAL &&
              p.participantId !== officialParticipantId &&
              !sides.some((side: any) => side.participantId === p.participantId),
          )?.participantId;

    const result: any = tournamentEngine.createGroupParticipant({
      individualParticipantIds: [officialParticipantId, memberId],
      groupName: 'Team Alpha',
      participantRole,
      tournamentId,
    });
    expect(result.success).toEqual(true);

    // re-read: the engine holds the authoritative record after the mutation
    const updated = tournamentEngine.getTournament().tournamentRecord;
    const drawDefinition = updated.events[0].drawDefinitions.find((d: any) => d.drawId === drawId);
    return { ...ctx, tournamentRecord: updated, drawDefinition };
  }

  function evaluate(ctx: any, extra: any = {}) {
    return getMatchUpOfficialConflicts({
      policyDefinitions: POLICY_OFFICIATING_CONFLICT_OF_INTEREST,
      officialParticipantId: ctx.officialParticipantId,
      tournamentRecord: ctx.tournamentRecord,
      drawDefinition: ctx.drawDefinition,
      matchUpId: ctx.matchUpId,
      ...extra,
    }) as any;
  }

  it('flags a shared grouping with NO officialRecord at all', () => {
    // The point of the whole design: an empty external registry must not mean "no conflicts".
    const result = evaluate(setupGrouped('matchUp'));
    expect(result.error).toBeUndefined();
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].conflictType).toEqual(CONFLICT_SHARED_GROUPING);
    expect(result.conflicts[0].groupName).toEqual('Team Alpha');
  });

  it('an unspecified grouping warns — OTHER is not in the escalation map', () => {
    // createGroupParticipant defaults participantRole to OTHER, so every GROUP carries a role.
    // OTHER is the incidental marker: it falls through to the rule's base severity.
    const result = evaluate(setupGrouped('matchUp'));
    expect(result.conflicts[0].severity).toEqual(CONFLICT_WARN);
    expect(result.conflicts[0].groupRole).toEqual(OTHER);
    expect(result.blocked).toBe(false);
  });

  it('a COACH grouping blocks — participantRole is what escalates it', () => {
    const result = evaluate(setupGrouped('matchUp', COACH));
    expect(result.conflicts[0].severity).toEqual(CONFLICT_BLOCK);
    expect(result.conflicts[0].groupRole).toEqual(COACH);
    expect(result.blocked).toBe(true);
  });

  it('does not flag a grouping whose members are not in this matchUp', () => {
    const result = evaluate(setupGrouped('elsewhere', COACH));
    expect(result.conflicts).toEqual([]);
    expect(result.blocked).toBe(false);
  });

  it('errors when neither declaration source is supplied', () => {
    const ctx = setupGrouped('matchUp');
    const result = evaluate({ ...ctx, officialParticipantId: undefined });
    expect(result.error).toEqual(MISSING_CONFLICT_SOURCE);
  });
});

describe('getMatchUpOfficialConflicts is exposed on tournamentEngine', () => {
  // It is deliberately absent from `officiatingEngine` (an OfficialRecord aggregate with no tournament
  // state) — but it must be present on the engine that DOES hold a tournament, and must resolve
  // tournamentRecord + drawDefinition from engine state rather than requiring the caller to assemble
  // them. Asserted rather than assumed: the officiating engine's exclusion list points here.
  it('is a function on tournamentEngine', () => {
    expect((tournamentEngine as any).getMatchUpOfficialConflicts).toBeTypeOf('function');
  });

  it('resolves tournamentRecord and drawDefinition from engine state given only drawId', () => {
    const { matchUpId, drawId, sides } = setup();

    const result: any = (tournamentEngine as any).getMatchUpOfficialConflicts({
      policyDefinitions: POLICY_OFFICIATING_CONFLICT_OF_INTEREST,
      officialRecord: makeOfficialRecord({
        conflictDeclarations: [{ declarationId: 'dec-1', participantId: sides[0].participantId }],
      }),
      matchUpId,
      drawId,
    });

    expect(result.error).toBeUndefined();
    expect(result.checkedParticipants).toHaveLength(2);
    expect(result.conflicts).toHaveLength(1);
    expect(result.blocked).toBe(true);
  });
});

describe('addMatchUpOfficial conflict gate', () => {
  it('assigns unchanged when no conflict policy is supplied', () => {
    const { tournamentId, matchUpId, drawId, officialParticipantId } = setup();
    const result: any = tournamentEngine.addMatchUpOfficial({
      participantId: officialParticipantId,
      tournamentId,
      matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(result.conflicts).toBeUndefined();
  });

  it('refuses the assignment on a BLOCK conflict', () => {
    const { tournamentId, matchUpId, drawId, officialParticipantId, sides } = setup();

    const officialRecord = makeOfficialRecord({
      conflictDeclarations: [{ declarationId: 'dec-1', participantId: sides[0].participantId, relationship: 'FAMILY' }],
    });

    const result: any = tournamentEngine.addMatchUpOfficial({
      policyDefinitions: POLICY_OFFICIATING_CONFLICT_OF_INTEREST,
      participantId: officialParticipantId,
      officialRecord,
      tournamentId,
      matchUpId,
      drawId,
    });
    expect(result.error).toEqual(OFFICIAL_CONFLICT_OF_INTEREST);
    expect(result.conflicts).toHaveLength(1);

    // nothing was written
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const matchUp = matchUps.find((m: any) => m.matchUpId === matchUpId);
    expect(matchUp.schedule?.official).toBeUndefined();
  });

  it('assigns and surfaces WARN conflicts', () => {
    const { tournamentId, matchUpId, drawId, officialParticipantId, sides, tournamentRecord } = setup();

    // Give the official a nationality shared with one competitor, under a policy
    // that treats nationality as WARN rather than BLOCK.
    const competitor = tournamentRecord.participants.find((p: any) => p.participantId === sides[0].participantId);
    const nationalityCode = competitor?.person?.nationalityCode ?? 'FRA';
    if (competitor?.person) competitor.person.nationalityCode = nationalityCode;

    const warnNationality = {
      [POLICY_TYPE_OFFICIATING_CONFLICT]: {
        conflictRules: { [CONFLICT_NATIONALITY]: { enabled: true, severity: CONFLICT_WARN } },
      },
    };

    const result: any = tournamentEngine.addMatchUpOfficial({
      participantId: officialParticipantId,
      policyDefinitions: warnNationality,
      officialRecord: makeOfficialRecord(),
      nationalityCode,
      tournamentId,
      matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(result.conflicts.length).toBeGreaterThanOrEqual(1);
    expect(result.conflicts[0].severity).toEqual(CONFLICT_WARN);

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const matchUp = matchUps.find((m: any) => m.matchUpId === matchUpId);
    expect(matchUp.schedule?.official).toEqual(officialParticipantId);
  });

  // CONTRACT CHANGE (SHARED_GROUPING): supplying a policy without an officialRecord no longer fails.
  // The official being assigned supplies their own participantId, which is a sufficient declaration
  // source via tournament GROUP membership — so the gate runs against the tournamentRecord alone.
  it('runs the gate without an officialRecord, using the assigned official as the subject', () => {
    const { tournamentId, matchUpId, drawId, officialParticipantId } = setup();
    const result: any = tournamentEngine.addMatchUpOfficial({
      policyDefinitions: POLICY_OFFICIATING_CONFLICT_OF_INTEREST,
      participantId: officialParticipantId,
      tournamentId,
      matchUpId,
      drawId,
    });
    // No groupings exist for this official, so there is nothing to flag — and crucially no error.
    expect(result.error).toBeUndefined();
    expect(result.success).toEqual(true);

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const matchUp = matchUps.find((m: any) => m.matchUpId === matchUpId);
    expect(matchUp.schedule?.official).toEqual(officialParticipantId);
  });
});
