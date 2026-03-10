import { getMatchUpIds } from '@Functions/global/extractors';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

const START_DATE = '2025-07-01';

function generateAndSetMultipleTournaments() {
  // Generate two independent tournaments
  const t1 = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    venueProfiles: [{ courtsCount: 4 }],
    startDate: START_DATE,
  });
  const t2 = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    venueProfiles: [{ courtsCount: 4 }],
    startDate: START_DATE,
  });

  const tr1 = t1.tournamentRecord;
  const tr2 = t2.tournamentRecord;

  const eventId1 = tr1.events[0].eventId;
  const eventId2 = tr2.events[0].eventId;
  const drawId1 = t1.drawIds[0];
  const drawId2 = t2.drawIds[0];
  const tournamentId1 = tr1.tournamentId;
  const tournamentId2 = tr2.tournamentId;

  return { tr1, tr2, eventId1, eventId2, drawId1, drawId2, tournamentId1, tournamentId2 };
}

/**
 * Publish OOP on a tournament record, schedule matchUps, then set multi-tournament state.
 * We do per-tournament setup before setting the combined state to avoid engine routing issues.
 */
function setupPublishedTournaments({
  publishEvent1 = true,
  publishEvent2 = true,
  publishOOP1 = true,
  publishOOP2 = true,
}: {
  publishEvent1?: boolean;
  publishEvent2?: boolean;
  publishOOP1?: boolean;
  publishOOP2?: boolean;
} = {}) {
  const { tr1, tr2, eventId1, eventId2, drawId1, drawId2, tournamentId1, tournamentId2 } =
    generateAndSetMultipleTournaments();

  // Setup tournament 1: schedule + publish
  tournamentEngine.setState(tr1);
  const { upcomingMatchUps: up1, pendingMatchUps: pend1 } = tournamentEngine.getCompetitionMatchUps();
  const all1 = [...(up1 ?? []), ...(pend1 ?? [])];
  if (all1.length) {
    tournamentEngine.scheduleMatchUps({ scheduleDate: START_DATE, matchUpIds: getMatchUpIds(all1) });
  }
  if (publishEvent1) tournamentEngine.publishEvent({ eventId: eventId1 });
  if (publishOOP1) tournamentEngine.publishOrderOfPlay({ scheduledDates: [START_DATE] });

  // Get the modified tournament record
  const { tournamentRecord: modified1 } = tournamentEngine.getTournament();

  // Setup tournament 2: schedule + publish
  tournamentEngine.setState(tr2);
  const { upcomingMatchUps: up2, pendingMatchUps: pend2 } = tournamentEngine.getCompetitionMatchUps();
  const all2 = [...(up2 ?? []), ...(pend2 ?? [])];
  if (all2.length) {
    tournamentEngine.scheduleMatchUps({ scheduleDate: START_DATE, matchUpIds: getMatchUpIds(all2) });
  }
  if (publishEvent2) tournamentEngine.publishEvent({ eventId: eventId2 });
  if (publishOOP2) tournamentEngine.publishOrderOfPlay({ scheduledDates: [START_DATE] });

  const { tournamentRecord: modified2 } = tournamentEngine.getTournament();

  // Now set combined state
  tournamentEngine.setState({
    [modified1.tournamentId]: modified1,
    [modified2.tournamentId]: modified2,
  });

  return { eventId1, eventId2, drawId1, drawId2, tournamentId1, tournamentId2 };
}

describe('multi-tournament publishing', () => {
  it('two tournaments, both published — CSM returns matchUps from both', () => {
    const { drawId1, drawId2 } = setupPublishedTournaments();

    const result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
    });

    expect(result.success).toEqual(true);
    const drawIds = [...new Set(result.dateMatchUps.map((m) => m.drawId))];
    expect(drawIds).toContain(drawId1);
    expect(drawIds).toContain(drawId2);
  });

  it('two tournaments, one published, one not — only published tournament matchUps returned', () => {
    const { drawId1, drawId2 } = setupPublishedTournaments({
      publishEvent2: false,
    });

    const result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
    });

    expect(result.success).toEqual(true);
    const drawIds = [...new Set(result.dateMatchUps.map((m) => m.drawId))];
    expect(drawIds).toContain(drawId1);
    expect(drawIds).not.toContain(drawId2);
  });

  it('activeTournamentId selects one tournament for publish state check', () => {
    const { tournamentId1 } = setupPublishedTournaments();

    const result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      activeTournamentId: tournamentId1,
      usePublishState: true,
    });

    expect(result.success).toEqual(true);
    expect(result.dateMatchUps).toBeDefined();
    expect(result.dateMatchUps.length).toBeGreaterThan(0);
  });

  it('without usePublishState, both tournaments matchUps returned regardless', () => {
    const { drawId1, drawId2 } = setupPublishedTournaments({
      publishEvent2: false,
      publishOOP2: false,
    });

    const result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
    });

    expect(result.success).toEqual(true);
    const drawIds = [...new Set(result.dateMatchUps.map((m) => m.drawId))];
    expect(drawIds).toContain(drawId1);
    expect(drawIds).toContain(drawId2);
  });

  it('published draw in tournament A, unpublished in tournament B — correct filtering', () => {
    const { drawId1, drawId2 } = setupPublishedTournaments({
      publishEvent2: false,
    });

    const result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
    });

    expect(result.success).toEqual(true);
    const drawIds = [...new Set(result.dateMatchUps.map((m) => m.drawId))];
    expect(drawIds).toContain(drawId1);
    expect(drawIds).not.toContain(drawId2);
  });

  it('cross-tournament contextFilters.drawIds — intersection with published drawIds', () => {
    const { drawId1, drawId2 } = setupPublishedTournaments();

    // contextFilters only includes drawId1
    const result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      contextFilters: { drawIds: [drawId1] },
      usePublishState: true,
    });

    expect(result.success).toEqual(true);
    const drawIds = [...new Set(result.dateMatchUps.map((m) => m.drawId))];
    expect(drawIds).toContain(drawId1);
    expect(drawIds).not.toContain(drawId2);
  });
});
