import { captureNotices, changedEntities, conformanceViolations } from './noticeConformance/harness';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { MODIFY_DRAW_DEFINITION, MODIFY_EVENT, MODIFY_PARTICIPANTS } from '@Constants/topicConstants';
import { MODIFY_TOURNAMENT_DETAIL, MODIFY_VENUE } from '@Constants/topicConstants';
import { MUTATION_LOCK_EXISTS } from '@Constants/errorConditionConstants';
import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';

/**
 * Notice batch C (tournament and venue writers): each of these wrote to the record and announced
 * nothing, or announced the element it was asked to change and not another one it changed. Every
 * case asserts the record change is covered by the notice-conformance rules and that the expected
 * topic arrives; every no-op or refused call asserts nothing is announced for it.
 */

const JUNIOR = 'JUNIOR';

const records = () => structuredClone(tournamentEngine.getState().tournamentRecords);

function observe(fn: () => any) {
  const before = records();
  let result: any;
  const captured = captureNotices(() => {
    result = fn();
  });
  const after = records();
  const ids = new Set([...Object.keys(before), ...Object.keys(after)]);
  const violations = [...ids].flatMap((id) => conformanceViolations(before[id], after[id], captured));
  const changes = [...ids].flatMap((id) => changedEntities(before[id], after[id]));
  const of = (topic: string) => captured.filter((notice) => notice.topic === topic).map(({ payload }) => payload);
  return { result, violations, changes, of };
}

const startDate = '2025-03-01';
const endDate = '2025-03-03';
const venueProfiles = [{ venueName: 'One', courtsCount: 2, startTime: '08:00', endTime: '20:00' }];

function seed(extra: Record<string, any> = {}) {
  const generated = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 8 },
    drawProfiles: [{ drawSize: 4 }],
    venueProfiles,
    setState: true,
    startDate,
    endDate,
    ...extra,
  });
  const { tournamentRecord } = tournamentEngine.getTournament();
  const venue = tournamentRecord.venues[0];
  return {
    ...generated,
    tournamentId: tournamentRecord.tournamentId,
    eventId: tournamentRecord.events[0].eventId,
    drawId: tournamentRecord.events[0].drawDefinitions[0].drawId,
    courtIds: venue.courts.map(({ courtId }) => courtId),
    venueId: venue.venueId,
  };
}

describe('courts and venues: enable / disable', () => {
  it('disableCourts and enableCourts announce the venue whose courts changed, and only when they changed', () => {
    const { courtIds, venueId } = seed();

    let observed = observe(() => tournamentEngine.disableCourts({ courtIds: [courtIds[0]] }));
    expect(observed.result.success).toEqual(true);
    expect(observed.of(MODIFY_VENUE).map(({ venue }) => venue.venueId)).toEqual([venueId]);
    expect(observed.violations).toEqual([]);

    // disabled already: nothing changes, nothing is announced
    observed = observe(() => tournamentEngine.disableCourts({ courtIds: [courtIds[0]] }));
    expect(observed.changes).toEqual([]);
    expect(observed.of(MODIFY_VENUE)).toEqual([]);

    observed = observe(() => tournamentEngine.enableCourts({ courtIds: [courtIds[0]] }));
    expect(observed.of(MODIFY_VENUE).map(({ venue }) => venue.venueId)).toEqual([venueId]);
    expect(observed.violations).toEqual([]);

    // a court that is not disabled: nothing to enable
    observed = observe(() => tournamentEngine.enableCourts({ courtIds: [courtIds[1]] }));
    expect(observed.changes).toEqual([]);
    expect(observed.of(MODIFY_VENUE)).toEqual([]);

    // refused
    observed = observe(() => tournamentEngine.disableCourts({}));
    expect(observed.result.error).toBeDefined();
    expect(observed.of(MODIFY_VENUE)).toEqual([]);
  });

  it('disableCourts with dates, then enableCourts for those dates, each announce the venue', () => {
    const { courtIds, venueId } = seed();
    let observed = observe(() => tournamentEngine.disableCourts({ courtIds, dates: [startDate] }));
    expect(observed.of(MODIFY_VENUE).map(({ venue }) => venue.venueId)).toEqual([venueId]);
    expect(observed.violations).toEqual([]);

    observed = observe(() => tournamentEngine.enableCourts({ courtIds, dates: [startDate] }));
    expect(observed.of(MODIFY_VENUE).map(({ venue }) => venue.venueId)).toEqual([venueId]);
    expect(observed.violations).toEqual([]);
  });

  it('disableVenues and enableVenues announce the venue, and only when it changed', () => {
    const { venueId } = seed();

    let observed = observe(() => tournamentEngine.disableVenues({ venueIds: [venueId] }));
    expect(observed.result.success).toEqual(true);
    expect(observed.of(MODIFY_VENUE).map(({ venue }) => venue.venueId)).toEqual([venueId]);
    expect(observed.violations).toEqual([]);

    observed = observe(() => tournamentEngine.disableVenues({ venueIds: [venueId] }));
    expect(observed.changes).toEqual([]);
    expect(observed.of(MODIFY_VENUE)).toEqual([]);

    observed = observe(() => tournamentEngine.enableVenues({ venueIds: [venueId] }));
    expect(observed.of(MODIFY_VENUE).map(({ venue }) => venue.venueId)).toEqual([venueId]);
    expect(observed.violations).toEqual([]);

    observed = observe(() => tournamentEngine.enableVenues({ enableAll: true }));
    expect(observed.changes).toEqual([]);
    expect(observed.of(MODIFY_VENUE)).toEqual([]);
  });
});

describe('a venue that loses its primary flag is announced', () => {
  it('addVenue with isPrimary announces the venue it took the flag from', () => {
    tournamentEngine.newTournamentRecord({ startDate, endDate });
    const first = tournamentEngine.addVenue({ venue: { venueName: 'A', isPrimary: true } }).venue;

    let observed = observe(() => tournamentEngine.addVenue({ venue: { venueName: 'B', isPrimary: true } }));
    expect(observed.result.success).toEqual(true);
    expect(observed.of(MODIFY_VENUE).map(({ venue }) => venue.venueId)).toEqual([first.venueId]);
    expect(observed.violations).toEqual([]);

    // no primary flag: no other venue changes
    observed = observe(() => tournamentEngine.addVenue({ venue: { venueName: 'C' } }));
    expect(observed.of(MODIFY_VENUE)).toEqual([]);
    expect(observed.violations).toEqual([]);
  });

  it('modifyVenue to isPrimary announces the venue it took the flag from, once each', () => {
    tournamentEngine.newTournamentRecord({ startDate, endDate });
    const first = tournamentEngine.addVenue({ venue: { venueName: 'A', isPrimary: true } }).venue;
    const second = tournamentEngine.addVenue({ venue: { venueName: 'B' } }).venue;

    let observed = observe(() =>
      tournamentEngine.modifyVenue({ venueId: second.venueId, modifications: { isPrimary: true } }),
    );
    expect(observed.result.success).toEqual(true);
    const venueIds = observed.of(MODIFY_VENUE).map(({ venue }) => venue.venueId);
    expect(venueIds.sort((a, b) => a.localeCompare(b))).toEqual(
      [first.venueId, second.venueId].sort((a, b) => a.localeCompare(b)),
    );
    expect(observed.violations).toEqual([]);

    // already primary: the venue itself is not cleared and re-set, and no other venue is touched
    observed = observe(() =>
      tournamentEngine.modifyVenue({ venueId: second.venueId, modifications: { isPrimary: true } }),
    );
    expect(observed.of(MODIFY_VENUE).map(({ venue }) => venue.venueId)).toEqual([second.venueId]);
    expect(observed.changes).toEqual([]);
  });
});

describe('setTournamentDates', () => {
  it('announces each venue whose courts gain or lose dateAvailability', () => {
    const { venueId } = seed();
    let observed = observe(() => tournamentEngine.setTournamentDates({ startDate, endDate: '2025-03-05' }));
    expect(observed.result.success).toEqual(true);
    expect(observed.of(MODIFY_VENUE).map(({ venue }) => venue.venueId)).toEqual([venueId]);
    expect(observed.violations).toEqual([]);

    // the same dates again: courts already match
    observed = observe(() => tournamentEngine.setTournamentDates({ startDate, endDate: '2025-03-05' }));
    expect(observed.of(MODIFY_VENUE)).toEqual([]);
  });
});

describe('scheduling data on the tournament', () => {
  it('schedule scenarios: add, update, rebase and remove announce the scenarios; a no-op update does not', () => {
    const { tournamentId } = seed();
    let observed = observe(() =>
      tournamentEngine.addScheduleScenario({
        scenario: { scenarioName: 'Rain plan', scheduledDates: [startDate], placements: [] },
      }),
    );
    expect(observed.result.success).toEqual(true);
    const { scenarioId } = observed.result;
    let [detail] = observed.of(MODIFY_TOURNAMENT_DETAIL);
    expect(detail.tournamentId).toEqual(tournamentId);
    expect(detail.scheduleScenarios.map((s) => s.scenarioId)).toEqual([scenarioId]);
    expect(observed.violations).toEqual([]);

    observed = observe(() =>
      tournamentEngine.updateScheduleScenario({ scenarioId, updates: { scenarioName: 'Storm plan' } }),
    );
    [detail] = observed.of(MODIFY_TOURNAMENT_DETAIL);
    expect(detail.scheduleScenarios[0].scenarioName).toEqual('Storm plan');
    expect(observed.violations).toEqual([]);

    observed = observe(() =>
      tournamentEngine.updateScheduleScenario({ scenarioId, updates: { scenarioName: 'Storm plan' } }),
    );
    expect(observed.result.success).toEqual(true);
    expect(observed.changes).toEqual([]);
    expect(observed.of(MODIFY_TOURNAMENT_DETAIL)).toEqual([]);

    // the baseline has not drifted: rebasing changes nothing
    observed = observe(() => tournamentEngine.rebaseScheduleScenario({ scenarioId }));
    expect(observed.result.success).toEqual(true);
    expect(observed.changes).toEqual([]);
    expect(observed.of(MODIFY_TOURNAMENT_DETAIL)).toEqual([]);

    observed = observe(() => tournamentEngine.removeScheduleScenario({ scenarioId }));
    [detail] = observed.of(MODIFY_TOURNAMENT_DETAIL);
    expect(detail.scheduleScenarios).toEqual([]);
    expect(observed.violations).toEqual([]);

    observed = observe(() => tournamentEngine.removeScheduleScenario({ scenarioId }));
    expect(observed.result.error).toBeDefined();
    expect(observed.of(MODIFY_TOURNAMENT_DETAIL)).toEqual([]);
  });

  it('rebaseScheduleScenario announces the scenario when the baseline has drifted', () => {
    const { courtIds, tournamentId, venueId } = seed();
    const courtId = courtIds[0];
    const { matchUpId } = tournamentEngine.allTournamentMatchUps().matchUps[0];
    const schedule = (scheduledTime: string) => ({ scheduledDate: startDate, scheduledTime, courtId, venueId });
    const placements = [{ tournamentId, matchUpId, schedule: schedule('10:00') }];
    const { scenarioId } = tournamentEngine.addScheduleScenario({ scenario: { scenarioName: 'Plan', placements } });
    // the official schedule of a planned matchUp changes: the baseline drifts
    tournamentEngine.bulkScheduleMatchUps({
      matchUpDetails: [{ tournamentId, matchUpId, schedule: { ...schedule('15:00'), courtOrder: 3 } }],
    });

    const observed = observe(() => tournamentEngine.rebaseScheduleScenario({ scenarioId }));
    expect(observed.result.success).toEqual(true);
    expect(observed.of(MODIFY_TOURNAMENT_DETAIL).length).toEqual(1);
    expect(observed.violations).toEqual([]);
  });

  it('setMatchUpDailyLimits announces the limits, and not when they are unchanged', () => {
    seed();
    const dailyLimits = { SINGLES: 2, total: 3 };
    let observed = observe(() => tournamentEngine.setMatchUpDailyLimits({ dailyLimits }));
    expect(observed.result.success).toEqual(true);
    expect(observed.of(MODIFY_TOURNAMENT_DETAIL).map((payload) => payload.dailyLimits)).toEqual([dailyLimits]);
    expect(observed.violations).toEqual([]);

    observed = observe(() => tournamentEngine.setMatchUpDailyLimits({ dailyLimits }));
    expect(observed.changes).toEqual([]);
    expect(observed.of(MODIFY_TOURNAMENT_DETAIL)).toEqual([]);

    observed = observe(() => tournamentEngine.setMatchUpDailyLimits({ dailyLimits: 'none' }));
    expect(observed.result.error).toBeDefined();
    expect(observed.of(MODIFY_TOURNAMENT_DETAIL)).toEqual([]);
  });

  it('modifyMatchUpFormatTiming announces the tournament, or the event, whose timing changed', () => {
    const { eventId } = seed();
    const averageTimes = [{ categoryTypes: [JUNIOR], minutes: { default: 127 } }];

    let observed = observe(() =>
      tournamentEngine.modifyMatchUpFormatTiming({ matchUpFormat: FORMAT_STANDARD, averageTimes }),
    );
    expect(observed.result.success).toEqual(true);
    const [detail] = observed.of(MODIFY_TOURNAMENT_DETAIL);
    expect(detail.scheduleTiming.matchUpAverageTimes[0].matchUpFormatCodes).toEqual([FORMAT_STANDARD]);
    expect(observed.violations).toEqual([]);

    observed = observe(() =>
      tournamentEngine.modifyMatchUpFormatTiming({ matchUpFormat: FORMAT_STANDARD, averageTimes }),
    );
    expect(observed.changes).toEqual([]);
    expect(observed.of(MODIFY_TOURNAMENT_DETAIL)).toEqual([]);

    observed = observe(() =>
      tournamentEngine.modifyMatchUpFormatTiming({ matchUpFormat: FORMAT_STANDARD, averageTimes, eventId }),
    );
    expect(observed.of(MODIFY_EVENT).map(({ event }) => event.eventId)).toEqual([eventId]);
    expect(observed.of(MODIFY_TOURNAMENT_DETAIL)).toEqual([]);
    expect(observed.violations).toEqual([]);

    observed = observe(() =>
      tournamentEngine.modifyMatchUpFormatTiming({ matchUpFormat: FORMAT_STANDARD, averageTimes, eventId }),
    );
    expect(observed.changes).toEqual([]);
    expect(observed.of(MODIFY_EVENT)).toEqual([]);
  });
});

describe('linked tournaments', () => {
  it('linkTournaments, unlinkTournament and unlinkTournaments announce each record whose links changed', () => {
    const ids = ['link-a', 'link-b', 'link-c'];
    const tournamentRecords = ids.map(
      (tournamentId) =>
        mocksEngine.generateTournamentRecord({ tournamentAttributes: { tournamentId } }).tournamentRecord,
    );
    tournamentEngine.setState(tournamentRecords);
    const announced = (observed) =>
      observed
        .of(MODIFY_TOURNAMENT_DETAIL)
        .map((payload) => payload.tournamentId)
        .sort();

    let observed = observe(() => tournamentEngine.linkTournaments());
    expect(observed.result.success).toEqual(true);
    expect(announced(observed)).toEqual(ids);
    expect(observed.of(MODIFY_TOURNAMENT_DETAIL)[0].linkedTournamentIds.sort()).toEqual(ids);
    expect(observed.violations).toEqual([]);

    // linked already
    observed = observe(() => tournamentEngine.linkTournaments());
    expect(observed.changes).toEqual([]);
    expect(observed.of(MODIFY_TOURNAMENT_DETAIL)).toEqual([]);

    observed = observe(() => tournamentEngine.unlinkTournament({ tournamentId: 'link-c' }));
    expect(observed.result.success).toEqual(true);
    expect(announced(observed)).toEqual(ids);
    expect(observed.violations).toEqual([]);

    observed = observe(() => tournamentEngine.unlinkTournament({ tournamentId: 'link-c' }));
    expect(observed.of(MODIFY_TOURNAMENT_DETAIL)).toEqual([]);

    observed = observe(() => tournamentEngine.unlinkTournaments());
    expect(announced(observed)).toEqual(['link-a', 'link-b']);
    expect(observed.violations).toEqual([]);

    observed = observe(() => tournamentEngine.unlinkTournaments());
    expect(observed.of(MODIFY_TOURNAMENT_DETAIL)).toEqual([]);
  });
});

describe('mutation locks', () => {
  it('a lock on a draw, an event or a venue announces that element; a refused lock announces nothing', () => {
    const { drawId, eventId, venueId } = seed();

    let observed = observe(() => tournamentEngine.addMutationLock({ drawId, scope: 'DRAWS', lockToken: 't1' }));
    expect(observed.result.success).toEqual(true);
    const drawLockId = observed.result.lockId;
    expect(observed.of(MODIFY_DRAW_DEFINITION).map(({ drawDefinition }) => drawDefinition.drawId)).toEqual([drawId]);
    expect(observed.violations).toEqual([]);

    observed = observe(() => tournamentEngine.addMutationLock({ drawId, scope: 'DRAWS', lockToken: 't2' }));
    expect(observed.result.error).toEqual(MUTATION_LOCK_EXISTS);
    expect(observed.of(MODIFY_DRAW_DEFINITION)).toEqual([]);

    observed = observe(() => tournamentEngine.addMutationLock({ eventId, scope: 'DRAWS', lockToken: 't1' }));
    const eventLockId = observed.result.lockId;
    expect(observed.of(MODIFY_EVENT).map(({ event }) => event.eventId)).toEqual([eventId]);
    expect(observed.violations).toEqual([]);

    observed = observe(() => tournamentEngine.addMutationLock({ venueId, scope: 'VENUES', lockToken: 't1' }));
    const venueLockId = observed.result.lockId;
    expect(observed.of(MODIFY_VENUE).map(({ venue }) => venue.venueId)).toEqual([venueId]);
    expect(observed.violations).toEqual([]);

    observed = observe(() => tournamentEngine.removeMutationLock({ drawId, lockId: drawLockId, lockToken: 't1' }));
    expect(observed.result.success).toEqual(true);
    expect(observed.of(MODIFY_DRAW_DEFINITION).map(({ drawDefinition }) => drawDefinition.drawId)).toEqual([drawId]);
    expect(observed.violations).toEqual([]);

    observed = observe(() => tournamentEngine.removeMutationLock({ eventId, lockId: eventLockId, lockToken: 'no' }));
    expect(observed.result.error).toBeDefined();
    expect(observed.of(MODIFY_EVENT)).toEqual([]);

    observed = observe(() => tournamentEngine.removeMutationLock({ eventId, lockId: eventLockId, lockToken: 't1' }));
    expect(observed.of(MODIFY_EVENT).map(({ event }) => event.eventId)).toEqual([eventId]);
    expect(observed.violations).toEqual([]);

    observed = observe(() => tournamentEngine.removeMutationLock({ venueId, lockId: venueLockId, lockToken: 't1' }));
    expect(observed.of(MODIFY_VENUE).map(({ venue }) => venue.venueId)).toEqual([venueId]);
    expect(observed.violations).toEqual([]);
  });
});

describe('online resources', () => {
  const onlineResource = {
    identifier: 'http://someUrl/some.jpg',
    resourceSubType: 'IMAGE',
    name: 'image',
    resourceType: 'URL',
  };

  it('a participant or person resource announces the participant, once, and not when nothing changed', () => {
    seed();
    const participant = tournamentEngine.getParticipants().participants[0];
    const { participantId } = participant;
    const { personId } = participant.person;

    let observed = observe(() => tournamentEngine.addOnlineResource({ onlineResource, participantId }));
    expect(observed.result.success).toEqual(true);
    const announced = observed.of(MODIFY_PARTICIPANTS);
    expect(announced.length).toEqual(1);
    expect(announced[0].participants.map((p) => p.participantId)).toEqual([participantId]);
    expect(observed.violations).toEqual([]);

    observed = observe(() => tournamentEngine.addOnlineResource({ onlineResource, participantId }));
    expect(observed.changes).toEqual([]);
    expect(observed.of(MODIFY_PARTICIPANTS)).toEqual([]);

    observed = observe(() => tournamentEngine.addOnlineResource({ onlineResource, personId }));
    expect(observed.of(MODIFY_PARTICIPANTS)[0].participants.map((p) => p.participantId)).toEqual([participantId]);
    expect(observed.violations).toEqual([]);

    observed = observe(() => tournamentEngine.removeOnlineResource({ onlineResource, personId }));
    expect(observed.of(MODIFY_PARTICIPANTS)[0].participants.map((p) => p.participantId)).toEqual([participantId]);
    expect(observed.violations).toEqual([]);

    observed = observe(() => tournamentEngine.removeOnlineResource({ onlineResource, participantId }));
    expect(observed.of(MODIFY_PARTICIPANTS).length).toEqual(1);
    expect(observed.violations).toEqual([]);

    observed = observe(() => tournamentEngine.removeOnlineResource({ onlineResource, participantId }));
    expect(observed.changes).toEqual([]);
    expect(observed.of(MODIFY_PARTICIPANTS)).toEqual([]);

    observed = observe(() => tournamentEngine.addOnlineResource({ onlineResource, participantId: 'bogus' }));
    expect(observed.result.error).toBeDefined();
    expect(observed.of(MODIFY_PARTICIPANTS)).toEqual([]);
  });

  it('a venue or court resource announces the venue', () => {
    const { venueId, courtIds } = seed();
    const courtId = courtIds[0];
    const venueIdsOf = (observed) => observed.of(MODIFY_VENUE).map(({ venue }) => venue.venueId);

    let observed = observe(() => tournamentEngine.addOnlineResource({ onlineResource, venueId }));
    expect(venueIdsOf(observed)).toEqual([venueId]);
    expect(observed.violations).toEqual([]);

    observed = observe(() => tournamentEngine.addOnlineResource({ onlineResource, courtId }));
    expect(venueIdsOf(observed)).toEqual([venueId]);
    expect(observed.violations).toEqual([]);

    observed = observe(() => tournamentEngine.addOnlineResource({ onlineResource, courtId }));
    expect(observed.of(MODIFY_VENUE)).toEqual([]);

    observed = observe(() => tournamentEngine.removeOnlineResource({ onlineResource, courtId, venueId }));
    expect(venueIdsOf(observed)).toEqual([venueId]);
    expect(observed.violations).toEqual([]);

    observed = observe(() => tournamentEngine.removeOnlineResource({ onlineResource, venueId }));
    expect(venueIdsOf(observed)).toEqual([venueId]);
    expect(observed.violations).toEqual([]);

    observed = observe(() => tournamentEngine.removeOnlineResource({ onlineResource, venueId }));
    expect(observed.of(MODIFY_VENUE)).toEqual([]);
  });

  it("the parent organisation's resources announce the tournament detail", () => {
    const parentOrganisationId = 'org-1';
    seed({ tournamentAttributes: { parentOrganisation: { parentOrganisationId, organisationName: 'Org' } } });

    let observed = observe(() =>
      tournamentEngine.addOnlineResource({ onlineResource, organisationId: parentOrganisationId }),
    );
    expect(observed.result.success).toEqual(true);
    const [detail] = observed.of(MODIFY_TOURNAMENT_DETAIL);
    expect(detail.parentOrganisation.onlineResources).toEqual([onlineResource]);
    expect(observed.violations).toEqual([]);

    observed = observe(() =>
      tournamentEngine.removeOnlineResource({ onlineResource, organisationId: parentOrganisationId }),
    );
    expect(observed.of(MODIFY_TOURNAMENT_DETAIL).length).toEqual(1);
    expect(observed.violations).toEqual([]);

    observed = observe(() =>
      tournamentEngine.removeOnlineResource({ onlineResource, organisationId: parentOrganisationId }),
    );
    expect(observed.of(MODIFY_TOURNAMENT_DETAIL)).toEqual([]);
  });
});

describe('scheduleProfileRounds', () => {
  it('leaves the stored scheduling profile as it was: the run does not annotate it', () => {
    const { drawId, venueId, tournamentId } = seed();
    const { drawDefinition, event } = tournamentEngine.getEvent({ drawId });
    const round = {
      tournamentId,
      eventId: event.eventId,
      drawId,
      structureId: drawDefinition.structures[0].structureId,
    };
    tournamentEngine.addSchedulingProfileRound({
      scheduleDate: startDate,
      venueId,
      round: { ...round, roundNumber: 1 },
    });

    const observed = observe(() => tournamentEngine.scheduleProfileRounds({ scheduleDates: [startDate] }));
    expect(observed.result.success).toEqual(true);
    expect(observed.changes.filter(({ kind }) => kind === 'tournament')).toEqual([]);
    expect(observed.violations).toEqual([]);
  });
});
