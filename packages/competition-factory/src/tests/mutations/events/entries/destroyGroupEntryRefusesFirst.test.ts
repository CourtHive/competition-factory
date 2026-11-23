import { addEventEntriesRefusal } from '@Mutate/entries/addEventEntries';
import { destroyGroupEntry } from '@Mutate/entries/destroyGroupEntry';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants and types
import { DIRECT_ACCEPTANCE, UNGROUPED } from '@Constants/entryStatusConstants';
import { INVALID_PARTICIPANT_IDS } from '@Constants/errorConditionConstants';
import { INDIVIDUAL, PAIR, TEAM } from '@Constants/participantConstants';
import { EntryStatusUnion, Tournament } from '@Types/tournamentTypes';
import { COMPETITOR, OFFICIAL } from '@Constants/participantRoles';
import { DOUBLES, TEAM_EVENT } from '@Constants/eventConstants';
import { MAIN } from '@Constants/drawDefinitionConstants';
import { FEMALE, MALE } from '@Constants/genderConstants';

/**
 * A mutation that refuses must leave the record as it found it, on a DIRECT call, with no rollback.
 * `destroyGroupEntry` removes the group entry and then re-enters its individuals; a re-entry that
 * `addEventEntries` refuses must be refused BEFORE the group entry is removed.
 */

const eventId = 'doublesId';

function enteredPairs({ gender, sex }: { gender?: string; sex: string }) {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantType: PAIR, participantsCount: 4, sex },
    eventProfiles: [{ eventType: DOUBLES, eventId, gender }],
  });
  tournamentEngine.setState(tournamentRecord);

  const pairIds = tournamentEngine
    .getParticipants({ participantFilters: { participantTypes: [PAIR] } })
    .participants.map((p) => p.participantId);
  // a PAIR's entry is not gender-checked, so a MALE pair can stand in a FEMALE doubles event
  const result = tournamentEngine.addEventEntries({ participantIds: pairIds, eventId });
  expect(result.success).toEqual(true);

  return pairIds;
}

it('refuses to destroy a pair whose individuals the event would refuse, leaving the record unchanged', () => {
  const [pairId] = enteredPairs({ gender: FEMALE, sex: MALE });
  const before = structuredClone(tournamentEngine.getTournament().tournamentRecord);

  const result = tournamentEngine.destroyPairEntry({ participantId: pairId, eventId });
  expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);

  // no rollback was asked for: the refusal itself left the record as it was
  expect(tournamentEngine.getTournament().tournamentRecord).toEqual(before);
  const { event } = tournamentEngine.getEvent({ eventId });
  expect(event.entries.map((e) => e.participantId)).toContain(pairId);
});

it('destroys a pair whose individuals qualify (control)', () => {
  const [pairId] = enteredPairs({ gender: MALE, sex: MALE });
  const individualIds = tournamentEngine.findParticipant({ participantId: pairId }).participant
    .individualParticipantIds;

  const result = tournamentEngine.destroyPairEntry({ participantId: pairId, eventId });
  expect(result.success).toEqual(true);

  const { event } = tournamentEngine.getEvent({ eventId });
  const entered = event.entries.map((e) => e.participantId);
  expect(entered).not.toContain(pairId);
  for (const individualId of individualIds) {
    expect(event.entries.find((e) => e.participantId === individualId)?.entryStatus).toEqual(UNGROUPED);
  }
});

function teamRecord(memberRole: string): Tournament {
  const individual = (participantId: string, participantRole: string) => ({
    participantType: INDIVIDUAL,
    participantRole,
    participantId,
    person: { personId: `${participantId}-person`, standardFamilyName: participantId, standardGivenName: 'A' },
  });
  return {
    tournamentId: 'tournamentId',
    tournamentName: 'Team Refusal',
    startDate: '2026-01-01',
    endDate: '2026-01-02',
    participants: [
      individual('member1', COMPETITOR),
      individual('member2', memberRole),
      {
        participantId: 'teamId',
        participantType: TEAM,
        participantRole: COMPETITOR,
        participantName: 'Team',
        individualParticipantIds: ['member1', 'member2'],
      },
    ],
    events: [
      {
        eventId: 'teamEventId',
        eventType: TEAM_EVENT,
        eventName: 'Team Event',
        entries: [{ participantId: 'teamId', entryStatus: DIRECT_ACCEPTANCE, entryStage: MAIN }],
      },
    ],
  } as Tournament;
}

it('refuses to destroy a team whose individuals the event would refuse, leaving the record unchanged', () => {
  // an OFFICIAL is not a competitor: `addEventEntries` refuses to enter one
  const tournamentRecord = teamRecord(OFFICIAL);
  const event = tournamentRecord.events![0];
  const before = structuredClone(tournamentRecord);

  const result: any = destroyGroupEntry({
    drawDefinition: undefined as any,
    removeGroupParticipant: true,
    participantId: 'teamId',
    tournamentRecord,
    event,
  });
  expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);
  expect(tournamentRecord).toEqual(before);
});

it('destroys a team whose individuals qualify (control)', () => {
  const tournamentRecord = teamRecord(COMPETITOR);
  const event = tournamentRecord.events![0];

  const result = destroyGroupEntry({
    drawDefinition: undefined as any,
    removeGroupParticipant: true,
    participantId: 'teamId',
    tournamentRecord,
    event,
  });
  expect(result.success).toEqual(true);
  expect(result.participantRemoved).toEqual(true);
  expect(event.entries?.map((e) => [e.participantId, e.entryStatus])).toEqual([
    ['member1', UNGROUPED],
    ['member2', UNGROUPED],
  ]);
});

it('addEventEntriesRefusal answers as addEventEntries would, and writes nothing', () => {
  const tournamentRecord = teamRecord(OFFICIAL);
  const event = tournamentRecord.events![0];
  const before = structuredClone(tournamentRecord);
  const entryStatus: EntryStatusUnion = UNGROUPED;
  const params = { participantIds: ['member1', 'member2'], entryStatus, tournamentRecord, event };

  expect(addEventEntriesRefusal(params)?.error).toEqual(INVALID_PARTICIPANT_IDS);
  expect(addEventEntriesRefusal({ ...params, participantIds: ['member1'] })).toBeUndefined();
  expect(tournamentRecord).toEqual(before);
});
