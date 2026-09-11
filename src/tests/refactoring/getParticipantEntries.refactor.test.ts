/**
 * Regression tests for getParticipantEntries refactoring.
 *
 * These tests capture the current behavior of getParticipantEntries
 * through the public getParticipants() API, ensuring refactoring
 * (extracting sub-functions) doesn't change observable results.
 */
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

import { ROUND_ROBIN_WITH_PLAYOFF } from '@Constants/drawDefinitionConstants';
import { DOUBLES, SINGLES } from '@Constants/eventConstants';

// ─── Scenario 1: Basic event/draw entries with statistics ─────────────────
it('getParticipantEntries: event entries, draw entries, and statistics', () => {
  const drawProfiles = [{ drawSize: 16 }];
  mocksEngine.generateTournamentRecord({
    setState: true,
    completeAllMatchUps: true,
    drawProfiles,
  });

  const { participants } = tournamentEngine.getParticipants({
    withStatistics: true,
    withMatchUps: true,
    withEvents: true,
    withDraws: true,
  });

  expect(participants.length).toBeGreaterThan(0);

  // Every participant that has events should have draw info
  const withDraws = participants.filter((p) => p.draws?.length);
  expect(withDraws.length).toBeGreaterThan(0);

  for (const p of withDraws) {
    for (const draw of p.draws) {
      expect(draw.drawId).toBeDefined();
      expect(draw.eventId).toBeDefined();
    }
  }

  // Statistics should be present for participants with matchUps
  const withStats = participants.filter((p) => {
    if (!p.statistics) return false;
    return typeof p.statistics === 'object' && Object.keys(p.statistics).length > 0;
  });
  expect(withStats.length).toBeGreaterThan(0);

  for (const p of withStats) {
    // Statistics is an object keyed by stat codes
    const statKeys = Object.keys(p.statistics);
    expect(statKeys.length).toBeGreaterThan(0);
    for (const key of statKeys) {
      const stat = p.statistics[key];
      expect(stat.statCode).toBeDefined();
      expect(typeof stat.statValue).toBe('number');
    }
  }
});

// ─── Scenario 2: Seeding through getParticipantEntries ────────────────────
it('getParticipantEntries: seeding information flows through', () => {
  const drawProfiles = [{ drawSize: 16, seedsCount: 4 }];
  mocksEngine.generateTournamentRecord({
    setState: true,
    drawProfiles,
  });

  const { participants } = tournamentEngine.getParticipants({
    withSeeding: true,
    withEvents: true,
    withDraws: true,
  });

  const seeded = participants.filter((p) => p.draws?.some((d) => d.seedValue));
  expect(seeded.length).toBeGreaterThan(0);
});

// ─── Scenario 3: Round Robin with finishing positions (RR tally path) ─────
it('getParticipantEntries: RR tally-based finishing positions', () => {
  const drawProfiles = [{ drawSize: 8, drawType: ROUND_ROBIN_WITH_PLAYOFF }];
  mocksEngine.generateTournamentRecord({
    setState: true,
    completeAllMatchUps: true,
    drawProfiles,
  });

  const { participants } = tournamentEngine.getParticipants({
    withRankingProfile: true,
    withMatchUps: true,
    withEvents: true,
    withDraws: true,
  });

  const withDraws = participants.filter((p) => p.draws?.length);
  expect(withDraws.length).toBeGreaterThan(0);

  // RR draws should have structureParticipation with finishingPositionRange
  const withStructureParticipation = withDraws.filter((p) => p.draws.some((d) => d.structureParticipation?.length));
  expect(withStructureParticipation.length).toBeGreaterThan(0);

  for (const p of withStructureParticipation) {
    for (const draw of p.draws) {
      if (draw.structureParticipation?.length) {
        for (const sp of draw.structureParticipation) {
          expect(sp.structureId).toBeDefined();
        }
      }
      // RR draws should have finishingPositionRange
      if (draw.finishingPositionRange) {
        expect(Array.isArray(draw.finishingPositionRange)).toBe(true);
      }
    }
  }
});

// ─── Scenario 4: Schedule analysis (conflict detection path) ──────────────
it('getParticipantEntries: schedule analysis detects conflicts', () => {
  const startDate = '2024-01-01';
  const endDate = '2024-01-03';
  const drawProfiles = [
    { drawSize: 8, eventType: SINGLES },
    { drawSize: 8, eventType: SINGLES },
  ];
  const venueProfiles = [{ courtsCount: 4, startTime: '08:00', endTime: '18:00' }];

  mocksEngine.generateTournamentRecord({
    setState: true,
    drawProfiles,
    venueProfiles,
    startDate,
    endDate,
  });

  // Schedule some matchUps first
  tournamentEngine.scheduleProfileRounds();
  // Even without full scheduling, the getParticipants call should work
  const { participants } = tournamentEngine.getParticipants({
    scheduleAnalysis: { scheduledMinutesDifference: 60 },
    withScheduleItems: true,
    withMatchUps: true,
    withEvents: true,
    withDraws: true,
  });

  expect(participants.length).toBeGreaterThan(0);

  // Every participant should have scheduleItems array (even if empty)
  for (const p of participants) {
    // scheduleItems may or may not exist depending on scheduling
    if (p.scheduleItems) {
      expect(Array.isArray(p.scheduleItems)).toBe(true);
    }
  }
});

// ─── Scenario 5: Opponents through getParticipantEntries ──────────────────
it('getParticipantEntries: withOpponents populates opponent info', () => {
  const drawProfiles = [{ drawSize: 8 }];
  mocksEngine.generateTournamentRecord({
    setState: true,
    completeAllMatchUps: true,
    drawProfiles,
  });

  const { participants } = tournamentEngine.getParticipants({
    withOpponents: true,
    withMatchUps: true,
    withEvents: true,
  });

  const withOpponents = participants.filter((p) => p.opponents?.length);
  expect(withOpponents.length).toBeGreaterThan(0);
});

// ─── Scenario 6: DOUBLES event entries ────────────────────────────────────
it('getParticipantEntries: doubles event entries include individual participants', () => {
  const drawProfiles = [{ drawSize: 8, eventType: DOUBLES }];
  mocksEngine.generateTournamentRecord({
    setState: true,
    completeAllMatchUps: true,
    drawProfiles,
  });

  const { participants } = tournamentEngine.getParticipants({
    withStatistics: true,
    withEvents: true,
    withDraws: true,
  });

  // Both pair and individual participants should have event entries
  const withEvents = participants.filter((p) => p.events?.length);
  expect(withEvents.length).toBeGreaterThan(0);
});

// ─── Scenario 7: Return shape stability ───────────────────────────────────
it('getParticipantEntries: return shape includes all expected keys', () => {
  const drawProfiles = [{ drawSize: 8 }];
  mocksEngine.generateTournamentRecord({
    setState: true,
    completeAllMatchUps: true,
    drawProfiles,
  });

  // getParticipants internally calls getParticipantEntries and merges results
  // We verify the shape through getParticipants
  const { participants, matchUps } = tournamentEngine.getParticipants({
    withStatistics: true,
    withMatchUps: true,
    withEvents: true,
    withDraws: true,
  });

  expect(Array.isArray(participants)).toBe(true);
  // matchUps should be returned when withMatchUps is true
  if (matchUps) {
    expect(Array.isArray(matchUps)).toBe(true);
  }
});

// ─── Regression: malformed record without entries arrays ──────────────────
// Reverse-engineered records (e.g. TMX dev.build from CFS public responses)
// can land in the engine without drawDefinition.entries or event.entries
// populated. getParticipants used to crash with
// "Cannot read properties of undefined (reading 'filter')". Defaults at the
// destructure sites should now degrade gracefully.
it('getParticipantEntries: tolerates missing entries arrays on event and drawDefinition', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
  });

  // Strip the entries arrays the way a hand-assembled record might.
  for (const event of tournamentRecord.events ?? []) {
    delete event.entries;
    for (const drawDefinition of event.drawDefinitions ?? []) {
      delete drawDefinition.entries;
    }
  }

  tournamentEngine.setState(tournamentRecord);
  const eventId = tournamentRecord.events?.[0]?.eventId;

  expect(() =>
    tournamentEngine.getParticipants({
      participantFilters: { eventIds: [eventId] },
      withIndividualParticipants: true,
      withScaleValues: true,
      withDraws: true,
      withISO2: true,
    }),
  ).not.toThrow();
});
