import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import { UNRECOGNIZED_DRAW_TYPE } from '@Constants/errorConditionConstants';

/**
 * modifyTournamentRecord is all or nothing by default (assessment M10; CA 2026-10-18: "ALL OR NOTHING as
 * default with boolean for keep partial").
 *
 * Before: a valid draw followed by an unrecognized draw type returned ERR_UNRECOGNIZED_DRAW_TYPE having
 * already written 4 participants and an event, and the error said nothing about them.
 */

function baseRecord() {
  return mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8 }], nonRandom: 7 }).tournamentRecord;
}

// the second profile is refused after the first has been written
const VALID_THEN_REFUSED = [{ drawSize: 4 }, { drawSize: 4, drawType: 'NOT_A_DRAW_TYPE' }];

describe('all or nothing (the default)', () => {
  it('a refusal leaves the record exactly as it was passed, in the same objects', () => {
    const tournamentRecord = baseRecord();
    const before = JSON.stringify(tournamentRecord);
    const { participants, events } = tournamentRecord;

    const result: any = mocksEngine.modifyTournamentRecord({ tournamentRecord, drawProfiles: VALID_THEN_REFUSED });
    expect(result.error).toEqual(UNRECOGNIZED_DRAW_TYPE);
    expect(result.retained).toBeUndefined();

    expect(JSON.stringify(tournamentRecord)).toEqual(before);
    expect(tournamentRecord.participants).toBe(participants);
    expect(tournamentRecord.events).toBe(events);
  });

  it('a refusal consumes nothing from the caller’s uuids pool; a success does', () => {
    const tournamentRecord = baseRecord();
    const uuids = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'];

    mocksEngine.modifyTournamentRecord({ tournamentRecord, drawProfiles: VALID_THEN_REFUSED, uuids });
    expect(uuids).toEqual(['u1', 'u2', 'u3', 'u4', 'u5', 'u6']);

    const result: any = mocksEngine.modifyTournamentRecord({
      tournamentRecord,
      drawProfiles: [{ drawSize: 4 }],
      uuids,
    });
    expect(result.success).toEqual(true);
    expect(uuids.length).toBeLessThan(6);
  });

  it('a corrected retry builds on the record as it was, not on a half-built one', () => {
    const tournamentRecord = baseRecord();
    const participantsBefore = tournamentRecord.participants.length;

    mocksEngine.modifyTournamentRecord({ tournamentRecord, drawProfiles: VALID_THEN_REFUSED });
    const retry: any = mocksEngine.modifyTournamentRecord({ tournamentRecord, drawProfiles: [{ drawSize: 4 }] });

    expect(retry.success).toEqual(true);
    expect(tournamentRecord.events.length).toEqual(2);
    expect(tournamentRecord.participants.length - participantsBefore).toEqual(4);
  });

  it('control: a success writes as before', () => {
    const tournamentRecord = baseRecord();
    const result: any = mocksEngine.modifyTournamentRecord({ tournamentRecord, drawProfiles: [{ drawSize: 4 }] });
    expect(result.success).toEqual(true);
    expect(result.drawIds.length).toEqual(1);
    expect(tournamentRecord.events.length).toEqual(2);
  });
});

describe('keepPartial', () => {
  it('keeps what was written before the refusal and reports it as retained', () => {
    const tournamentRecord = baseRecord();
    const participantsBefore = tournamentRecord.participants.length;

    const result: any = mocksEngine.modifyTournamentRecord({
      drawProfiles: VALID_THEN_REFUSED,
      keepPartial: true,
      tournamentRecord,
    });
    expect(result.error).toEqual(UNRECOGNIZED_DRAW_TYPE);

    const addedParticipants = tournamentRecord.participants.length - participantsBefore;
    expect(addedParticipants).toBeGreaterThan(0);
    expect(result.retained.participantIds.length).toEqual(addedParticipants);
    expect(result.retained.eventIds.length).toEqual(1);
    expect(result.retained.drawIds.length).toEqual(1);
    expect(result.retained.venueIds).toEqual([]);
    expect(tournamentRecord.events.map(({ eventId }: any) => eventId)).toContain(result.retained.eventIds[0]);
  });
});
