import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import queryEngine from '@Engines/queryEngine';
import { expect, it } from 'vitest';

// constants
import { TEAM_EVENT } from '@Constants/eventConstants';

it('competitionScheduleMatchUps with usePublishState includes tieMatchUps', () => {
  const scheduledDate = '2026-03-09';
  const startDate = scheduledDate;
  const endDate = '2026-03-15';

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4 }],
    venueProfiles: [{ courtsCount: 6, startTime: '08:00', endTime: '20:00' }],
    startDate,
    endDate,
  });

  tournamentEngine.setState(tournamentRecord);

  // Get all matchUps
  const allMatchUps = queryEngine.allTournamentMatchUps().matchUps;
  const teamMatchUps = allMatchUps.filter((m) => m.matchUpType === 'TEAM');
  const tieMatchUps = allMatchUps.filter((m) => m.collectionId);

  expect(teamMatchUps.length).toBeGreaterThan(0);
  expect(tieMatchUps.length).toBeGreaterThan(0);

  // Schedule a TEAM matchUp
  const teamMatchUp = teamMatchUps[0];
  const { drawId } = teamMatchUp;

  let result = tournamentEngine.setMatchUpStatus({
    matchUpId: teamMatchUp.matchUpId,
    schedule: { scheduledDate },
    drawId,
  });
  expect(result.success).toEqual(true);

  // Schedule individual tieMatchUps within that TEAM matchUp
  const teamTieMatchUps = tieMatchUps.filter((m) => m.matchUpTieId === teamMatchUp.matchUpId);
  expect(teamTieMatchUps.length).toBeGreaterThan(0);

  const { courts } = queryEngine.getVenuesAndCourts();
  for (let i = 0; i < Math.min(teamTieMatchUps.length, courts.length); i++) {
    result = tournamentEngine.setMatchUpStatus({
      matchUpId: teamTieMatchUps[i].matchUpId,
      schedule: {
        scheduledDate,
        scheduledTime: `${8 + i}:00`,
        courtId: courts[i].courtId,
      },
      drawId,
    });
    expect(result.success).toEqual(true);
  }

  // Check without usePublishState — should include tieMatchUps
  result = tournamentEngine.competitionScheduleMatchUps({
    matchUpFilters: { scheduledDate },
  });
  const dateMatchUpsNoPublish = result.dateMatchUps;
  const tieMatchUpsInSchedule = dateMatchUpsNoPublish.filter((m) => m.collectionId);
  console.log('Without usePublishState:', {
    total: dateMatchUpsNoPublish.length,
    tieMatchUps: tieMatchUpsInSchedule.length,
    teamMatchUps: dateMatchUpsNoPublish.filter((m) => m.matchUpType === 'TEAM').length,
  });
  expect(tieMatchUpsInSchedule.length).toBeGreaterThan(0);

  // Now publish the event and order of play
  const { tournamentRecord: tr } = tournamentEngine.getTournament();
  const eventId = tr.events[0].eventId;

  result = tournamentEngine.publishEvent({ eventId });
  expect(result.success).toEqual(true);

  result = tournamentEngine.publishOrderOfPlay({
    scheduledDates: [scheduledDate],
    eventIds: [eventId],
  });
  expect(result.success).toEqual(true);

  // Check WITH usePublishState — should ALSO include tieMatchUps
  result = tournamentEngine.competitionScheduleMatchUps({
    usePublishState: true,
  });
  const dateMatchUpsWithPublish = result.dateMatchUps;
  const tieMatchUpsPublished = dateMatchUpsWithPublish.filter((m) => m.collectionId);
  const teamMatchUpsPublished = dateMatchUpsWithPublish.filter((m) => m.matchUpType === 'TEAM');
  console.log('With usePublishState:', {
    total: dateMatchUpsWithPublish.length,
    tieMatchUps: tieMatchUpsPublished.length,
    teamMatchUps: teamMatchUpsPublished.length,
  });

  // This is the bug: tieMatchUps should be present
  expect(tieMatchUpsPublished.length).toBeGreaterThan(0);
});

it('tieMatchUps included when only tieMatchUps are scheduled (not parent TEAM)', () => {
  const scheduledDate = '2026-03-09';
  const startDate = scheduledDate;
  const endDate = '2026-03-15';

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4 }],
    venueProfiles: [{ courtsCount: 6, startTime: '08:00', endTime: '20:00' }],
    startDate,
    endDate,
  });

  tournamentEngine.setState(tournamentRecord);

  const allMatchUps = queryEngine.allTournamentMatchUps().matchUps;
  const teamMatchUps = allMatchUps.filter((m) => m.matchUpType === 'TEAM');
  const tieMatchUps = allMatchUps.filter((m) => m.collectionId);
  const teamMatchUp = teamMatchUps[0];
  const { drawId } = teamMatchUp;

  // Only schedule tieMatchUps — NOT the parent TEAM matchUp
  const teamTieMatchUps = tieMatchUps.filter((m) => m.matchUpTieId === teamMatchUp.matchUpId);
  const { courts } = queryEngine.getVenuesAndCourts();
  for (let i = 0; i < Math.min(teamTieMatchUps.length, courts.length); i++) {
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: teamTieMatchUps[i].matchUpId,
      schedule: {
        scheduledDate,
        scheduledTime: `${8 + i}:00`,
        courtId: courts[i].courtId,
      },
      drawId,
    });
    expect(result.success).toEqual(true);
  }

  // Without publish state — check tieMatchUps are present even when parent TEAM has no scheduledDate
  let result = tournamentEngine.competitionScheduleMatchUps({
    matchUpFilters: { scheduledDate },
  });
  const noPublishTie = result.dateMatchUps.filter((m) => m.collectionId);
  console.log('No parent schedule, without usePublishState:', {
    total: result.dateMatchUps.length,
    tieMatchUps: noPublishTie.length,
    teamMatchUps: result.dateMatchUps.filter((m) => m.matchUpType === 'TEAM').length,
  });
  // tieMatchUps should be in dateMatchUps even when parent TEAM is not scheduled
  expect(noPublishTie.length).toBeGreaterThan(0);

  // Publish and check with usePublishState
  const { tournamentRecord: tr } = tournamentEngine.getTournament();
  const eventId = tr.events[0].eventId;

  tournamentEngine.publishEvent({ eventId });
  tournamentEngine.publishOrderOfPlay({
    scheduledDates: [scheduledDate],
    eventIds: [eventId],
  });

  result = tournamentEngine.competitionScheduleMatchUps({
    usePublishState: true,
  });
  const publishTie = result.dateMatchUps.filter((m) => m.collectionId);
  console.log('No parent schedule, with usePublishState:', {
    total: result.dateMatchUps.length,
    tieMatchUps: publishTie.length,
    teamMatchUps: result.dateMatchUps.filter((m) => m.matchUpType === 'TEAM').length,
  });

  expect(publishTie.length).toBeGreaterThan(0);
});

it('tieMatchUps included with TEAM + SINGLES events (mixed)', () => {
  const scheduledDate = '2026-03-09';
  const startDate = scheduledDate;
  const endDate = '2026-03-15';

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      { eventType: TEAM_EVENT, drawSize: 4, drawId: 'teamDraw' },
      { drawSize: 8, drawId: 'singlesDraw' },
    ],
    venueProfiles: [{ courtsCount: 8, startTime: '08:00', endTime: '20:00' }],
    startDate,
    endDate,
  });

  tournamentEngine.setState(tournamentRecord);

  const allMatchUps = queryEngine.allTournamentMatchUps().matchUps;
  const teamMatchUps = allMatchUps.filter((m) => m.matchUpType === 'TEAM');
  const tieMatchUps = allMatchUps.filter((m) => m.collectionId);
  const singlesMatchUps = allMatchUps.filter((m) => m.drawId === 'singlesDraw');

  const teamMatchUp = teamMatchUps[0];
  const { courts } = queryEngine.getVenuesAndCourts();

  // Schedule TEAM matchUp
  let result = tournamentEngine.setMatchUpStatus({
    matchUpId: teamMatchUp.matchUpId,
    schedule: { scheduledDate },
    drawId: 'teamDraw',
  });
  expect(result.success).toEqual(true);

  // Schedule tieMatchUps
  const teamTieMatchUps = tieMatchUps.filter((m) => m.matchUpTieId === teamMatchUp.matchUpId);
  for (let i = 0; i < Math.min(teamTieMatchUps.length, courts.length); i++) {
    result = tournamentEngine.setMatchUpStatus({
      matchUpId: teamTieMatchUps[i].matchUpId,
      schedule: {
        scheduledDate,
        scheduledTime: `${8 + i}:00`,
        courtId: courts[i].courtId,
      },
      drawId: 'teamDraw',
    });
    expect(result.success).toEqual(true);
  }

  // Schedule a singles matchUp
  const singlesMatchUp = singlesMatchUps[0];
  result = tournamentEngine.setMatchUpStatus({
    matchUpId: singlesMatchUp.matchUpId,
    schedule: { scheduledDate, scheduledTime: '14:00' },
    drawId: 'singlesDraw',
  });
  expect(result.success).toEqual(true);

  // Publish both events and OOP
  const { tournamentRecord: tr } = tournamentEngine.getTournament();
  const eventIds = tr.events.map((e) => e.eventId);
  for (const eventId of eventIds) {
    tournamentEngine.publishEvent({ eventId });
  }
  tournamentEngine.publishOrderOfPlay({
    scheduledDates: [scheduledDate],
    eventIds,
  });

  result = tournamentEngine.competitionScheduleMatchUps({
    usePublishState: true,
  });

  const publishTie = result.dateMatchUps.filter((m) => m.collectionId);
  const publishTeam = result.dateMatchUps.filter((m) => m.matchUpType === 'TEAM');
  const publishSingles = result.dateMatchUps.filter((m) => m.drawId === 'singlesDraw');
  console.log('Mixed events, with usePublishState:', {
    total: result.dateMatchUps.length,
    tieMatchUps: publishTie.length,
    teamMatchUps: publishTeam.length,
    singlesMatchUps: publishSingles.length,
  });

  expect(publishTie.length).toBeGreaterThan(0);
  expect(publishSingles.length).toBeGreaterThan(0);
});
