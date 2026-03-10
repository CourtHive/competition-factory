import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { extractDate } from '@Tools/dateTime';
import { expect, it, describe } from 'vitest';

// constants
import {
  COURT_NOT_FOUND,
  INVALID_VALUES,
  MISSING_TOURNAMENT_RECORD,
  SCHEDULED_MATCHUPS,
} from '@Constants/errorConditionConstants';

describe('deleteCourts', () => {
  it('returns MISSING_TOURNAMENT_RECORD when no tournament is loaded', () => {
    tournamentEngine.reset();
    const result = tournamentEngine.deleteCourts({ courtIds: ['bogus'] });
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  });

  it('returns INVALID_VALUES when courtIds is not an array', () => {
    mocksEngine.generateTournamentRecord({ setState: true });
    const result = tournamentEngine.deleteCourts({ courtIds: 'notAnArray' as any });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('returns COURT_NOT_FOUND for a non-existent courtId', () => {
    mocksEngine.generateTournamentRecord({ setState: true });
    const result = tournamentEngine.deleteCourts({ courtIds: ['bogus-court-id'] });
    expect(result.error).toEqual(COURT_NOT_FOUND);
  });

  it('succeeds with an empty courtIds array', () => {
    mocksEngine.generateTournamentRecord({ setState: true });
    const result = tournamentEngine.deleteCourts({ courtIds: [] });
    expect(result.success).toEqual(true);
  });

  it('deletes a single court', () => {
    mocksEngine.generateTournamentRecord({
      venueProfiles: [{ courtsCount: 4, venueId: 'venueId' }],
      setState: true,
    });

    let { courts } = tournamentEngine.getCourts();
    expect(courts.length).toEqual(4);
    const courtIdToDelete = courts[0].courtId;

    const result = tournamentEngine.deleteCourts({ courtIds: [courtIdToDelete] });
    expect(result.success).toEqual(true);

    ({ courts } = tournamentEngine.getCourts());
    expect(courts.length).toEqual(3);
    expect(courts.map((c: any) => c.courtId)).not.toContain(courtIdToDelete);
  });

  it('deletes multiple courts from the same venue', () => {
    mocksEngine.generateTournamentRecord({
      venueProfiles: [{ courtsCount: 6, venueId: 'venueId' }],
      setState: true,
    });

    let { courts } = tournamentEngine.getCourts();
    expect(courts.length).toEqual(6);

    const courtIdsToDelete = courts.slice(0, 3).map((c: any) => c.courtId);
    const result = tournamentEngine.deleteCourts({ courtIds: courtIdsToDelete });
    expect(result.success).toEqual(true);

    ({ courts } = tournamentEngine.getCourts());
    expect(courts.length).toEqual(3);
    for (const courtId of courtIdsToDelete) {
      expect(courts.map((c: any) => c.courtId)).not.toContain(courtId);
    }
  });

  it('deletes all courts from a venue', () => {
    mocksEngine.generateTournamentRecord({
      venueProfiles: [{ courtsCount: 4, venueId: 'venueId' }],
      setState: true,
    });

    let { courts } = tournamentEngine.getCourts();
    const allCourtIds = courts.map((c: any) => c.courtId);
    expect(allCourtIds.length).toEqual(4);

    const result = tournamentEngine.deleteCourts({ courtIds: allCourtIds });
    expect(result.success).toEqual(true);

    ({ courts } = tournamentEngine.getCourts());
    expect(courts.length).toEqual(0);

    // venue still exists even with no courts
    const { venues } = tournamentEngine.getVenuesAndCourts();
    expect(venues.length).toEqual(1);
  });

  it('deletes courts from multiple venues', () => {
    mocksEngine.generateTournamentRecord({
      venueProfiles: [
        { courtsCount: 3, venueId: 'venue1' },
        { courtsCount: 3, venueId: 'venue2' },
      ],
      setState: true,
    });

    let { courts } = tournamentEngine.getCourts();
    expect(courts.length).toEqual(6);

    // delete one court from each venue
    const venue1Court = courts.find((c: any) => c.venueId === 'venue1');
    const venue2Court = courts.find((c: any) => c.venueId === 'venue2');
    const courtIdsToDelete = [venue1Court.courtId, venue2Court.courtId];

    const result = tournamentEngine.deleteCourts({ courtIds: courtIdsToDelete });
    expect(result.success).toEqual(true);

    ({ courts } = tournamentEngine.getCourts());
    expect(courts.length).toEqual(4);
  });

  it('refuses to delete courts with scheduled matchUps without force', () => {
    const startDate = extractDate(new Date().toISOString());

    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ idPrefix: 'm', drawId: 'drawId', drawSize: 8 }],
      venueProfiles: [{ courtsCount: 4, idPrefix: 'c', venueId: 'venueId', venueAbbreviation: 'VNU' }],
      setState: true,
      startDate,
    });

    // explicitly assign a matchUp to a court
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const matchUpId = matchUps[0].matchUpId;
    const { courts } = tournamentEngine.getCourts();
    const courtId = courts[0].courtId;

    let result = tournamentEngine.assignMatchUpVenue({ matchUpId, venueId: 'venueId', drawId: 'drawId' });
    expect(result.success).toEqual(true);
    result = tournamentEngine.assignMatchUpCourt({ matchUpId, courtId, drawId: 'drawId', courtDayDate: startDate });
    expect(result.success).toEqual(true);

    // should fail — court has a scheduled matchUp
    result = tournamentEngine.deleteCourts({ courtIds: [courtId] });
    expect(result.error).toEqual(SCHEDULED_MATCHUPS);

    // court should still be intact
    const { courts: remainingCourts } = tournamentEngine.getCourts();
    expect(remainingCourts.length).toEqual(4);
  });

  it('deletes courts with scheduled matchUps when force is true', () => {
    const startDate = extractDate(new Date().toISOString());

    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ idPrefix: 'm', drawId: 'drawId', drawSize: 8 }],
      venueProfiles: [{ courtsCount: 4, idPrefix: 'c', venueId: 'venueId', venueAbbreviation: 'VNU' }],
      setState: true,
      startDate,
    });

    // explicitly assign matchUps to courts
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const { courts } = tournamentEngine.getCourts();

    for (let i = 0; i < Math.min(matchUps.length, courts.length); i++) {
      tournamentEngine.assignMatchUpVenue({ matchUpId: matchUps[i].matchUpId, venueId: 'venueId', drawId: 'drawId' });
      tournamentEngine.assignMatchUpCourt({
        matchUpId: matchUps[i].matchUpId,
        courtId: courts[i].courtId,
        drawId: 'drawId',
        courtDayDate: startDate,
      });
    }

    const allCourtIds = courts.map((c: any) => c.courtId);

    const result = tournamentEngine.deleteCourts({ courtIds: allCourtIds, force: true });
    expect(result.success).toEqual(true);

    const { courts: remainingCourts } = tournamentEngine.getCourts();
    expect(remainingCourts.length).toEqual(0);

    // matchUps should have court assignments removed
    const { matchUps: updatedMatchUps } = tournamentEngine.allTournamentMatchUps();
    for (const matchUp of updatedMatchUps) {
      expect(matchUp.schedule?.courtId).toBeUndefined();
    }
  });

  it('stops on first error and preserves remaining courts', () => {
    mocksEngine.generateTournamentRecord({
      venueProfiles: [{ courtsCount: 4, venueId: 'venueId' }],
      setState: true,
    });

    let { courts } = tournamentEngine.getCourts();
    const validCourtId = courts[0].courtId;

    // first valid, second bogus — should delete first then error on second
    const result = tournamentEngine.deleteCourts({
      courtIds: [validCourtId, 'bogus-court-id'],
    });
    expect(result.error).toEqual(COURT_NOT_FOUND);

    // first court was deleted before error
    ({ courts } = tournamentEngine.getCourts());
    expect(courts.length).toEqual(3);
    expect(courts.map((c: any) => c.courtId)).not.toContain(validCourtId);
  });

  it('works via executionQueue', () => {
    mocksEngine.generateTournamentRecord({
      venueProfiles: [{ courtsCount: 4, venueId: 'venueId' }],
      setState: true,
    });

    let { courts } = tournamentEngine.getCourts();
    expect(courts.length).toEqual(4);
    const courtIdsToDelete = courts.slice(0, 2).map((c: any) => c.courtId);

    const result = tournamentEngine.executionQueue([
      { method: 'deleteCourts', params: { courtIds: courtIdsToDelete } },
    ]);
    expect(result.success).toEqual(true);

    ({ courts } = tournamentEngine.getCourts());
    expect(courts.length).toEqual(2);
  });

  it('partially force-deletes: unscheduled courts succeed, scheduled courts fail without force', () => {
    const startDate = extractDate(new Date().toISOString());

    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ idPrefix: 'm', drawId: 'drawId', drawSize: 4 }],
      venueProfiles: [{ courtsCount: 4, idPrefix: 'c', venueId: 'venueId', venueAbbreviation: 'VNU' }],
      setState: true,
      startDate,
    });

    // assign one matchUp to the first court
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const { courts } = tournamentEngine.getCourts();
    const scheduledCourtId = courts[0].courtId;

    tournamentEngine.assignMatchUpVenue({ matchUpId: matchUps[0].matchUpId, venueId: 'venueId', drawId: 'drawId' });
    tournamentEngine.assignMatchUpCourt({
      matchUpId: matchUps[0].matchUpId,
      courtId: scheduledCourtId,
      drawId: 'drawId',
      courtDayDate: startDate,
    });

    const unscheduledCourtIds = courts.slice(1).map((c: any) => c.courtId);

    // deleting unscheduled courts should work without force
    const result1 = tournamentEngine.deleteCourts({ courtIds: unscheduledCourtIds });
    expect(result1.success).toEqual(true);

    const { courts: remaining } = tournamentEngine.getCourts();
    expect(remaining.length).toEqual(1);

    // deleting the scheduled court should fail without force
    const result2 = tournamentEngine.deleteCourts({ courtIds: [scheduledCourtId] });
    expect(result2.error).toEqual(SCHEDULED_MATCHUPS);
  });

  it('adds courts back after deletion', () => {
    const venueId = 'venueId';
    mocksEngine.generateTournamentRecord({
      venueProfiles: [{ courtsCount: 4, venueId }],
      setState: true,
    });

    let { courts } = tournamentEngine.getCourts();
    const allCourtIds = courts.map((c: any) => c.courtId);

    let result = tournamentEngine.deleteCourts({ courtIds: allCourtIds });
    expect(result.success).toEqual(true);

    ({ courts } = tournamentEngine.getCourts());
    expect(courts.length).toEqual(0);

    // add new courts to the now-empty venue
    result = tournamentEngine.addCourts({ venueId, courtsCount: 2 });
    expect(result.success).toEqual(true);

    ({ courts } = tournamentEngine.getCourts());
    expect(courts.length).toEqual(2);
  });
});
