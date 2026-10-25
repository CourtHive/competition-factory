import { copyTournamentRecord } from '@Generators/tournamentRecords/copyTournamentRecord';
import { POLICY_SCHEDULING_DEFAULT } from '@Fixtures/policies/POLICY_SCHEDULING_DEFAULT';
import { INVALID_VALUES, VENUE_NOT_FOUND } from '@Constants/errorConditionConstants';
import { venueTransitPairs } from '@Query/venues/getVenueTransits';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

/*
 * Transit between venues, stored once per pair in `scheduling.venueTransits` (scheduling-pipeline.md § 3.4;
 * CA 2026-10-25): symmetric unless one-way, a sanctioned value a floor, pruned with a deleted venue, carried by a copy,
 * and read by the planner.
 */

const [A, B, C] = ['venue-a', 'venue-b', 'venue-c'];
const DATE = '2026-09-09';

function threeVenues() {
  mocksEngine.generateTournamentRecord({
    venueProfiles: [A, B, C].map((venueId) => ({ venueId, courtsCount: 1, startTime: '10:00', endTime: '20:00' })),
    drawProfiles: [{ drawSize: 4, matchUpFormat: 'SET1-S:6/TB7' }],
    policyDefinitions: POLICY_SCHEDULING_DEFAULT,
    startDate: DATE,
    setState: true,
  });
}

const stored = () => tournamentEngine.getTournament().tournamentRecord.scheduling?.venueTransits ?? [];
const pairs = () => tournamentEngine.getVenueTransits().transitPairs;

describe('setVenueTransit', () => {
  it('stores a pair once, symmetric, and updates it from either order', () => {
    threeVenues();
    expect(tournamentEngine.setVenueTransit({ venueIds: [A, B], minutes: 45 }).success).toEqual(true);
    expect(pairs()).toEqual({ [A]: { [B]: 45 }, [B]: { [A]: 45 } });
    expect(tournamentEngine.setVenueTransit({ venueIds: [B, A], minutes: 50 }).success).toEqual(true);
    expect(stored().length).toEqual(1);
    expect(pairs()).toEqual({ [A]: { [B]: 50 }, [B]: { [A]: 50 } });
  });

  it('a one-way value runs one way only, beside a symmetric pair', () => {
    threeVenues();
    tournamentEngine.setVenueTransit({ venueIds: [A, B], minutes: 30 });
    tournamentEngine.setVenueTransit({ venueIds: [B, A], minutes: 60, oneWay: true });
    expect(stored().length).toEqual(2);
    expect(pairs()).toEqual({ [A]: { [B]: 30 }, [B]: { [A]: 60 } });
  });

  it('refuses a venue paired with itself, minutes that are not whole and non-negative, and an unknown venue', () => {
    threeVenues();
    expect(tournamentEngine.setVenueTransit({ venueIds: [A, A], minutes: 10 }).error).toEqual(INVALID_VALUES);
    expect(tournamentEngine.setVenueTransit({ venueIds: [A, B], minutes: -5 }).error).toEqual(INVALID_VALUES);
    expect(tournamentEngine.setVenueTransit({ venueIds: [A, B], minutes: 7.5 }).error).toEqual(INVALID_VALUES);
    expect(tournamentEngine.setVenueTransit({ venueIds: [A, 'nowhere'], minutes: 10 }).error).toEqual(VENUE_NOT_FOUND);
    expect(stored()).toEqual([]);
  });
});

describe('a sanctioned value is a floor (CA 2026-10-25)', () => {
  it('keeps the sanctioned value beside the minutes, refuses less, and refuses removal', () => {
    threeVenues();
    let result: any = tournamentEngine.setVenueTransits({
      venueTransits: [{ venueIds: [A, B], minutes: 45, sanctioned: { minutes: 40, sanctioningId: 's-1' } }],
    });
    expect(result.success).toEqual(true);
    result = tournamentEngine.setVenueTransit({ venueIds: [A, B], minutes: 35 });
    expect(result.error).toEqual(INVALID_VALUES);
    result = tournamentEngine.setVenueTransit({ venueIds: [A, B], minutes: 40 });
    expect(result.success).toEqual(true);
    expect(stored()).toEqual([{ venueIds: [A, B], minutes: 40, sanctioned: { minutes: 40, sanctioningId: 's-1' } }]);
    expect(tournamentEngine.removeVenueTransit({ venueIds: [A, B] }).error).toEqual(INVALID_VALUES);
  });

  it('a replacing import keeps sanctioned pairs and drops the rest', () => {
    threeVenues();
    tournamentEngine.setVenueTransits({
      venueTransits: [
        { venueIds: [A, B], minutes: 40, sanctioned: { minutes: 40 } },
        { venueIds: [A, C], minutes: 20 },
      ],
    });
    tournamentEngine.setVenueTransits({ venueTransits: [{ venueIds: [B, C], minutes: 15 }], replace: true });
    expect(pairs()).toEqual({ [A]: { [B]: 40 }, [B]: { [A]: 40, [C]: 15 }, [C]: { [B]: 15 } });
  });

  it('refuses an import below a sanctioned value', () => {
    threeVenues();
    const result: any = tournamentEngine.setVenueTransits({
      venueTransits: [{ venueIds: [A, B], minutes: 20, sanctioned: { minutes: 40 } }],
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });
});

describe('the pairs live and die with their venues', () => {
  it('removing a pair returns it to the default; deleting a venue prunes every pair naming it', () => {
    threeVenues();
    tournamentEngine.setVenueTransit({ venueIds: [A, B], minutes: 45 });
    tournamentEngine.setVenueTransit({ venueIds: [B, C], minutes: 25 });
    expect(tournamentEngine.removeVenueTransit({ venueIds: [B, A] }).success).toEqual(true);
    expect(pairs()).toEqual({ [B]: { [C]: 25 }, [C]: { [B]: 25 } });
    expect(tournamentEngine.deleteVenue({ venueId: C }).success).toEqual(true);
    expect(stored()).toEqual([]);
  });

  it('a copied record carries its pairs', () => {
    threeVenues();
    tournamentEngine.setVenueTransit({ venueIds: [A, B], minutes: 45 });
    const { tournamentRecord } = tournamentEngine.getTournament();
    const copy: any = copyTournamentRecord({ tournamentRecord, tournamentName: 'copy', startDate: DATE });
    expect(copy.tournamentRecord.scheduling.venueTransits).toEqual([{ venueIds: [A, B], minutes: 45 }]);
  });

  it('linked records stating one pair differently give the greater', () => {
    const record = (id: string, minutes: number): any => ({
      tournamentId: id,
      scheduling: { venueTransits: [{ venueIds: [A, B], minutes }] },
    });
    expect(venueTransitPairs({ t1: record('t1', 30), t2: record('t2', 50) })).toEqual({
      [A]: { [B]: 50 },
      [B]: { [A]: 50 },
    });
  });
});

describe('the planner reads the stored pairs', () => {
  /** semifinals timed at 10:00 at A, the final profiled at B; the final's time after a scheduling run */
  function finalTime(transitMinutes?: number) {
    threeVenues();
    if (transitMinutes !== undefined) tournamentEngine.setVenueTransit({ venueIds: [A, B], minutes: transitMinutes });
    const { tournamentRecord } = tournamentEngine.getTournament();
    for (const semifinal of tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } })
      .matchUps) {
      const result = tournamentEngine.addMatchUpScheduleItems({
        schedule: { scheduledDate: DATE, scheduledTime: '10:00', venueId: A },
        matchUpId: semifinal.matchUpId,
        drawId: semifinal.drawId,
      });
      expect(result.success).toEqual(true);
    }
    const event = tournamentRecord.events[0];
    const round = {
      structureId: event.drawDefinitions[0].structures[0].structureId,
      tournamentId: tournamentRecord.tournamentId,
      drawId: event.drawDefinitions[0].drawId,
      eventId: event.eventId,
      roundNumber: 2,
    };
    expect(tournamentEngine.addSchedulingProfileRound({ scheduleDate: DATE, venueId: B, round }).success).toEqual(true);
    expect(tournamentEngine.scheduleProfileRounds({}).success).toEqual(true);
    return tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [2] } }).matchUps[0].schedule
      ?.scheduledTime;
  }

  it('the policy default (30) adds nothing to a 30 minute recovery', () => {
    expect(finalTime()).toEqual('11:00');
  });

  it('a stored pair of 60 minutes holds the finalists until 11:30', () => {
    expect(finalTime(60)).toEqual('11:30');
  });
});
