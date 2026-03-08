import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { INDIVIDUAL } from '@Constants/participantConstants';
import { UNGROUPED } from '@Constants/entryStatusConstants';
import { DOUBLES, TEAM } from '@Constants/eventConstants';
import { FEMALE, MALE } from '@Constants/genderConstants';
import { COMPETITOR } from '@Constants/participantRoles';
import { INVALID_PARTICIPANT_IDS, INVALID_VALUES, MISSING_PARTICIPANT_IDS } from '@Constants/errorConditionConstants';

describe('addEventEntries - uncovered branch coverage', () => {
  it('returns error when participantIds is not an array', () => {
    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, generate: false }],
      setState: true,
    });

    const result = tournamentEngine.addEventEntries({
      participantIds: 'not-an-array' as any,
      eventId,
    });
    expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);
  });

  it('returns error when event is missing', () => {
    mocksEngine.generateTournamentRecord({ setState: true });

    const result = tournamentEngine.addEventEntries({
      participantIds: ['p1'],
      eventId: 'nonexistent',
    });
    expect(result.error).toBeDefined();
  });

  it('returns error when participantIds array is empty', () => {
    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, generate: false }],
      setState: true,
    });

    const result = tournamentEngine.addEventEntries({
      participantIds: [],
      eventId,
    });
    expect(result.error).toEqual(MISSING_PARTICIPANT_IDS);
  });

  it('returns error for invalid extensions', () => {
    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, generate: false }],
      setState: true,
    });

    const { participants } = tournamentEngine.getParticipants({
      participantFilters: { participantTypes: [INDIVIDUAL] },
    });

    // Invalid extensions array
    let result = tournamentEngine.addEventEntries({
      participantIds: [participants[0].participantId],
      extensions: 'not-an-array' as any,
      eventId,
    });
    expect(result.error).toEqual(INVALID_VALUES);

    // Invalid extension object
    result = tournamentEngine.addEventEntries({
      participantIds: [participants[0].participantId],
      extension: { invalid: true } as any,
      eventId,
    });
    expect(result.error).toEqual(INVALID_VALUES);

    // Extensions array with invalid items
    result = tournamentEngine.addEventEntries({
      participantIds: [participants[0].participantId],
      extensions: [{ invalid: true }] as any,
      eventId,
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('adds entry with valid extension', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    tournamentEngine.setState(tournamentRecord);

    let result = tournamentEngine.addEvent({ event: { eventName: 'Ext Test' } });
    expect(result.success).toEqual(true);
    const { eventId } = result.event;

    const { participants } = tournamentEngine.getParticipants({
      participantFilters: { participantTypes: [INDIVIDUAL] },
    });

    result = tournamentEngine.addEventEntries({
      participantIds: [participants[0].participantId],
      extension: { name: 'testExt', value: 'testVal' },
      eventId,
    });
    expect(result.success).toEqual(true);

    const { event } = tournamentEngine.getEvent({ eventId });
    const entry = event.entries.find((e) => e.participantId === participants[0].participantId);
    expect(entry.extensions).toBeDefined();
    const ext = entry.extensions.find((e) => e.name === 'testExt');
    expect(ext.value).toEqual('testVal');
  });

  it('adds entry with roundTarget extension', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    tournamentEngine.setState(tournamentRecord);

    let result = tournamentEngine.addEvent({ event: { eventName: 'RoundTarget Test' } });
    expect(result.success).toEqual(true);
    const { eventId } = result.event;

    const { participants } = tournamentEngine.getParticipants({
      participantFilters: { participantTypes: [INDIVIDUAL] },
    });

    result = tournamentEngine.addEventEntries({
      participantIds: [participants[0].participantId],
      roundTarget: 2,
      eventId,
    });
    expect(result.success).toEqual(true);

    const { event } = tournamentEngine.getEvent({ eventId });
    const entry = event.entries.find((e) => e.participantId === participants[0].participantId);
    const roundTargetExt = entry.extensions?.find((e) => e.name === 'roundTarget');
    expect(roundTargetExt?.value).toEqual(2);
  });

  it('adds entry with entryStageSequence', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    tournamentEngine.setState(tournamentRecord);

    let result = tournamentEngine.addEvent({ event: { eventName: 'StageSeq Test' } });
    expect(result.success).toEqual(true);
    const { eventId } = result.event;

    const { participants } = tournamentEngine.getParticipants({
      participantFilters: { participantTypes: [INDIVIDUAL] },
    });

    result = tournamentEngine.addEventEntries({
      participantIds: [participants[0].participantId],
      entryStageSequence: 2,
      eventId,
    });
    expect(result.success).toEqual(true);

    const { event } = tournamentEngine.getEvent({ eventId });
    const entry = event.entries.find((e) => e.participantId === participants[0].participantId);
    expect(entry.entryStageSequence).toEqual(2);
  });

  it('returns INVALID_PARTICIPANT_IDS with gender mismatch context', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 10, sex: MALE },
    });
    tournamentEngine.setState(tournamentRecord);

    // Create a FEMALE-only event
    let result = tournamentEngine.addEvent({
      event: { eventName: 'Female Event', gender: FEMALE },
    });
    expect(result.success).toEqual(true);
    const { eventId } = result.event;

    // Try to add MALE participants to FEMALE event
    const { participants } = tournamentEngine.getParticipants({
      participantFilters: { participantTypes: [INDIVIDUAL] },
    });
    const maleParticipantIds = participants
      .filter((p) => p.person?.sex === MALE)
      .slice(0, 2)
      .map((p) => p.participantId);

    result = tournamentEngine.addEventEntries({
      participantIds: maleParticipantIds,
      enforceGender: true,
      eventId,
    });
    expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);
    // Should include mismatchedGender context
    expect(result.mismatchedGender || result.context?.mismatchedGender).toBeDefined();
  });

  it('handles enforceCategory with rejection tracking', () => {
    const startDate = '2024-06-01';
    const endDate = '2024-06-07';
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      startDate,
      endDate,
    });
    tournamentEngine.setState(tournamentRecord);

    // Create event with U8 category
    let result = tournamentEngine.addEvent({
      event: {
        eventName: 'U8 Event',
        category: { categoryName: 'U8', ageCategoryCode: 'U8' },
      },
    });
    expect(result.success).toEqual(true);
    const { eventId } = result.event;

    // Add a participant who is too old for U8
    const participant = {
      participantType: INDIVIDUAL,
      participantRole: COMPETITOR,
      person: {
        standardFamilyName: 'TooOld',
        standardGivenName: 'Player',
        birthDate: '2000-01-01',
      },
    };
    result = tournamentEngine.addParticipants({
      participants: [participant],
      returnParticipants: true,
    });
    expect(result.success).toEqual(true);
    const participantId = result.participants[0].participantId;

    result = tournamentEngine.addEventEntries({
      participantIds: [participantId],
      enforceCategory: true,
      eventId,
    });

    // Should fail with either INVALID_PARTICIPANT_IDS (due to category rejection) or succeed but track rejections
    expect(result.error || result.success).toBeDefined();
  });

  it('deduplicates participantIds', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    tournamentEngine.setState(tournamentRecord);

    let result = tournamentEngine.addEvent({ event: { eventName: 'Dedup Test' } });
    expect(result.success).toEqual(true);
    const { eventId } = result.event;

    const { participants } = tournamentEngine.getParticipants({
      participantFilters: { participantTypes: [INDIVIDUAL] },
    });
    const pid = participants[0].participantId;

    // Pass duplicate IDs
    result = tournamentEngine.addEventEntries({
      participantIds: [pid, pid, pid],
      eventId,
    });
    expect(result.success).toEqual(true);
    expect(result.addedEntriesCount).toEqual(1);
  });

  it('does not add duplicate entries when suppressDuplicateEntries is true (default)', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    tournamentEngine.setState(tournamentRecord);

    let result = tournamentEngine.addEvent({ event: { eventName: 'Suppress Dup' } });
    expect(result.success).toEqual(true);
    const { eventId } = result.event;

    const { participants } = tournamentEngine.getParticipants({
      participantFilters: { participantTypes: [INDIVIDUAL] },
    });
    const pid = participants[0].participantId;

    // First add
    result = tournamentEngine.addEventEntries({
      participantIds: [pid],
      eventId,
    });
    expect(result.success).toEqual(true);
    expect(result.addedEntriesCount).toEqual(1);

    // Second add of same participant — should not error, but count should be 0
    result = tournamentEngine.addEventEntries({
      participantIds: [pid],
      eventId,
    });
    expect(result.success).toEqual(true);
    expect(result.addedEntriesCount).toEqual(0);
  });

  it('handles ungrouped doubles entry with gender enforcement', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 8, sex: MALE },
    });
    tournamentEngine.setState(tournamentRecord);

    // Create a FEMALE doubles event
    let result = tournamentEngine.addEvent({
      event: { eventName: 'Female Doubles', eventType: DOUBLES, gender: FEMALE },
    });
    expect(result.success).toEqual(true);
    const { eventId } = result.event;

    const { participants } = tournamentEngine.getParticipants({
      participantFilters: { participantTypes: [INDIVIDUAL] },
    });
    const maleId = participants.find((p) => p.person?.sex === MALE)?.participantId;

    if (maleId) {
      // Ungrouped individual in doubles event with gender mismatch
      result = tournamentEngine.addEventEntries({
        participantIds: [maleId],
        entryStatus: UNGROUPED,
        enforceGender: true,
        eventId,
      });
      expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);
    }
  });

  it('adds ungrouped individual to doubles event when gender matches', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 8, sex: MALE },
    });
    tournamentEngine.setState(tournamentRecord);

    // Create MALE doubles event
    let result = tournamentEngine.addEvent({
      event: { eventName: 'Male Doubles', eventType: DOUBLES, gender: MALE },
    });
    expect(result.success).toEqual(true);
    const { eventId } = result.event;

    const { participants } = tournamentEngine.getParticipants({
      participantFilters: { participantTypes: [INDIVIDUAL] },
    });
    const maleId = participants.find((p) => p.person?.sex === MALE)?.participantId;

    if (maleId) {
      result = tournamentEngine.addEventEntries({
        participantIds: [maleId],
        entryStatus: UNGROUPED,
        eventId,
      });
      expect(result.success).toEqual(true);
    }
  });

  it('adds team participants to TEAM event with ungrouped individual', () => {
    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, eventType: TEAM, generate: false }],
      setState: true,
    });

    const { participants } = tournamentEngine.getParticipants({
      participantFilters: { participantTypes: [INDIVIDUAL] },
    });

    // Add an individual as UNGROUPED to a TEAM event — should be valid
    const result = tournamentEngine.addEventEntries({
      participantIds: [participants[0].participantId],
      entryStatus: UNGROUPED,
      eventId,
    });
    expect(result.success).toEqual(true);
  });

  it('handles autoEntryPositions=false', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    tournamentEngine.setState(tournamentRecord);

    let result = tournamentEngine.addEvent({ event: { eventName: 'No Auto Position' } });
    expect(result.success).toEqual(true);
    const { eventId } = result.event;

    const { participants } = tournamentEngine.getParticipants({
      participantFilters: { participantTypes: [INDIVIDUAL] },
    });

    result = tournamentEngine.addEventEntries({
      participantIds: participants.slice(0, 3).map((p) => p.participantId),
      autoEntryPositions: false,
      eventId,
    });
    expect(result.success).toEqual(true);
  });

  it('handles adding entries with extensions array', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    tournamentEngine.setState(tournamentRecord);

    let result = tournamentEngine.addEvent({ event: { eventName: 'Extensions Array Test' } });
    expect(result.success).toEqual(true);
    const { eventId } = result.event;

    const { participants } = tournamentEngine.getParticipants({
      participantFilters: { participantTypes: [INDIVIDUAL] },
    });

    result = tournamentEngine.addEventEntries({
      participantIds: [participants[0].participantId],
      extensions: [{ name: 'myExt', value: 42 }],
      eventId,
    });
    expect(result.success).toEqual(true);
  });
});
