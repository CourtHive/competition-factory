import * as queryGovernor from '@Assemblies/governors/queryGovernor';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

// The transforms must be reachable both on the engine (client: getScheduleProjection injects the
// loaded tournamentRecord) and via queryGovernor with explicit args (the server's call pattern).
describe('facility schedule governor/engine exposure', () => {
  it('is callable on the engine and through queryGovernor', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      tournamentAttributes: { tournamentId: 't1' },
      startDate: '2025-01-01',
      endDate: '2025-01-07',
      drawProfiles: [{ drawSize: 4 }],
      venueProfiles: [
        {
          venueId: 'v1',
          venueName: 'Club',
          venueAbbreviation: 'CLB',
          startTime: '08:00',
          endTime: '20:00',
          courtsCount: 2,
          idPrefix: 'v1c',
        },
      ],
      nonRandom: 1,
    });
    tournamentEngine.setState(tournamentRecord);

    const { venues } = tournamentEngine.getVenuesAndCourts();
    const courtId = venues[0].courts[0].courtId;
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    tournamentEngine.addMatchUpScheduleItems({
      matchUpId: matchUps[0].matchUpId,
      drawId,
      schedule: { scheduledDate: '2025-01-01', scheduledTime: '09:00', courtId, courtOrder: 1 },
    });

    // engine path: tournamentRecord is injected from loaded state
    const viaEngine = tournamentEngine.getScheduleProjection({ venueIds: ['v1'] });
    expect(viaEngine.scheduleCells).toHaveLength(1);
    expect(viaEngine.scheduleCells[0].venueId).toEqual('v1');

    // governor path with an explicit record (how the server calls it)
    const { tournamentRecord: record } = tournamentEngine.getTournament();
    const viaGovernor = queryGovernor.getScheduleProjection({ tournamentRecord: record, venueIds: ['v1'] });
    expect(viaGovernor.scheduleCells).toHaveLength(1);

    const grid = queryGovernor.mergeFacilitySchedule({ projections: [viaGovernor.scheduleCells] });
    expect(grid.venues.v1.courts[courtId].dates['2025-01-01']).toHaveLength(1);
    expect(grid.conflicts).toEqual([]);
  });
});
