/**
 * Coverage tests for modifyTournamentRecord.ts
 *
 * Targets uncovered branches and statements including:
 *  - completeAllMatchUps / randomWinningSide propagation through eventProfiles
 *  - venueProfiles generation during modify
 *  - schedulingProfile with autoSchedule
 *  - eventId / eventName / eventIndex targeting of existing events
 *  - participantsProfile.idPrefix increment when participants already exist
 *  - Various fallback branches (eventType not SINGLES/DOUBLES, empty participants, etc.)
 */

import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { DOUBLES, SINGLES } from '@Constants/eventConstants';
import { MALE } from '@Constants/genderConstants';

describe('modifyTournamentRecord coverage - completeAllMatchUps and randomWinningSide', () => {
  it('passes completeAllMatchUps through eventProfiles on existing events', () => {
    const eventProfiles: any[] = [{ eventName: 'Singles A', eventType: SINGLES, gender: MALE }];
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 0 },
      eventProfiles,
    });

    const modifyProfiles: any[] = [
      {
        eventName: 'Singles A',
        drawProfiles: [{ drawSize: 4 }],
        completeAllMatchUps: true,
        randomWinningSide: true,
      },
    ];
    let result: any = mocksEngine.modifyTournamentRecord({
      eventProfiles: modifyProfiles,
      tournamentRecord,
    });
    expect(result.success).toEqual(true);
    expect(result.drawIds.length).toEqual(1);

    tournamentEngine.setState(tournamentRecord);
    const { completedMatchUps } = tournamentEngine.tournamentMatchUps();
    expect(completedMatchUps.length).toBeGreaterThan(0);
  });

  it('passes completeAllMatchUps through top-level params for new events', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 0 },
    });

    const eventProfiles: any[] = [
      {
        eventName: 'New Singles',
        eventType: SINGLES,
        gender: MALE,
        drawProfiles: [{ drawSize: 4 }],
      },
    ];
    let result: any = mocksEngine.modifyTournamentRecord({
      completeAllMatchUps: true,
      randomWinningSide: true,
      eventProfiles,
      tournamentRecord,
    });
    expect(result.success).toEqual(true);
    expect(result.drawIds.length).toEqual(1);

    tournamentEngine.setState(tournamentRecord);
    const { completedMatchUps } = tournamentEngine.tournamentMatchUps();
    expect(completedMatchUps.length).toBeGreaterThan(0);
  });
});

describe('modifyTournamentRecord coverage - venueProfiles', () => {
  it('adds venues via venueProfiles during modify', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 0 },
    });

    expect(tournamentRecord.venues?.length ?? 0).toEqual(0);

    let result: any = mocksEngine.modifyTournamentRecord({
      venueProfiles: [{ venueId: 'v1', courtsCount: 4 }],
      tournamentRecord,
    });
    expect(result.success).toEqual(true);
    expect(result.venueIds).toBeDefined();
    expect(tournamentRecord.venues.length).toEqual(1);
    expect(tournamentRecord.venues[0].courts.length).toEqual(4);
  });
});

describe('modifyTournamentRecord coverage - schedulingProfile with autoSchedule', () => {
  it('applies schedulingProfile and autoSchedules matchUps', () => {
    const startDate = '2023-06-01';
    const venueId = 'venue1';
    const venueProfiles = [{ venueId, courtsCount: 10 }];
    const drawProfiles = [{ drawId: 'sd1', drawSize: 4 }];

    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      venueProfiles,
      drawProfiles,
      startDate,
    });

    const { rounds } = tournamentEngine.setState(tournamentRecord).getRounds();
    const schedulingProfile = [{ scheduleDate: startDate, venues: [{ venueId, rounds }] }];

    // Now modify with new draws + scheduling
    const newDrawProfiles = [{ drawId: 'sd2', drawSize: 4 }];
    let result: any = mocksEngine.modifyTournamentRecord({
      schedulingProfile,
      autoSchedule: true,
      drawProfiles: newDrawProfiles,
      tournamentRecord,
    });
    expect(result.success).toEqual(true);
    expect(result.schedulerResult).toBeDefined();
  });
});

describe('modifyTournamentRecord coverage - eventId targeting', () => {
  it('targets an existing event by eventId and adds draws with DOUBLES type', () => {
    const eventProfiles: any[] = [{ eventName: 'Doubles A', eventType: DOUBLES, gender: MALE }];
    const { tournamentRecord, eventIds } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 0 },
      eventProfiles,
    });

    const modifyProfiles: any[] = [
      {
        eventId: eventIds[0],
        drawProfiles: [{ drawSize: 4, drawType: ROUND_ROBIN }],
      },
    ];
    let result: any = mocksEngine.modifyTournamentRecord({
      eventProfiles: modifyProfiles,
      tournamentRecord,
    });
    expect(result.success).toEqual(true);
    expect(result.drawIds.length).toEqual(1);
  });
});

describe('modifyTournamentRecord coverage - participantsProfile.idPrefix with existing participants', () => {
  it('appends participant count to idPrefix when participants already exist', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 10 },
    });

    const initialCount = tournamentRecord.participants.length;
    expect(initialCount).toBeGreaterThan(0);

    let result: any = mocksEngine.modifyTournamentRecord({
      participantsProfile: { idPrefix: 'extra', participantsCount: 5 },
      tournamentRecord,
    });
    expect(result.success).toEqual(true);
    expect(result.totalParticipantsCount).toBeGreaterThan(initialCount);
  });
});

describe('modifyTournamentRecord coverage - drawProfiles at top level', () => {
  it('adds draws via top-level drawProfiles with completeAllMatchUps', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 0 },
    });

    const drawProfiles = [{ drawId: 'complete1', drawSize: 4 }];
    let result: any = mocksEngine.modifyTournamentRecord({
      completeAllMatchUps: true,
      randomWinningSide: true,
      drawProfiles,
      tournamentRecord,
    });
    expect(result.success).toEqual(true);
    expect(result.drawIds.length).toEqual(1);

    tournamentEngine.setState(tournamentRecord);
    const { completedMatchUps } = tournamentEngine.tournamentMatchUps();
    expect(completedMatchUps.length).toBeGreaterThan(0);
  });
});

describe('modifyTournamentRecord coverage - eventIndex targeting and gender propagation', () => {
  it('finds existing event by eventIndex and propagates gender', () => {
    const eventProfiles: any[] = [
      { eventName: 'First Event', eventType: SINGLES, gender: MALE },
      { eventName: 'Second Event', eventType: SINGLES },
    ];
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 0 },
      eventProfiles,
    });

    // Modify first event by index, second by name
    const modifyProfiles: any[] = [
      { eventIndex: 0, drawProfiles: [{ drawSize: 4 }] },
      { eventName: 'Second Event', drawProfiles: [{ drawSize: 8 }] },
    ];
    let result: any = mocksEngine.modifyTournamentRecord({
      eventProfiles: modifyProfiles,
      tournamentRecord,
    });
    expect(result.success).toEqual(true);
    expect(result.drawIds.length).toEqual(2);
  });
});

describe('modifyTournamentRecord coverage - mixed existing and new events', () => {
  it('handles a mix of existing events (by eventId) and new events in one call', () => {
    const eventProfiles: any[] = [{ eventName: 'Existing Singles', eventType: SINGLES, gender: MALE }];
    const { tournamentRecord, eventIds } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 0 },
      eventProfiles,
    });

    const modifyProfiles: any[] = [
      { eventId: eventIds[0], drawProfiles: [{ drawSize: 4 }] },
      { eventName: 'Brand New Event', eventType: SINGLES, drawProfiles: [{ drawSize: 8 }] },
    ];
    let result: any = mocksEngine.modifyTournamentRecord({
      eventProfiles: modifyProfiles,
      tournamentRecord,
    });
    expect(result.success).toEqual(true);
    expect(result.drawIds.length).toEqual(2);
    expect(result.eventIds.length).toEqual(1); // only new events produce eventIds
  });
});

describe('modifyTournamentRecord coverage - publish on existing event', () => {
  it('publishes an existing event via eventProfile.publish with drawProfiles', () => {
    const eventProfiles: any[] = [{ eventName: 'Pub Event', eventType: SINGLES, gender: MALE }];
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 0 },
      eventProfiles,
    });

    const modifyProfiles: any[] = [
      {
        eventName: 'Pub Event',
        drawProfiles: [{ drawSize: 4 }],
        publish: true,
      },
    ];
    let result: any = mocksEngine.modifyTournamentRecord({
      eventProfiles: modifyProfiles,
      tournamentRecord,
    });
    expect(result.success).toEqual(true);

    tournamentEngine.setState(tournamentRecord);
    const event = tournamentRecord.events[0];
    expect(event.timeItems?.length).toBeGreaterThan(0);
  });
});

describe('modifyTournamentRecord coverage - no eventProfiles or drawProfiles', () => {
  it('succeeds with only venueProfiles and schedulingProfile', () => {
    const startDate = '2023-07-01';
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      venueProfiles: [{ venueId: 'vx', courtsCount: 5 }],
      startDate,
    });

    const { rounds } = tournamentEngine.setState(tournamentRecord).getRounds();
    const schedulingProfile = [{ scheduleDate: startDate, venues: [{ venueId: 'vx', rounds }] }];

    let result: any = mocksEngine.modifyTournamentRecord({
      schedulingProfile,
      autoSchedule: true,
      periodLength: 30,
      tournamentRecord,
    });
    expect(result.success).toEqual(true);
    expect(result.schedulerResult).toBeDefined();
    expect(result.scheduledRounds).toBeDefined();
  });
});
